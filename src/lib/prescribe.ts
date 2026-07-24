// What load should be put in front of her for a set?
//
// The logger used to prefill each set with whatever she logged last time in that
// session slot, verbatim. That silently turns one heavy entry into a standing
// recommendation, and it ignores what the session is actually FOR: on 2026-07-17
// an L2 hypertrophy day (prescribed 3 × 10–12 @ 95 lb) came pre-loaded with the
// 145 lb strength load from the L1 day — a max-strength load offered for
// high-rep work. That is not a safe prescription.
//
// The rule here: the last logged weight is EVIDENCE, not a prescription. It is
// only carried forward when the prior effort actually matches what this session
// asks for. Otherwise fall back to the coach's prescribed target (already a
// conservative, deliberately-set number) or to nothing at all — a blank field
// she fills in beats a confident wrong number.
//
// Pure and dependency-free on purpose: structural types instead of imports from
// the program module, so this is unit-testable without the app around it.

export type PrescribedExercise = {
  /** Prescribed set count. */
  sets: number;
  /** Rep prescription as written, e.g. "6 reps", "10–12 reps", "12 each side". */
  reps: string;
  /** Target load as written, e.g. "145 lbs", "75–85 lbs", "Loaded", "Bodyweight → DBs". */
  target: string;
  /** false → this lift carries no external load (bodyweight, bands, assisted). */
  weighted?: boolean;
  /** true → logged as a duration rather than reps. */
  timed?: boolean;
  /** "assistance" → the load is help being given, so lower is harder. */
  loadType?: "external" | "assistance" | "bodyweight" | "timed";
};

export type LoggedSet = {
  reps?: string;
  weight?: string;
  duration?: string;
  assistWeight?: string;
};

export type ReadinessLevel = "green" | "yellow" | "red";

export type PrescriptionSource =
  | "previous" // prior effort matched the prescription — carry it
  | "target" // fell back to the programmed target
  | "reduced-for-reps" // prior load was for lower reps than this session asks
  | "reduced-for-readiness" // trimmed because she's arriving yellow
  | "none"; // deliberately blank

export type Prescription = {
  weight?: string;
  reps?: string;
  duration?: string;
  assistWeight?: string;
  source: PrescriptionSource;
};

/** Numeric value of a logged/typed field, or null when absent or unparseable. */
function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The rep range a session asks for. Handles "6 reps", "10–12 reps" (en or hyphen),
 * "12 each side", "8-10". Returns null for anything durational or unparseable —
 * an unknown prescription is never treated as a match.
 */
export function parseRepRange(reps: string): { min: number; max: number } | null {
  if (!reps) return null;
  if (/sec|min|hold/i.test(reps)) return null;
  const m = reps.match(/(\d+)\s*(?:[–-]\s*(\d+))?/);
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] ? Number(m[2]) : min;
  if (!Number.isFinite(min) || min <= 0) return null;
  return { min, max: Number.isFinite(max) && max >= min ? max : min };
}

/**
 * The programmed load, taking the LOW end of any range so the fallback is the
 * conservative one. Returns null for qualitative targets ("Loaded", "Bodyweight
 * → DBs", "Match prior effort", "Light band") — those intentionally produce a
 * blank field rather than an invented number.
 */
