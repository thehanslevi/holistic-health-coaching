import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { deriveCycleState, type CycleDay } from "@/lib/cycle";
import { supabase } from "@/lib/supabase";

// GET → derived cycle state (phase, ~day, approximate) plus recent period days.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const since = new Date();
    since.setDate(since.getDate() - 180);
    const { data, error } = await supabase()
      .from("hrl_cycle")
      .select("date, is_period, flow")
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: true });
    if (error) throw new Error(error.message);
    const days = (data ?? []) as CycleDay[];
    return NextResponse.json({ state: deriveCycleState(days), days });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST → manually log a period day (safety net / future in-app one-tap).
// Body: { date?, is_period?, flow? }. Defaults to a bleeding day today.
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json().catch(() => ({}));
    const date = (body?.date as string) || new Date().toISOString().slice(0, 10);
    const row = {
      date,
      is_period: body?.is_period ?? true,
      flow: (body?.flow as string) ?? "logged",
      source: "manual",
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase().from("hrl_cycle").upsert(row, { onConflict: "date" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, date });
  } catch (e) {
    return errorResponse(e);
  }
}
