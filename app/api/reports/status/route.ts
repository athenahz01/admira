import { NextResponse } from "next/server";

import { reportsEnabled } from "@/lib/report/server";

export async function GET() {
  return NextResponse.json({ enabled: reportsEnabled() });
}
