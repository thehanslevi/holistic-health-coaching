import { SESSION_ORDER, type Exercise, type SessionKey } from "@/lib/program";
import {
  catalogOf,
  findExerciseIn,
  makeExerciseId,
  normalizeSnapshot,
  resolveProgram,
  type ProgramSessions,
} from "@/lib/program-resolve";
import { supabase } from "@/lib/supabase";
import type { ProgramOverride } from "@/lib/types";

// Server-side program access and mutation.
//
// Reads go through resolveProgram so the server and the browser always agree on
// what the program is. Writes go through applyProgramEdit, which is the ONLY
// path that mutates the structure — every call records what changed, why, and
// the full program as it stood beforehand, so nothing the coach does is silent
// or one-way.

export type ProgramChange = {
  id: string;
  created_at: string;
  session_key: SessionKey | null;
  summary: string;
  rationale: string;
  source: "coach" | "manual";
  reverted_at: string | null;
};

async function fetchOverrides(): Promise<Record<string, ProgramOverride>> {
  const { data } = await supabase().from("hrl_program_overrides").select("*");
  return Object.fromEntries(
    ((data ?? []) as ProgramOverride[]).map((o) => [o.exercise_id, o]),
  );
}

/** The active phase row that owns the program snapshot, if one exists. */
async function fetchActivePhaseRow(): Promise<{ id: string; program_snapshot: unknown } | null> {
  const { data } = await supabase()
    .from("hrl_phases")
    .select("id, program_snapshot")
    .eq("status", "active")
    .maybeSingle();
  return (data as { id: string; program_snapshot: unknown } | null) ?? null;
}

/** What the program actually is right now: snapshot (or code base) + overrides. */
export async function getResolvedProgram(): Promise<ProgramSessions> {
  const [phase, overrides] = await Promise.all([fetchActivePhaseRow(), fetchOverrides()]);
  return resolveProgram(phase?.program_snapshot ?? null, overrides);
}

/** Structure only, no target overrides — the thing edits are applied against. */
async function getStructure(): Promise<{
  phaseId: string | null;
  before: unknown;
  sessions: ProgramSessions;
}> {
  const phase = await fetchActivePhaseRow();
  return {
    phaseId: phase?.id ?? null,
    before: phase?.program_snapshot ?? null,
    sessions: normalizeSnapshot(phase?.program_snapshot ?? null),
  };
}

export type EditResult = { ok: true; summary: string } | { ok: false; error: string };

type EditOp =
  | { op: "drop"; session_key: SessionKey; exercise_id: string }
  | {
      op: "add";
      session_key: SessionKey;
      exercise: NewExercise;
      after_exercise_id?: string;
    }
  | {
      op: "replace";
      session_key: SessionKey;
      exercise_id: string;
      exercise: NewExercise;
    };

export type NewExercise = {
  name: string;
  sets: number;
  reps: string;
  target: string;
  note?: string;
  weighted?: boolean;
  timed?: boolean;
};

function buildExercise(sessions: ProgramSessions, key: SessionKey, spec: NewExercise): Exercise {
  return {
    id: makeExerciseId(sessions, key, spec.name),
    name: spec.name,
    sets: spec.sets,
    reps: spec.reps,
    target: spec.target,
    ...(spec.note ? { note: spec.note } : {}),
    ...(spec.weighted === false ? { weighted: false } : {}),
    ...(spec.timed ? { timed: true } : {}),
  };
}

/**
 * The single write path for program structure. Persists the new snapshot and an
 * audit row carrying the pre-change program, then returns a human summary.
 *
 * Note the snapshot is written whole rather than as a replayable op log. Undo is
 * therefore a point-in-time restore, which is honest: undoing an older change
 * also discards what was stacked on top of it, and the UI says so.
 */