export function parseTargetWeight(target: string): number | null {
  if (!target) return null;
  if (/assist/i.test(target)) return null; // assisted work: less is harder, not more
  if (!/lb|kg|\d/.test(target)) return null;
  const m = target.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The assistance setting named in a target like "55 lb assist". Separate from
 * `parseTargetWeight` on purpose — this number is help, not load, and must never
 * flow into load logic.
 */
export function parseAssistWeight(target: string): number | null {
  if (!target || !/assist/i.test(target)) return null;
  const m = target.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Trim to something loadable, never rounding a reduction upward. */
function roundDown(n: number, step = 5): number {
  if (n <= step) return Math.max(0, Math.floor(n));
  return Math.floor(n / step) * step;
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : String(n));

/**
 * Decide what to put in one set's fields.
 *
 * Deliberately conservative: the result never exceeds the prior load, and never
 * exceeds the programmed target when the prior effort doesn't match this
 * session's rep prescription. Missing readiness is treated as "no licence to
 * progress", not as green.
 */
export function prescribeSet(input: {
  exercise: PrescribedExercise;
  previous?: LoggedSet;
  readiness?: ReadinessLevel | null;
}): Prescription {
  const { exercise, previous, readiness } = input;
  const weighted = exercise.weighted !== false;

  // Durational work carries no load risk — carry the time, drop any load on a
  // hard day.
  if (exercise.timed) {
    if (!previous?.duration) return { source: "none" };
    if (readiness === "red") return { duration: previous.duration, source: "reduced-for-readiness" };
    return {
      duration: previous.duration,
      ...(weighted && previous.weight ? { weight: previous.weight } : {}),
      source: "previous",
    };
  }

  // Assisted work: carry the assistance setting so she starts where she left
  // off. It is never treated as load — reducing it is what progress looks like,
  // and that call belongs to the coach, not to a prefill.
  if (exercise.loadType === "assistance") {
    if (readiness === "red") return { source: "reduced-for-readiness" };
    // Fall back to the assistance named in the target, so the field is useful
    // before any set has been logged with one.
    const fallback = parseAssistWeight(exercise.target);
    const assist = previous?.assistWeight ?? (fallback != null ? String(fallback) : undefined);
    if (!previous?.reps && !assist) return { source: "none" };
    return {
      ...(previous?.reps ? { reps: previous.reps } : {}),
      ...(assist ? { assistWeight: assist } : {}),
      source: previous?.assistWeight ? "previous" : "target",
    };
  }

  // Bodyweight / banded lifts: reps only, no load to get wrong.
  if (!weighted) {
    if (readiness === "red") return { source: "reduced-for-readiness" };
    return previous?.reps ? { reps: previous.reps, source: "previous" } : { source: "none" };
  }

  // Red day: the app already tells her not to load this. Don't hand her a number.
  if (readiness === "red") return { source: "reduced-for-readiness" };

  const range = parseRepRange(exercise.reps);
  const targetWeight = parseTargetWeight(exercise.target);
  const prevWeight = num(previous?.weight);
  const prevReps = num(previous?.reps);

  // No usable history → the programmed target, which is the coach's own
  // conservative number. No target → blank.
  if (prevWeight == null) {
    if (targetWeight == null) return { source: "none" };
    const w = readiness === "yellow" ? roundDown(targetWeight * 0.9) : targetWeight;
    return {
      weight: fmt(w),
      source: readiness === "yellow" ? "reduced-for-readiness" : "target",
    };
  }

  // Completion quality unknown (a load with no reps recorded) → don't treat it
  // as a proven working set.
  const unknownQuality = prevReps == null;

  // The load was moved for a LOWER rep count than this session prescribes — a
  // strength load being carried into higher-rep work. This is the 145-lb-RDL-
  // into-3×12 case.
  const belowRange = range != null && prevReps != null && prevReps < range.min;

  let weight: number;
  let source: PrescriptionSource;

  if (belowRange || unknownQuality) {
    // Fall back to the programmed target, and never above the prior load.
    if (targetWeight == null) return { source: "none" };
    weight = Math.min(targetWeight, prevWeight);
    source = "reduced-for-reps";
  } else {
    weight = prevWeight;
    source = "previous";
  }

  // Arriving yellow: trim the load rather than expecting the last good day.
  if (readiness === "yellow") {
    weight = roundDown(weight * 0.9);
    source = "reduced-for-readiness";
  }

  if (weight <= 0) return { source: "none" };

  // Reps only carry over when the prior effort actually matched the
  // prescription — a stale "8" against a 10–12 slot is its own bad suggestion.
  const carryReps = source === "previous" && previous?.reps ? { reps: previous.reps } : {};
  return { weight: fmt(weight), ...carryReps, source };
}
