import { NextResponse } from "next/server";

import { copilotConfigured, copilotEnabled, copilotModel } from "@/lib/copilot/server";

export async function GET() {
  return NextResponse.json({
    enabled: copilotEnabled(),
    configured: copilotConfigured(),
    model: copilotModel(),
  });
}
