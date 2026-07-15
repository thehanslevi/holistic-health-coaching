import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Phase } from "@/lib/types";
import { todayISO } from "@/lib/day";

type OverrideSnap = { exercise_id: string; target: string | null; note: string | null };

// PATCH → edit phase metadata, or { activate: true } to make it the active plan
// (swap). Swapping restores that phase's snapshotted working targets.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/phases/[id]">) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const db = supabase();

    if (body?.activate === true) {
      const { data: target } = await db.from("hrl_phases").select("*").eq("id", id).maybeSingle();
      const phase = target as Phase | null;
      if (!phase) return NextResponse.json({ error: "Phase not found." }, { status: 404 });

      if (phase.status !== "active") {
        // Archive the currently-active phase, snapshotting its live targets.
        const { data: cur } = await db
          .from("hrl_phases")
          .select("*")
          .eq("status", "active")
          .maybeSingle();
        const active = cur as Phase | null;
        if (active && active.id !== id) {
          const { data: ovr } = await db
            .from("hrl_program_overrides")
            .select("exercise_id, target, note");
          await db
            .from("hrl_phases")
            .update({ status: "archived", overrides_snapshot: ovr ?? [], ended_on: todayISO() })
            .eq("id", active.id);
        }
        await db.from("hrl_phases").update({ status: "active", ended_on: null }).eq("id", id);

        // Restore this phase's working targets.
        const snap = ((target as unknown as { overrides_snapshot?: OverrideSnap[] })
          .overrides_snapshot) ?? [];
        await db.from("hrl_program_overrides").delete().neq("exercise_id", "");
        if (snap.length) {
          await db.from("hrl_program_overrides").upsert(
            snap.map((s) => ({ exercise_id: s.exercise_id, target: s.target, note: s.note })),
            { onConflict: "exercise_id" },
          );
        }
      }
      const { data } = await db.from("hrl_phases").select("*").eq("id", id).single();
      return NextResponse.json(data);
    }

    const patch: Record<string, unknown> = {};
    if (typeof body?.name === "string") patch.name = body.name.trim();
    if (body?.focus !== undefined) patch.focus = body.focus ? String(body.focus).trim() : null;
    if (typeof body?.started_on === "string") patch.started_on = body.started_on;
    if (typeof body?.phase_number === "number") patch.phase_number = body.phase_number;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    const { data, error } = await db
      .from("hrl_phases")
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

// DELETE → remove an archived phase (never the active one).
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/phases/[id]">) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await ctx.params;
    const db = supabase();
    const { data: row } = await db.from("hrl_phases").select("status").eq("id", id).maybeSingle();
    if (row?.status === "active") {
      return NextResponse.json(
        { error: "Can't delete the active phase. Advance or swap first." },
        { status: 400 },
      );
    }
    const { error } = await db.from("hrl_phases").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
