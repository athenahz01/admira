import { NextResponse } from "next/server";

import type { CopilotToolInputs } from "@/lib/copilot";
import type { CommandCenterDeadline, CommandCenterDocument, CommandCenterProgramRequirement, CommandCenterRequirementStatus, CommandCenterSchool } from "@/lib/command-center";
import type { CompassCareer, CompassMajor } from "@/lib/compass";
import type { ListCandidate } from "@/lib/list-builder";
import type { InferenceSchool } from "@/lib/model/inference";
import { assertNoForbiddenDemographicKeys } from "@/lib/outcomes/schemas";
import { buildReportFromInputs, redactReportForShare } from "@/lib/report";
import { reportsEnabled } from "@/lib/report/server";
import { createReportShareToken, hashReportShareToken, reportSharePath } from "@/lib/report/share";
import { formatValidationError, reportRequestSchema, type ReportRequestInput } from "@/lib/report/schema";
import { studentsLikeYouResponse } from "@/lib/similarity";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RateBucket = { count: number; resetAt: number };

const RATE_LIMIT = 16;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, RateBucket>();

type SimilarityRows = Parameters<typeof studentsLikeYouResponse>[0]["rows"];

function requesterKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

function checkRateLimit(request: Request) {
  const key = requesterKey(request);
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT) {
    return false;
  }
  current.count += 1;
  return true;
}

async function requireSubjectId(
  request: Request,
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Invalid bearer token.");
  }

  return data.user.id;
}

function buildToolInputs(parsed: ReportRequestInput): CopilotToolInputs {
  const schools = parsed.schools as InferenceSchool[];
  const primarySchool = schools[0];
  const profile = parsed.profile;
  const toolInputs: CopilotToolInputs = {};

  if (primarySchool && profile) {
    toolInputs.admit_intelligence = {
      school: primarySchool,
      input: {
        unitid: primarySchool.unitid,
        sat_score: profile.sat_score,
        act_score: profile.act_score,
        gpa: profile.gpa,
        application_round: profile.application_round,
        intended_major: profile.intended_major,
        activity_context: profile.activity_context,
      },
    };
  }

  if (schools.length > 0 && profile) {
    toolInputs.climb_roadmap = {
      profile: {
        sat_score: profile.sat_score,
        act_score: profile.act_score,
        gpa: profile.gpa,
        application_round: profile.application_round,
        intended_major: profile.intended_major,
        activity_context: profile.activity_context,
      },
      schools,
    };
    toolInputs.list_builder = {
      profile: {
        sat_score: profile.sat_score,
        act_score: profile.act_score,
        gpa: profile.gpa,
        application_round: profile.application_round,
      },
      preferences: {
        intended_major: profile.intended_major,
        interests: parsed.interests,
      },
      candidates: schools.map((school) => ({
        ...school,
        country:
          school && "country" in school && typeof school.country === "string"
            ? school.country
            : "US",
      })) as ListCandidate[],
    };
  }

  const commandContext = parsed.tool_context?.command_center;
  if (commandContext) {
    toolInputs.command_center = {
      schools: commandContext.schools as CommandCenterSchool[],
      programRequirements:
        commandContext.program_requirements as CommandCenterProgramRequirement[],
      deadlines: commandContext.deadlines as CommandCenterDeadline[],
      statuses: commandContext.statuses as CommandCenterRequirementStatus[] | undefined,
      documents: commandContext.documents as CommandCenterDocument[] | undefined,
    };
  }

  const compassContext = parsed.tool_context?.compass;
  if (compassContext) {
    toolInputs.major_compass = {
      majors: compassContext.majors as CompassMajor[],
      careers: compassContext.careers as CompassCareer[],
      studentInterests: compassContext.student_interests,
      majorSimilarity: compassContext.major_similarity,
      school: (compassContext.school ?? primarySchool) as InferenceSchool | undefined,
      profile: profile
        ? {
            sat_score: profile.sat_score,
            act_score: profile.act_score,
            gpa: profile.gpa,
            application_round: profile.application_round,
          }
        : undefined,
    };
  }

  const similarContext = parsed.tool_context?.students_like_you;
  if (similarContext) {
    toolInputs.students_like_you = {
      rows: similarContext.rows as SimilarityRows,
      model: similarContext.model,
      dim: similarContext.dim,
    };
  }

  return toolInputs;
}

export async function POST(request: Request) {
  if (!reportsEnabled()) {
    return NextResponse.json(
      { error: "Admira Reports are not enabled." },
      { status: 404 },
    );
  }

  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: "Too many report requests. Try again in a minute." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  try {
    assertNoForbiddenDemographicKeys(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forbidden key." },
      { status: 400 },
    );
  }

  const parsed = reportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

  const { report, results } = buildReportFromInputs({
    title: parsed.data.title,
    toolInputs: buildToolInputs(parsed.data),
  });

  if (!parsed.data.share) {
    return NextResponse.json({ report, tool_results: results });
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Supabase configuration is missing.",
      },
      { status: 500 },
    );
  }

  let subjectId: string;
  try {
    subjectId = await requireSubjectId(request, supabase);
  } catch {
    return NextResponse.json(
      { error: "A signed-in owner is required to create a share link." },
      { status: 401 },
    );
  }

  const token = createReportShareToken();
  const reportPayload = redactReportForShare(report);
  const { error } = await supabase.from("report_shares").insert({
    subject_id: subjectId,
    token_hash: hashReportShareToken(token),
    report_payload: reportPayload,
  });

  if (error) {
    return NextResponse.json(
      { error: "Unable to create report share link." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    report: reportPayload,
    share_url: new URL(reportSharePath(token), request.url).toString(),
  });
}
