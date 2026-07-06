import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  // Passcode probe from the unlock screen: succeed without touching the DB so
  // the gate works even before Supabase is configured.
  const { searchParams } = new URL(req.url);
  if (searchParams.get("probe")) return NextResponse.json({ ok: true });

  try {
    const since = searchParams.get("since");
    let query = supabase()
      .from("hrl_checkins")
      .select("*")
      .order("date", { ascending: false })
      .limit(60);
    if (since) query = query.gte("date", since);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { date, readiness, note } = await req.json();
    if (!date || !readiness) {
      return NextResponse.json({ error: "date and readiness required" }, { status: 400 });
    }
    const { data, error } = await supabase()
      .from("hrl_checkins")
      .upsert({ date, readiness, note: note ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
