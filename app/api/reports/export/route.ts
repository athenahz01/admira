import { NextResponse } from "next/server";

import { redactReportForShare, renderReportPdf, type AdmiraReport } from "@/lib/report";
import { reportsEnabled } from "@/lib/report/server";
import { hashReportShareToken } from "@/lib/report/share";
import { formatValidationError, reportExportRequestSchema } from "@/lib/report/schema";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

async function reportFromToken(token: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("report_shares")
    .select("report_payload,revoked_at")
    .eq("token_hash", hashReportShareToken(token))
    .maybeSingle();

  if (error || !data || data.revoked_at) {
    throw new Error("Report not found.");
  }

  return redactReportForShare(data.report_payload as AdmiraReport);
}

export async function POST(request: Request) {
  if (!reportsEnabled()) {
    return NextResponse.json(
      { error: "Admira Reports are not enabled." },
      { status: 404 },
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

  const parsed = reportExportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

  let report: AdmiraReport;
  try {
    report = parsed.data.token
      ? await reportFromToken(parsed.data.token)
      : redactReportForShare(parsed.data.report as AdmiraReport);
  } catch {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const pdf = renderReportPdf(report);
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="admira-report.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
