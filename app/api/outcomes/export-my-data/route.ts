import { NextResponse } from "next/server";

import {
  captureDisabledResponse,
  errorResponse,
  outcomeCaptureEnabled,
  subjectIdFromRequest,
  writeAccessLog,
} from "@/lib/outcomes/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  if (!outcomeCaptureEnabled()) {
    return captureDisabledResponse();
  }

  try {
    const subjectId = await subjectIdFromRequest(request);
    const supabase = createSupabaseServiceRoleClient();

    const [consentRecords, applicantProfiles, applicationOutcomes] =
      await Promise.all([
        supabase.from("consent_records").select("*").eq("subject_id", subjectId),
        supabase.from("applicant_profiles").select("*").eq("subject_id", subjectId),
        supabase.from("application_outcomes").select("*").eq("subject_id", subjectId),
      ]);

    for (const result of [consentRecords, applicantProfiles, applicationOutcomes]) {
      if (result.error) {
        throw new Error(result.error.message);
      }
    }

    const rowCount =
      (consentRecords.data?.length ?? 0) +
      (applicantProfiles.data?.length ?? 0) +
      (applicationOutcomes.data?.length ?? 0);

    await writeAccessLog(
      subjectId,
      "exported",
      rowCount,
      "subject exported consented modeling data",
    );

    const { data: dataAccessLogs, error } = await supabase
      .from("data_access_logs")
      .select("*")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      consent_records: consentRecords.data ?? [],
      applicant_profiles: applicantProfiles.data ?? [],
      application_outcomes: applicationOutcomes.data ?? [],
      data_access_logs: dataAccessLogs ?? [],
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
