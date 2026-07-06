import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const since = searchParams.get("since");
    const kind = searchParams.get("kind");

    let query = supabase()
      .from("hrl_logs")
      .select("*")
      .order("logged_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (since) query = query.gte("logged_at", since);
    if (kind) query = query.eq("kind", kind);

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
    const body = await req.json();
    const { logged_at, kind, session_key, data } = body ?? {};
    if (!logged_at || !kind || !data) {
      return NextResponse.json(
        { error: "logged_at, kind, and data are required" },
        { status: 400 },
      );
    }
    const { data: row, error } = await supabase()
      .from("hrl_logs")
      .insert({ logged_at, kind, session_key: session_key ?? null, data })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
