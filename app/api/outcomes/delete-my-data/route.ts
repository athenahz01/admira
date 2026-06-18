import { NextResponse } from "next/server";

import {
  deleteSubjectOutcomeData,
  type SupabaseSubjectDataClient,
} from "@/lib/outcomes/delete-subject-data";
import {
  captureDisabledResponse,
  errorResponse,
  outcomeCaptureEnabled,
  subjectIdFromRequest,
  writeAccessLog,
} from "@/lib/outcomes/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export async function DELETE(request: Request) {
  if (!outcomeCaptureEnabled()) {
    return captureDisabledResponse();
  }

  try {
    const subjectId = await subjectIdFromRequest(request);
    const supabase = createSupabaseServiceRoleClient();

    const deleted = await deleteSubjectOutcomeData(
      supabase as unknown as SupabaseSubjectDataClient,
      subjectId,
      (deletedSubjectId, rowCount, reason) =>
        writeAccessLog(deletedSubjectId, "deleted", rowCount, reason),
    );

    return NextResponse.json({ deleted });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
