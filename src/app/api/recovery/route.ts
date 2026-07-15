import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/day";

const FIELDS = ["fueled", "post_run_protocol", "vipassana", "sleep_quality", "note"] as const;

export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { searchParams } = new URL(req.url);
    const since = searchParams.get("since");
    let q = supabase()
      .from("hrl_recovery")
      .select("*")
      .order("date", { ascending: false })
      .limit(60);
    if (since) q = q.gte("date", since);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}

// Partial upsert by date — only provided fields are written.
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const date = (body?.date as string) || todayISO();
    const row: Record<string, unknown> = { date, updated_at: new Date().toISOString() };
    for (const f of FIELDS) if (body?.[f] !== undefined) row[f] = body[f];
    const { data, error } = await supabase()
      .from("hrl_recovery")
      .upsert(row, { onConflict: "date" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
