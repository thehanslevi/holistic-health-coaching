import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth";
import { recomputeAndPersist } from "@/lib/progression";
import { supabase } from "@/lib/supabase";

// Workstream #1 — self-updating baselines. Runs on a weekly Vercel Cron: it
// re-reads recent logged performance, recomputes progression proposals, and
// persists them as the live "pending" set so the athlete is offered earned
// changes proactively instead of having to go hunt for them. Nothing is applied
// automatically — each proposal still needs her one-tap confirm.
//
// Auth mirrors the push sender: Vercel Cron bearer (CRON_SECRET) or app passcode.
function authorize(req: NextRequest): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const queryToken = req.nextUrl.searchParams.get("key") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const passcode = process.env.APP_PASSCODE;
  if (cronSecret && token === cronSecret) return true;
  if (passcode && (token === passcode || queryToken === passcode)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const proposals = await recomputeAndPersist(supabase());
    return NextResponse.json({ ok: true, count: proposals.length, proposals });
  } catch (e) {
    return errorResponse(e);
  }
}
