import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { getOrCreateDailyBrief } from "@/lib/brief";

// The coach's morning brief. Cached per (date, readiness) — see lib/brief.ts.
// ?refresh=1 forces regeneration, mirroring /api/review.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    const { content, cached, inputs } = await getOrCreateDailyBrief(refresh);
    return NextResponse.json({ content, cached, inputs });
  } catch (e) {
    return errorResponse(e);
  }
}
