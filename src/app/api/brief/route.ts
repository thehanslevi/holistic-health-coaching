import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { getOrCreateDailyBrief } from "@/lib/brief";

// The coach's morning brief. Cached per (date, readiness) — see lib/brief.ts.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { content, cached } = await getOrCreateDailyBrief();
    return NextResponse.json({ content, cached });
  } catch (e) {
    return errorResponse(e);
  }
}
