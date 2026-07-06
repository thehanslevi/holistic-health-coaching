import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/logs/[id]">,
) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await ctx.params;
    const { error } = await supabase().from("hrl_logs").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// Merge a partial patch into a log's JSON payload (e.g. next-morning run scores).
export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/logs/[id]">,
) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await ctx.params;
    const patch = (await req.json())?.data;
    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ error: "data patch required" }, { status: 400 });
    }
    const db = supabase();
    const { data: existing, error: readErr } = await db
      .from("hrl_logs")
      .select("data")
      .eq("id", id)
      .single();
    if (readErr) throw new Error(readErr.message);

    const merged = { ...(existing.data as object), ...patch };
    const { data, error } = await db
      .from("hrl_logs")
      .update({ data: merged })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
