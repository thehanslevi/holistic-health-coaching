import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// PATCH → edit text, flip active/resolved, or change kind. DELETE → remove.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/profile/[id]">) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body?.text === "string") patch.text = body.text.trim();
    if (body?.status === "active" || body?.status === "resolved") patch.status = body.status;
    if (["priority", "constraint", "note"].includes(body?.kind)) patch.kind = body.kind;
    const { data, error } = await supabase()
      .from("hrl_profile")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/profile/[id]">) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await ctx.params;
    const { error } = await supabase().from("hrl_profile").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
