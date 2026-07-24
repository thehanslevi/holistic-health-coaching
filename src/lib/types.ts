// ─── Log payloads (shapes preserved from v1 localStorage data) ────────────────

export type SetEntry = {
  reps?: string;
  weight?: string;
  duration?: string;
  /**
   * Assistance load on assisted work (pull-ups, dips) in lbs. NOT weight lifted:
   * more assistance is EASIER, so progress here means this number going down.
   * Kept separate from `weight` so nothing ever reads it as external load.
   */
  assistWeight?: string;
};

/**
 * What was in the tank before training. On semaglutide hunger isn't a reliable
 * signal, so whether she actually ate has to be recorded rather than inferred.
 * Deliberately coarse — this is fuel context for coaching, not food logging.
 */
export type FuelStatus = "protein_carbs" | "protein" | "carbs" | "nothing" | "unsure";
export type FuelTiming = "0-30min" | "30-60min" | "60-120min" | "2h+";
export type PreFuel = { status: FuelStatus | null; timing?: FuelTiming | null };

export type SessionLogData = {
  date: string;
  sessionKey: string;
  kneeStart: number;
  kneeEnd: number;
  bikeMin: number;
  ptDone: boolean;
  exerciseTherapyDone: boolean;
  sets: Record<string, SetEntry>;
  cooldownCount: number;
  cooldownTotal: number;
  notes: string;
  /**
   * How long the session actually took. Auto-filled from Begin→Save in guided
   * mode and editable at save — reps and weights alone can't tell an abbreviated
   * session from a full one.
   */
  durationMin?: number;
  /**
   * Whole-session effort, 1–10 (6–7 productive, 8 hard, 9–10 very hard/max).
   * Load says what she moved; this says what it cost.
   */
  sessionRPE?: number | null;
  /**
   * Reps left in reserve on the last hard set. 0 = nothing left;
   * -1 = failed or form broke. Gates whether a lift should progress.
   */
  lastSetRIR?: number | null;
  /** What she ate before this session. */
  preFuel?: PreFuel;
  /**
   * Which gym. Machines differ between branches — the leg press especially —
   * so loads are only comparable within a facility. Without this, a branch
   * change reads as a strength change.
   */
  facility?: string | null;
  /** Anything about the specific machine worth remembering (seat, stack, plates). */
  machineNote?: string;
};

export type RunLogData = {
  type: "run";
  date: string;
  run_date: string;
  run_dist: string;
  run_time: string;
  run_knee_end: string;
  run_ankle: string;
  run_am_knee: string;
  run_am_ankle: string;
  run_notes: string;
  /** Continuous, walk-run, intervals — a 2-mile walk-run isn't a 2-mile run. */
  run_type?: "continuous" | "walk-run" | "intervals" | "easy jog" | null;
  /**
   * How the ankle behaved the next morning beyond a 0–10 score. A 2/10 that
   * clears in minutes and a 2/10 that lingers are different decisions.
   */
  run_am_stiffness?: "none" | "clears quickly" | "lingers" | "limp" | null;
  /** Did her gait change mid-run? The earliest sign to stop adding distance. */
  run_gait_change?: boolean | null;
  /** Calf stretches / ice afterwards — the habit protecting the tendon. */
  run_protocol_done?: boolean | null;
  run_surface?: "treadmill" | "road" | "track" | "trail" | "mixed" | null;
  run_terrain?: "flat" | "rolling" | "hilly" | null;
  /** What she ate before the run. */
  preFuel?: PreFuel;
};

export type XtrainLogData = {
  type: "xtrain";
  date: string;
  modality: string;
  duration: string;
  intensity: string;
  notes: string;
  /** What she ate beforehand. */
  preFuel?: PreFuel;
};

export type LogKind = "session" | "run" | "xtrain";

export type LogData = SessionLogData | RunLogData | XtrainLogData;

export type LogRow = {
  id: string;
  logged_at: string;
  kind: LogKind;
  session_key: string | null;
  data: LogData;
  created_at: string;
};

export function isSessionLog(row: LogRow): row is LogRow & { data: SessionLogData } {
  return row.kind === "session";
}

export function isRunLog(row: LogRow): row is LogRow & { data: RunLogData } {
  return row.kind === "run";
}

export function isXtrainLog(row: LogRow): row is LogRow & { data: XtrainLogData } {
  return row.kind === "xtrain";
}

// ─── Check-ins ────────────────────────────────────────────────────────────────

export type Readiness = "green" | "yellow" | "red";

export type Checkin = {
  date: string;
  readiness: Readiness;
  note: string | null;
};

// ─── Coach ────────────────────────────────────────────────────────────────────

export type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

// ─── Apple Health (via Shortcuts) ─────────────────────────────────────────────

export type HealthRow = {
  date: string;
  sleep_hours: number | null;
  steps: number | null;
  resting_hr: number | null;
  hrv: number | null;
  active_energy: number | null;
  source: string;
  updated_at: string;
};

// ─── Recovery + program overrides (Wave 2) ────────────────────────────────────

export type Recovery = {
  date: string;
  fueled: boolean | null;
  post_run_protocol: boolean | null;
  vipassana: number | null;
  sleep_quality: number | null;
  /** What she ate after training — appetite is often suppressed when the
   *  recovery demand is highest, so this is worth recording rather than guessing. */
  post_training_fuel: FuelStatus | null;
  /** Did yesterday clear the protein floor? Coarse on purpose: a recovery
   *  context flag, never calorie or macro tracking. */
  protein_floor: "yes" | "close" | "no" | "unknown" | null;
  note: string | null;
};

export type ProgramOverride = {
  exercise_id: string;
  target: string | null;
  note: string | null;
  updated_at: string;
};

export type ProgramProposal = {
  exercise_id: string;
  exercise_name: string;
  current_target: string;
  proposed_target: string;
  rationale: string;
};

export type CoachContextSummary = {
  sessionCount: number;
  runStatus: Readiness | null;
  sinceDays: number;
  lastLogDate: string | null;
};

// ─── Program phases (Wave 3 — program-as-data) ────────────────────────────────

export type Phase = {
  id: string;
  phase_number: number;
  name: string;
  focus: string | null;
  started_on: string;
  ended_on: string | null;
  status: "active" | "archived";
  created_at: string;
  /**
   * The phase's full program (Record<SessionKey, Session>) once anything has
   * been edited. Null/absent = unedited; fall back to program.ts SESSIONS.
   * Typed loose here so the client-safe resolver owns validation.
   */
  program_snapshot?: unknown;
};

// ─── Living profile — user-maintained current status (overrides stale context) ─

export type ProfileKind = "priority" | "constraint" | "note";

export type ProfileEntry = {
  id: string;
  kind: ProfileKind;
  text: string;
  status: "active" | "resolved";
  created_at: string;
  updated_at: string;
};
