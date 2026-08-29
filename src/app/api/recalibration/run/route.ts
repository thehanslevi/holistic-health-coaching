import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth";
import { recomputeAndPersist } from "@/lib/progression";
import { sendPushToAll } from "@/lib/push";
import { buildRecalibration } from "@/lib/recalibration";
import { supabase } from "@/lib/supabase";

// Workstream #5 — the monthly trigger. Runs on a Vercel Cron (1st of the month):
// re-derives baselines so they're fresh, assembles the checklist, and — if
// anything has drifted — pushes a single reminder to go confirm it. A clean
// month (nothing drifted) sends nothing rather than a hollow "all good" ping.
//
// Auth mirrors the other cron routes: Vercel Cron bearer (CRON_SECRET) or the
// app passcode.
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
    const db = supabase();
    // Freshen baselines first so the checklist reflects the latest logs.
    await recomputeAndPersist(db);
    const recal = await buildRecalibration(db);

    const dry = req.nextUrl.searchParams.get("dry") === "1";
    let pushed = false;
    if (recal.count > 0 && !dry) {
      const bits: string[] = [];
      if (recal.baselines.length) bits.push(`${recal.baselines.length} lift ${recal.baselines.length === 1 ? "change" : "changes"} earned`);
      if (recal.drift.length) bits.push(`${recal.drift.length} to reconcile`);
      if (recal.stale_profile.length) bits.push(`${recal.stale_profile.length} to confirm`);
      await sendPushToAll({
        title: "Monthly recalibration",
        body: `${bits.join(" · ")}. A few taps to bring your program current.`,
        url: "/?tab=progress",
      });
      pushed = true;
    }

    return NextResponse.json({ ok: true, count: recal.count, pushed, recal });
  } catch (e) {
    return errorResponse(e);
  }
}
