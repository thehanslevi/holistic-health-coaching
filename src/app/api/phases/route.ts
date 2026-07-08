import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Phase } from "@/lib/types";

// GET → the active phase + archived history.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { data, error } = await supabase()
      .from("hrl_phases")
      .select("*")
      .order("phase_number", { ascending: false });
    if (error) throw new Error(error.message);
    const phases = (data ?? []) as Phase[];
    return NextResponse.json({
      active: phases.find((p) => p.status === "active") ?? null,
      history: phases.filter((p) => p.status !== "active"),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST → advance to a new phase. Archives the current one (snapshotting its
// working targets), then creates a new active phase.
// Body: { name, focus?, started_on?, carry: "keep" | "reset" | "propose" }
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const name = (body?.name as string)?.trim();
    if (!name) {
      return NextResponse.json({ error: "A phase name is required." }, { status: 400 });
    }
    const focus = (body?.focus as string)?.trim() || null;
    const startedOn = (body?.started_on as string) || new Date().toISOString().slice(0, 10);
    const carry: "keep" | "reset" | "propose" = body?.carry ?? "keep";

    const db = supabase();
    const { data: current } = await db
      .from("hrl_phases")
      .select("*")
      .eq("status", "active")
      .maybeSingle();
    const active = current as Phase | null;

    // Snapshot the current working targets onto the phase we're closing.
    const { data: ovr } = await db
      .from("hrl_program_overrides")
      .select("exercise_id, target, note");

    if (active) {
      // End the day before the new phase begins (min = start date itself).
      const endD = new Date(startedOn + "T00:00:00");
      endD.setDate(endD.getDate() - 1);
      const endedOn =
        endD >= new Date(active.started_on + "T00:00:00")
          ? endD.toISOString().slice(0, 10)
          : active.started_on;
      await db
        .from("hrl_phases")
        .update({ status: "archived", ended_on: endedOn, overrides_snapshot: ovr ?? [] })
        .eq("id", active.id);
    }

    const nextNumber = (active?.phase_number ?? 0) + 1;
    const { data: created, error } = await db
      .from("hrl_phases")
      .insert({
        phase_number: nextNumber,
        name,
        focus,
        started_on: startedOn,
        status: "active",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // "reset" clears the working targets so the new phase starts on the base
    // program; "keep" and "propose" leave them (propose = client then opens the
    // coach progression review to earn bumps).
    if (carry === "reset") {
      await db.from("hrl_program_overrides").delete().neq("exercise_id", "");
    }

    return NextResponse.json({ phase: created, carry });
  } catch (e) {
    return errorResponse(e);
  }
}
