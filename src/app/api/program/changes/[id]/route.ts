import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { revertProgramChange } from "@/lib/program-server";

// Undo a program change. Point-in-time: restores the program to how it stood
// before this change, so anything stacked on top of it goes too. The UI says so
// rather than pretending a single edit can be cherry-picked out of a sequence.
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/program/changes/[id]">,
) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await ctx.params;
    const result = await revertProgramChange(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, summary: result.summary });
  } catch (e) {
    return errorResponse(e);
  }
}
