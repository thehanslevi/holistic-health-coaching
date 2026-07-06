import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { data, error } = await supabase()
      .from("hrl_program_overrides")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}

// Upsert one exercise override (new target and/or note). Clearing target to
// null is allowed (revert to program default).
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { exercise_id, target, note } = await req.json();
    if (!exercise_id) {
      return NextResponse.json({ error: "exercise_id required" }, { status: 400 });
    }
    const { data, error } = await supabase()
      .from("hrl_program_overrides")
      .upsert(
        { exercise_id, target: target ?? null, note: note ?? null, updated_at: new Date().toISOString() },
        { onConflict: "exercise_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
