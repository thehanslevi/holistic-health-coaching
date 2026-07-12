import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth";
import { pendingRuns } from "@/lib/analytics";
import { getOrCreateDailyBrief } from "@/lib/brief";
import { supabase } from "@/lib/supabase";
import type { LogRow } from "@/lib/types";
import { sendPushToAll, type PushPayload } from "@/lib/push";

// Daily morning push. Triggered by Vercel Cron (see vercel.json). Composes the
// notification from the coach's brief + any pending run-scoring reminder, then
// fans it out to every stored subscription.
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We also accept
// the app passcode (?key= or bearer) so the send can be triggered/tested by hand.

function authorize(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  const queryToken = req.nextUrl.searchParams.get("key") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const passcode = process.env.APP_PASSCODE;
  if (cronSecret && token === cronSecret) return true;
  if (passcode && (token === passcode || queryToken === passcode)) return true;
  return false;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ?test=1 → a quick confirmation push (no brief generation), for the
    // "Test" button in the opt-in control.
    if (req.nextUrl.searchParams.get("test") === "1") {
      const result = await sendPushToAll({
        title: "Volt — morning coach on",
        body: "This is a test. Your morning brief lands here at 8 AM.",
        url: "/",
        tag: "test",
      });
      return NextResponse.json({ test: true, ...result });
    }

    const db = supabase();
    const since = new Date();
    since.setDate(since.getDate() - 35);
    const sinceISO = since.toISOString().slice(0, 10);

    const logsRes = await db
      .from("hrl_logs")
      .select("*")
      .gte("logged_at", sinceISO)
      .order("logged_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    const logs = (logsRes.data ?? []) as LogRow[];

    const pending = pendingRuns(logs);
    // The brief is the single interpretive voice now — it reasons from live
    // context (run traffic light, orthopedic status, analysis) and raises any
    // real concern in-voice. No separate rule-based signal layer to prepend.
    const { content: brief } = await getOrCreateDailyBrief();

    const parts: string[] = [];
    if (brief) parts.push(brief);
    if (pending.length) {
      const r = pending[0];
      parts.push(`Reminder: log next-morning scores for your ${r.dist || ""} mi run.`.replace("  ", " "));
    }
    const body = parts.join("\n\n").trim() ||
      "Open Volt to check in and see today's plan.";

    const dow = WEEKDAYS[new Date().getDay()];
    const payload: PushPayload = {
      title: `Coach · ${dow} morning`,
      body,
      url: "/",
      tag: "morning-brief",
    };

    // ?dry=1 → build the payload but don't send (for inspecting content).
    if (req.nextUrl.searchParams.get("dry") === "1") {
      return NextResponse.json({ dryRun: true, payload, pending: pending.length });
    }

    const result = await sendPushToAll(payload);
    return NextResponse.json({ ...result, payload });
  } catch (e) {
    return errorResponse(e);
  }
}
