import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ProfileKind } from "@/lib/types";

// The living profile Hannah maintains herself — her current priorities and
// constraints. It's authoritative and current; the coach treats it as
// overriding anything older baked into the static profile. See coach-context.

export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { data, error } = await supabase()
      .from("hrl_profile")
      .select("*")
      .order("status", { ascending: true }) // active before resolved
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (e) {
    return errorResponse(e);
  }
}

const KINDS: ProfileKind[] = ["priority", "constraint", "note"];

export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const text = (body?.text as string)?.trim();
    if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });
    const kind: ProfileKind = KINDS.includes(body?.kind) ? body.kind : "note";
    const { data, error } = await supabase()
      .from("hrl_profile")
      .insert({ kind, text })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
