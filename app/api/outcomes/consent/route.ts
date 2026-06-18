import { NextResponse } from "next/server";

import {
  assertNoForbiddenDemographicKeys,
  consentSchema,
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
    const parsed = consentSchema.parse(body);
    const supabase = createSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from("consent_records")
      .insert({
        subject_id: subjectId,
        consent_version: parsed.consent_version,
        consent_text: parsed.consent_text,
        purpose: parsed.purpose,
        revoked_at: null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await writeAccessLog(
      subjectId,
      "consent_recorded",
      1,
      "subject consented to real-outcome modeling data capture",
    );

    return NextResponse.json({ consent_record: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
