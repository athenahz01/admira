import { NextResponse } from "next/server";
import { z } from "zod";

import {
  captureDisabledResponse,
  errorResponse,
  outcomeCaptureEnabled,
  readJsonBody,
  subjectIdFromRequest,
  writeAccessLog,
} from "@/lib/outcomes/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

const revokeConsentSchema = z
  .object({
    consent_record_id: z.string().uuid(),
  })
  .strict();

export async function POST(request: Request) {
  if (!outcomeCaptureEnabled()) {
    return captureDisabledResponse();
  }

  try {
    const subjectId = await subjectIdFromRequest(request);
    const parsed = revokeConsentSchema.parse(await readJsonBody(request));
    const supabase = createSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from("consent_records")
      .update({ revoked_at: new Date().toISOString() })
      .eq("subject_id", subjectId)
      .eq("id", parsed.consent_record_id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await writeAccessLog(
      subjectId,
      "consent_revoked",
      1,
      "subject revoked future real-outcome modeling consent",
    );

    return NextResponse.json({ consent_record: data });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
