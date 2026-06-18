import { NextResponse } from "next/server";

import {
  applicationOutcomeSchema,
  assertNoForbiddenDemographicKeys,
} from "@/lib/outcomes/schemas";
import {
  captureDisabledResponse,
  errorResponse,
  outcomeCaptureEnabled,
  readJsonBody,
  subjectIdFromRequest,
  writeAccessLog,
} from "@/lib/outcomes/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  if (!outcomeCaptureEnabled()) {
    return captureDisabledResponse();
  }

  try {
    const subjectId = await subjectIdFromRequest(request);
    const body = await readJsonBody(request);
    assertNoForbiddenDemographicKeys(body);
    const parsed = applicationOutcomeSchema.parse(body);
    const supabase = createSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from("application_outcomes")
      .insert({
        ...parsed,
        subject_id: subjectId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await writeAccessLog(
      subjectId,
      "outcome_created",
      1,
      "subject created a consented school application outcome",
    );

    return NextResponse.json({ application_outcome: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
