import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { buildWeeklyShareText } from "@/lib/share";

// Plain-text weekly report (logs + coach's weekly review) to hand a coach or PT.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { text, week } = await buildWeeklyShareText();
    return NextResponse.json({ text, week });
  } catch (e) {
    return errorResponse(e);
  }
}
