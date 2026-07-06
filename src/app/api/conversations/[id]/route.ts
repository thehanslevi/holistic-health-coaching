import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/conversations/[id]">,
) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await ctx.params;
    const { data, error } = await supabase()
      .from("hrl_messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/conversations/[id]">,
) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await ctx.params;
    const { error } = await supabase().from("hrl_conversations").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
