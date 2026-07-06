import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Remove an override → the exercise reverts to its program default.
export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/program/[id]">,
) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await ctx.params;
    const { error } = await supabase()
      .from("hrl_program_overrides")
      .delete()
      .eq("exercise_id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
