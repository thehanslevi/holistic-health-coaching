import { NextRequest, NextResponse } from "next/server";
import { SupabaseConfigError } from "@/lib/supabase";

// No auth. Hannah removed the passcode gate on 2026-09-02 — she's the only
// user, and she'd rather the app be openly reachable than type a code. Kept as
// a function so every route keeps its `checkAuth` call site: if a gate ever
// comes back, this is the one place it goes. The cron routes carry their own
// CRON_SECRET check and are unaffected.
export function checkAuth(_req: NextRequest): NextResponse | null {
  void _req;
  return null;
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof SupabaseConfigError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  const message = e instanceof Error ? e.message : "Unexpected server error";
  return NextResponse.json({ error: message }, { status: 500 });
}
