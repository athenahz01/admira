import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

const subjectHeader = "x-fitty-subject-id";

export function outcomeCaptureEnabled() {
  return process.env.FITTY_OUTCOME_CAPTURE_ENABLED === "true";
}

export function captureDisabledResponse() {
  return NextResponse.json(
    { error: "Outcome capture is disabled." },
    { status: 404 },
  );
}

export async function subjectIdFromRequest(request: Request) {
  const allowUnsigned =
    process.env.FITTY_CAPTURE_ALLOW_UNSIGNED_SUBJECT === "true" &&
    process.env.NODE_ENV !== "production";

  if (allowUnsigned) {
    const subjectId = request.headers.get(subjectHeader);
    if (!subjectId) {
      throw new Error(`Missing ${subjectHeader}.`);
    }
    return subjectId;
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) {
    throw new Error("Missing Supabase user bearer token.");
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Invalid Supabase user bearer token.");
  }

  return data.user.id;
}

export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export async function writeAccessLog(
  subjectId: string,
  action:
    | "consent_recorded"
    | "profile_created"
    | "outcome_created"
    | "exported"
    | "deleted"
    | "consent_revoked",
  rowCount: number,
  reason: string,
) {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from("data_access_logs").insert({
    subject_id: subjectId,
    action,
    row_count: rowCount,
    reason,
  });
}

export function errorResponse(error: unknown, status = 400) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Request failed." },
    { status },
  );
}
