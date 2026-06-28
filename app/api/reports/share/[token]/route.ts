import { NextResponse } from "next/server";

import { redactReportForShare, type AdmiraReport } from "@/lib/report";
import { reportsEnabled } from "@/lib/report/server";
import { hashReportShareToken } from "@/lib/report/share";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!reportsEnabled()) {
    return NextResponse.json(
      { error: "Admira Reports are not enabled." },
      { status: 404 },
    );
  }

  const { token } = await context.params;
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
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

  const { data, error } = await supabase
    .from("report_shares")
    .select("report_payload,revoked_at")
    .eq("token_hash", hashReportShareToken(token))
    .maybeSingle();

  if (error || !data || data.revoked_at) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  return NextResponse.json({
    report: redactReportForShare(data.report_payload as AdmiraReport),
  });
}
