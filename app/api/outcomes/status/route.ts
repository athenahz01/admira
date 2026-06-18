import { NextResponse } from "next/server";

import { outcomeCaptureEnabled } from "@/lib/outcomes/server";

export async function GET() {
  return NextResponse.json({ enabled: outcomeCaptureEnabled() });
}
