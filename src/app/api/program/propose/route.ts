import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { computeProposals } from "@/lib/progression";
import { supabase } from "@/lib/supabase";

// On-demand: coach reviews recent performance vs current targets and proposes
// changes. The derivation lives in lib/progression so the scheduled recalibration
// (workstream #1) uses the exact same logic.
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const proposals = await computeProposals(supabase());
    return NextResponse.json({ proposals });
  } catch (e) {
    return errorResponse(e);
  }
}
