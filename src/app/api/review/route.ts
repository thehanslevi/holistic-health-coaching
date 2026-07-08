import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { getOrCreateWeeklyReview } from "@/lib/review";

// Coach-written weekly review, cached per week. ?refresh=1 forces regeneration.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    const { content, week, cached, empty } = await getOrCreateWeeklyReview(refresh);
    return NextResponse.json({ content, week, cached, empty });
  } catch (e) {
    return errorResponse(e);
  }
}
