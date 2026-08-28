import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Persisted progression proposals (workstream #1). GET returns the live pending
// set (proactively surfaced on Today / in the progression review). PATCH resolves
// one: "applied" once its target has been written as an override, or "dismissed".
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { data, error } = await supabase()
      .from("hrl_proposals")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json().catch(() => ({}));
    const id = body?.id as string | undefined;
    const status = body?.status as string | undefined;
    if (!id || (status !== "applied" && status !== "dismissed")) {
      return NextResponse.json({ error: "id and status (applied|dismissed) required" }, { status: 400 });
    }
    const { error } = await supabase()
      .from("hrl_proposals")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
