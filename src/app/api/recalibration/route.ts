import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { buildRecalibration } from "@/lib/recalibration";
import { supabase } from "@/lib/supabase";

// Workstream #5 — the monthly recalibration checklist, assembled live from
// pending baseline proposals, stale profile entries, and program-vs-log drift.
// Read-only; every item is resolved through its own existing endpoint (apply a
// proposal → override, confirm/resolve a profile entry, accept drift → target).
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const recal = await buildRecalibration(supabase());
    return NextResponse.json(recal);
  } catch (e) {
    return errorResponse(e);
  }
}
