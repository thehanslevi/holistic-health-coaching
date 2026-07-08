// ─── Log payloads (shapes preserved from v1 localStorage data) ────────────────

export type SetEntry = {
  reps?: string;
  weight?: string;
  duration?: string;
};

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
  /** Wall-clock minutes from Begin to Save in guided mode (v3+) */
  durationMin?: number;
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
};

export type XtrainLogData = {
  type: "xtrain";
  date: string;
  modality: string;
  duration: string;
  intensity: string;
  notes: string;
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
};
