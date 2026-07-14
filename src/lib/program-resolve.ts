import {
  SESSIONS,
  SESSION_ORDER,
  type Exercise,
  type Session,
  type SessionKey,
} from "@/lib/program";
import type { ProgramOverride } from "@/lib/types";

// Resolves what the program ACTUALLY is right now, as opposed to what
// program.ts says it was when it was written.
//
// Three layers, in order:
//   1. program.ts SESSIONS       — base template + fallback
//   2. phase.program_snapshot    — structural truth once anything is edited
//   3. hrl_program_overrides     — working target tweaks on top
//
// Pure and client-safe on purpose: the browser (SessionLogger, which renders
// the workout she actually does) and the server (the coach's tools, the
// reviews, the share export) must agree exactly. If they disagreed, the coach
// would swap an exercise and her logger would keep showing the old one — worse
// than not being able to edit at all.

export type ProgramSessions = Record<SessionKey, Session>;

/** Deep-ish clone of the base template so callers can never mutate the module. */
function cloneBase(): ProgramSessions {
  const out = {} as ProgramSessions;
  for (const key of SESSION_ORDER) {
    const s = SESSIONS[key];
    out[key] = {
      ...s,
      exercises: s.exercises.map((e) => ({ ...e })),
      cooldown: [...s.cooldown],
    };
  }
  return out;
}

/**
 * A snapshot is only trusted if it still looks like a program. A malformed or
 * partial snapshot falls back to the base template per session rather than
 * blanking her workout — an empty session screen mid-gym is a worse failure
 * than a stale one.
 */
function isSession(v: unknown): v is Session {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<Session>;
  return (
    typeof s.label === "string" &&
    typeof s.subtitle === "string" &&
    Array.isArray(s.exercises) &&
    s.exercises.every(
      (e) => e && typeof (e as Exercise).id === "string" && typeof (e as Exercise).name === "string",
    )
  );
}

export function normalizeSnapshot(snapshot: unknown): ProgramSessions {
  const base = cloneBase();
  if (!snapshot || typeof snapshot !== "object") return base;
  const snap = snapshot as Record<string, unknown>;
  for (const key of SESSION_ORDER) {
    const candidate = snap[key];
    if (isSession(candidate)) {
      base[key] = {
        ...candidate,
        exercises: candidate.exercises.map((e) => ({ ...e })),
        cooldown: Array.isArray(candidate.cooldown) ? [...candidate.cooldown] : [...base[key].cooldown],
      };
    }
  }
  return base;
}

/**
 * Layer target overrides onto a structural snapshot.
 *
 * Deliberately overrides `target` and NOTHING else. The override's own note is
 * left on the override row rather than merged into `ex.note` — `ex.note` is the
 * coaching cue she reads mid-set, and quietly prepending to it would change what
 * the logger displays as a side effect of resolving. TargetEditor already
 * surfaces the override separately.
 */
export function applyOverrides(
  sessions: ProgramSessions,
  overrides: Record<string, ProgramOverride> | ProgramOverride[],
): ProgramSessions {
  const map: Record<string, ProgramOverride> = Array.isArray(overrides)
    ? Object.fromEntries(overrides.map((o) => [o.exercise_id, o]))
    : overrides;
  if (!Object.keys(map).length) return sessions;

  const out = {} as ProgramSessions;
  for (const key of SESSION_ORDER) {
    const s = sessions[key];
    out[key] = {
      ...s,
      exercises: s.exercises.map((ex) => {
        const o = map[ex.id];
        return o?.target ? { ...ex, target: o.target } : ex;
      }),
    };
  }
  return out;
}

/** The one function everything should ask: what is the program, right now? */
export function resolveProgram(
  snapshot: unknown,
  overrides: Record<string, ProgramOverride> | ProgramOverride[] = {},
): ProgramSessions {
  return applyOverrides(normalizeSnapshot(snapshot), overrides);
}

/** Flat id → exercise index across every session. */
export function findExerciseIn(
  sessions: ProgramSessions,
  exerciseId: string,
): { ex: Exercise; sessionKey: SessionKey } | null {
  for (const key of SESSION_ORDER) {
    const ex = sessions[key].exercises.find((e) => e.id === exerciseId);
    if (ex) return { ex, sessionKey: key };
  }
  return null;
}

export function catalogOf(sessions: ProgramSessions): { id: string; name: string; sessionKey: SessionKey }[] {
  const out: { id: string; name: string; sessionKey: SessionKey }[] = [];
  for (const key of SESSION_ORDER) {
    for (const ex of sessions[key].exercises) {
      out.push({ id: ex.id, name: ex.name, sessionKey: key });
    }
  }
  return out;
}

/** Stable, collision-free id for a coach-added exercise. */
export function makeExerciseId(sessions: ProgramSessions, sessionKey: SessionKey, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "exercise";
  const prefix = sessionKey.toLowerCase();
  const taken = new Set(catalogOf(sessions).map((e) => e.id));
  let id = `${prefix}_${slug}`;
  let n = 2;
  while (taken.has(id)) id = `${prefix}_${slug}_${n++}`;
  return id;
}
