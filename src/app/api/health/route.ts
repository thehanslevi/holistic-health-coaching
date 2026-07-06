import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const NUM_FIELDS = ["sleep_hours", "steps", "resting_hr", "hrv", "active_energy"] as const;

export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { data, error } = await supabase()
      .from("hrl_health")
      .select("*")
      .order("date", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}

// Upsert one day's metrics. Sent by the iOS "HRL Sync" shortcut each morning.
// Only the fields present in the body are written, so partial pushes are safe.
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const date = (body?.date as string) || new Date().toISOString().slice(0, 10);
    const row: Record<string, unknown> = { date, source: body?.source || "shortcut", updated_at: new Date().toISOString() };
    for (const f of NUM_FIELDS) {
      if (body?.[f] !== undefined && body[f] !== null && body[f] !== "") {
        const n = Number(body[f]);
        if (!Number.isNaN(n)) row[f] = n;
      }
    }
    const { data, error } = await supabase()
      .from("hrl_health")
      .upsert(row, { onConflict: "date" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
