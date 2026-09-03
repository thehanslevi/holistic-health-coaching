import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// The sync's own health: when the phone last reached us at all, and when it
// last landed data. Lets Today distinguish "the phone hasn't tried since X"
// (an iOS / Health Auto Export scheduling problem) from "it tried and we
// rejected it" (our problem) — the two need completely different fixes.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const db = supabase();
    const [lastAny, lastOk, recent] = await Promise.all([
      db.from("hrl_sync_events").select("created_at, status, ok, error").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("hrl_sync_events").select("created_at, health_dates, source").eq("ok", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("hrl_sync_events").select("created_at, status, ok, health_count, error").order("created_at", { ascending: false }).limit(10),
    ]);
    return NextResponse.json({
      last_attempt: lastAny.data ?? null,
      last_success: lastOk.data ?? null,
      recent: recent.data ?? [],
    });
  } catch (e) {
    return errorResponse(e);
  }
}