export async function applyProgramEdit(
  edit: EditOp,
  rationale: string,
  source: "coach" | "manual" = "coach",
): Promise<EditResult> {
  const db = supabase();
  const { phaseId, before, sessions } = await getStructure();

  if (!SESSION_ORDER.includes(edit.session_key)) {
    return { ok: false, error: `Unknown session "${edit.session_key}".` };
  }
  const session = sessions[edit.session_key];
  let summary: string;

  if (edit.op === "drop") {
    const idx = session.exercises.findIndex((e) => e.id === edit.exercise_id);
    if (idx === -1) {
      return { ok: false, error: notFound(sessions, edit.exercise_id, edit.session_key) };
    }
    if (session.exercises.length <= 1) {
      return { ok: false, error: `Refusing to drop the only exercise left in ${edit.session_key}.` };
    }
    summary = `Dropped ${session.exercises[idx].name} from ${edit.session_key}`;
    session.exercises.splice(idx, 1);
  } else if (edit.op === "add") {
    const ex = buildExercise(sessions, edit.session_key, edit.exercise);
    let at = session.exercises.length;
    if (edit.after_exercise_id) {
      const i = session.exercises.findIndex((e) => e.id === edit.after_exercise_id);
      if (i === -1) {
        return { ok: false, error: notFound(sessions, edit.after_exercise_id, edit.session_key) };
      }
      at = i + 1;
    }
    session.exercises.splice(at, 0, ex);
    summary = `Added ${ex.name} to ${edit.session_key}`;
  } else {
    const idx = session.exercises.findIndex((e) => e.id === edit.exercise_id);
    if (idx === -1) {
      return { ok: false, error: notFound(sessions, edit.exercise_id, edit.session_key) };
    }
    const oldName = session.exercises[idx].name;
    const ex = buildExercise(sessions, edit.session_key, edit.exercise);
    session.exercises.splice(idx, 1, ex);
    summary = `Replaced ${oldName} with ${ex.name} in ${edit.session_key}`;
  }

  // Audit first: if the snapshot write fails we would rather have a change row
  // with no effect than an unexplained program with no record of what hit it.
  const { error: logError } = await db.from("hrl_program_changes").insert({
    session_key: edit.session_key,
    summary,
    rationale,
    source,
    before_snapshot: before,
  });
  if (logError) return { ok: false, error: `Could not record the change: ${logError.message}` };

  if (phaseId) {
    const { error } = await db
      .from("hrl_phases")
      .update({ program_snapshot: sessions })
      .eq("id", phaseId);
    if (error) return { ok: false, error: `Could not save the program: ${error.message}` };
  } else {
    // No phase row yet (still on the synthesized seed phase) — create one so the
    // snapshot has an owner.
    const { error } = await db.from("hrl_phases").insert({
      phase_number: 3,
      name: "Hybrid Athlete — Strength-First, Endurance Rebuild",
      started_on: "2026-05-22",
      status: "active",
      program_snapshot: sessions,
    });
    if (error) return { ok: false, error: `Could not save the program: ${error.message}` };
  }

  return { ok: true, summary };
}

function notFound(sessions: ProgramSessions, id: string, key: SessionKey): string {
  const inSession = sessions[key].exercises.map((e) => `${e.id} (${e.name})`).join(", ");
  return `No exercise "${id}" in ${key}. That session currently has: ${inSession}`;
}

export async function fetchProgramChanges(limit = 25): Promise<ProgramChange[]> {
  const { data } = await supabase()
    .from("hrl_program_changes")
    .select("id, created_at, session_key, summary, rationale, source, reverted_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ProgramChange[];
}

/**
 * Point-in-time undo: restore the program to how it stood before `changeId`.
 * Anything stacked on top of that change goes with it — marked reverted so the
 * history stays truthful rather than silently rewritten.
 */
export async function revertProgramChange(changeId: string): Promise<EditResult> {
  const db = supabase();
  const { data: change, error } = await db
    .from("hrl_program_changes")
    .select("id, created_at, summary, before_snapshot, reverted_at")
    .eq("id", changeId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!change) return { ok: false, error: "No such change." };
  if (change.reverted_at) return { ok: false, error: "That change is already undone." };

  const phase = await fetchActivePhaseRow();
  if (phase) {
    const { error: e } = await db
      .from("hrl_phases")
      .update({ program_snapshot: change.before_snapshot })
      .eq("id", phase.id);
    if (e) return { ok: false, error: e.message };
  }

  const now = new Date().toISOString();
  await db
    .from("hrl_program_changes")
    .update({ reverted_at: now })
    .gte("created_at", change.created_at)
    .is("reverted_at", null);

  return { ok: true, summary: `Undone: ${change.summary}` };
}

export { catalogOf, findExerciseIn };
