import {
  SESSIONS,
  SESSION_ORDER,
  SESSION_SEQUENCE,
  ROLLING_TARGETS,
  nextStrengthSession,
  type SessionKey,
} from "@/lib/program";
import type { ProgramSessions } from "@/lib/program-resolve";
import { isRunLog, isSessionLog, isXtrainLog, type LogRow } from "@/lib/types";

// All series are derived client-side from the shared logs cache.

export type Point = { date: string; value: number };
export type WeekPoint = { week: string; value: number };

/** ISO date of the Monday of the week containing d */
function weekOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const idx = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - idx);
  return d.toISOString().slice(0, 10);
}

/**
 * Exercises (across all sessions) that have at least one logged weighted set.
 * `sessions` defaults to the code template; pass the resolved program so
 * coach-added exercises appear in progression charts rather than silently
 * dropping out of her history.
 */
export function loggedExercises(
  logs: LogRow[],
  sessions: ProgramSessions = SESSIONS,
): { id: string; name: string }[] {
  const seen = new Set<string>();
  for (const row of logs) {
    if (!isSessionLog(row)) continue;
    for (const [key, entry] of Object.entries(row.data.sets)) {
      if (entry.weight) seen.add(key.replace(/_s\d+$/, ""));
    }
  }
  const out: { id: string; name: string }[] = [];
  for (const sk of SESSION_ORDER) {
    for (const ex of sessions[sk].exercises) {
      if (seen.has(ex.id)) out.push({ id: ex.id, name: `${ex.name} (${sk})` });
    }
  }
  return out;
}

/** Heaviest logged set per day for one exercise */
export function progression(logs: LogRow[], exerciseId: string): Point[] {
  const byDate = new Map<string, number>();
  for (const row of logs) {
    if (!isSessionLog(row)) continue;
    for (const [key, entry] of Object.entries(row.data.sets)) {
      if (!key.startsWith(exerciseId + "_s")) continue;
      const w = Number(entry.weight);
      if (!w) continue;
      byDate.set(row.logged_at, Math.max(byDate.get(row.logged_at) ?? 0, w));
    }
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Total volume (reps × lbs) per week across all strength sessions */
export function weeklyVolume(logs: LogRow[]): WeekPoint[] {
  const byWeek = new Map<string, number>();
  for (const row of logs) {
    if (!isSessionLog(row)) continue;
    let vol = 0;
    for (const entry of Object.values(row.data.sets)) {
      const reps = Number(entry.reps);
      const weight = Number(entry.weight);
      if (reps && weight) vol += reps * weight;
    }
    if (!vol) continue;
    const wk = weekOf(row.logged_at);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + vol);
  }
  return [...byWeek.entries()]
    .map(([week, value]) => ({ week, value }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

export type RunPoint = {
  date: string;
  amKnee: number;
  amAnkle: number;
  dist: number;
};

/** Next-AM pain scores and distance per run, oldest first */
export function runSeries(logs: LogRow[]): RunPoint[] {
  return logs
    .filter(isRunLog)
    .map((row) => ({
      date: row.logged_at,
      amKnee: Number(row.data.run_am_knee) || 0,
      amAnkle: Number(row.data.run_am_ankle) || 0,
      dist: Number(row.data.run_dist) || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Cross-training minutes per week */
export function xtrainMinutes(logs: LogRow[]): WeekPoint[] {
  const byWeek = new Map<string, number>();
  for (const row of logs) {
    if (!isXtrainLog(row)) continue;
    const min = Number(row.data.duration);
    if (!min) continue;
    const wk = weekOf(row.logged_at);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + min);
  }
  return [...byWeek.entries()]
    .map(([week, value]) => ({ week, value }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

// ─── Guided mode + Today helpers ──────────────────────────────────────────────

import type { SessionLogData } from "@/lib/types";

/** Most recent session log for a given session key */
export function lastSessionLog(
  logs: LogRow[],
  sessionKey: string,
): (LogRow & { data: SessionLogData }) | null {
  for (const row of logs) {
    if (isSessionLog(row) && row.data.sessionKey === sessionKey) return row;
  }
  return null;
}

/** Heaviest weight ever logged for an exercise (for PR detection) */
export function exerciseMax(
  logs: LogRow[],
  exerciseId: string,
  excludeLogId?: string,
): number {
  let max = 0;
  for (const row of logs) {
    if (!isSessionLog(row) || row.id === excludeLogId) continue;
    for (const [key, entry] of Object.entries(row.data.sets)) {
      if (!key.startsWith(exerciseId + "_s")) continue;
      max = Math.max(max, Number(entry.weight) || 0);
    }
  }
  return max;
}

/** Total volume (reps × lbs) of one session payload */
export function sessionVolume(data: SessionLogData): number {
  let vol = 0;
  for (const entry of Object.values(data.sets)) {
    const reps = Number(entry.reps);
    const weight = Number(entry.weight);
    if (reps && weight) vol += reps * weight;
  }
  return vol;
}

export type FeaturedLift = {
  id: string;
  shortName: string;
  current: number;
  delta: number;
  spanWeeks: number;
};

/** The lift with the strongest recent progression — Today's headline number */
export function featuredLift(logs: LogRow[]): FeaturedLift | null {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 28);
  const since = windowStart.toISOString().slice(0, 10);

  let best: FeaturedLift | null = null;
  for (const ex of loggedExercises(logs)) {
    const points = progression(logs, ex.id).filter((p) => p.date >= since);
    if (points.length < 2) continue;
    const first = points[0];
    const last = points[points.length - 1];
    const delta = last.value - first.value;
    if (delta <= 0) continue;
    const spanWeeks = Math.max(
      1,
      Math.round(
        (new Date(last.date).getTime() - new Date(first.date).getTime()) /
          (7 * 24 * 3600 * 1000),
      ),
    );
    if (!best || delta > best.delta) {
      best = {
        id: ex.id,
        shortName: ex.name.replace(/\s*\(.+\)$/, ""),
        current: last.value,
        delta,
        spanWeeks,
      };
    }
  }
  return best;
}

/** Which weekdays (MON=0…SUN=6) of the current week have any log */
export function weekDayHits(logs: LogRow[]): boolean[] {
  const now = new Date();
  const dayIdx = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayIdx);
  monday.setHours(0, 0, 0, 0);
  const hits = [false, false, false, false, false, false, false];
  for (const row of logs) {
    const d = new Date(row.logged_at + "T12:00:00");
    if (d < monday) continue;
    const idx = (d.getDay() + 6) % 7;
    hits[idx] = true;
  }
  return hits;
}

// ─── Proactive signals + pending captures ─────────────────────────────────────

import type { CycleState } from "@/lib/cycle";
import type { HealthRow, Readiness } from "@/lib/types";

export type PendingRun = { id: string; date: string; dist: string };

/** Runs logged in the last few days still missing their next-AM scores */
export function pendingRuns(logs: LogRow[]): PendingRun[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 5);
  const cut = cutoff.toISOString().slice(0, 10);
  return logs
    .filter(
      (r) =>
        isRunLog(r) &&
        r.logged_at >= cut &&
        !String(r.data.run_am_knee).trim() &&
        !String(r.data.run_am_ankle).trim(),
    )
    .map((r) => ({ id: r.id, date: r.logged_at, dist: (r as LogRow & { data: { run_dist: string } }).data.run_dist }));
}

export type Signal = { tone: "stop" | "hold" | "accent"; text: string };

// The Today "signals" strip used to be a set of hardcoded rule-based alerts
// (ankle/knee trend, volume spike, PT compliance, low sleep). Those drew stale,
// over-generalized conclusions that couldn't tell her training had evolved (a
// dead PT circuit still getting nagged, arbitrary volume thresholds, generic
// sleep scolding). All interpretive/judgment calls now live with the LLM coach
// — the morning brief and coach chat reason from buildCoachAnalysis + full live
// context (including the run traffic light and orthopedic status), so they can
// raise a real concern in-voice instead of firing a fixed rule that doesn't
// know she's moved on. The only remaining Today signal is cycleSignal (a gentle
// bleeding-day note grounded in current fact). See coach-context.ts /
// coach-analysis.ts for the model path.

// ─── Data-informed readiness (proposes G/Y/R; the athlete keeps the final call) ─

export type ReadinessSuggestion = { level: Readiness; reasons: string[] };

/**
 * Propose a readiness from overnight signals — HRV vs the recent baseline, last
 * night's sleep, and cycle phase. This is a SUGGESTION only; the UI still lets
 * her confirm or overrule. Returns null when there isn't enough data to weigh in.
 */
export function suggestReadiness(
  health: HealthRow[],
  today = new Date().toISOString().slice(0, 10),
): ReadinessSuggestion | null {
  const reasons: string[] = [];
  let score = 0; // 0 = green; negative = more caution

  // Last night's sleep (today's row, else the most recent).
  const sleepRow = health.find((h) => h.date === today && h.sleep_hours != null)
    ?? health.find((h) => h.sleep_hours != null);
  if (sleepRow?.sleep_hours != null) {
    const s = sleepRow.sleep_hours;
    if (s < 5) { score -= 2; reasons.push(`sleep ${s}h`); }
    else if (s < 6) { score -= 1; reasons.push(`sleep ${s}h`); }
  }

  // HRV today vs the trailing baseline (a meaningful drop = under-recovery).
  const hrvs = health.filter((h) => h.hrv != null).map((h) => h.hrv as number);
  if (hrvs.length >= 4) {
    const todayHrv = hrvs[0];
    const baseArr = hrvs.slice(1, 8);
    const baseline = baseArr.reduce((a, b) => a + b, 0) / baseArr.length;
    if (todayHrv < baseline * 0.75) {
      score -= 2;
      reasons.push(`HRV ${Math.round(todayHrv)} (down from ~${Math.round(baseline)} avg)`);
    } else if (todayHrv < baseline * 0.85) {
      score -= 1;
      reasons.push(`HRV ${Math.round(todayHrv)} slightly down`);
    }
  }

  // Readiness is driven by objective recovery (sleep, HRV) and her own check-in,
  // not by cycle phase — phase periodization has small effects and her cycle is
  // irregular. A tough bleeding day shows up in sleep/HRV or in how she rates it.

  if (reasons.length === 0) return null; // nothing notable to say
  const level: Readiness = score <= -3 ? "red" : score <= -1 ? "yellow" : "green";
  return { level, reasons };
}

/**
 * How to adjust today's session for readiness. Rule-based (no model call) so the
 * guided logger can show it instantly. Green returns null — full session.
 */
export function sessionAdjustment(
  readiness: Readiness | null | undefined,
): { tone: "hold" | "stop"; title: string; note: string } | null {
  if (readiness === "yellow")
    return {
      tone: "hold",
      title: "Yellow day — trim it",
      note: "Keep the main lifts, cut one set off each, and stop about two reps short. Skip the isolation work at the end. No PRs today.",
    };
  if (readiness === "red")
    return {
      tone: "stop",
      title: "Red day — skip the loading",
      note: "Don't grind through this. Bike, pool, or walk, do your PT and mobility, and come back to it tomorrow.",
    };
  return null;
}

// ─── Cycle-aware Today signal ──────────────────────────────────────────────────

/**
 * A gentle bleeding-day note for Today. Cycle-phase periodization has small
 * effects (2025 evidence) and her cycle is irregular, so we don't prescribe by
 * phase — only a light, no-pressure note while she's actually menstruating.
 */
export function cycleSignal(cycle: CycleState | null): Signal | null {
  if (!cycle?.bleedingToday) return null;
  const day = cycle.cycleDay ? ` (day ${cycle.cycleDay})` : "";
  return {
    tone: "accent",
    text: `Period${day}. If you're crampy or wiped, go lighter today, no guilt. If you feel fine, train as normal. Iron-rich food is a plus.`,
  };
}

// ─── Consistency (showing up made visible; ES-safe — momentum, never guilt) ─────

export type Consistency = {
  streak: number; // consecutive "kept" days ending today/yesterday
  bestStreak: number;
  thisWeek: number; // days shown up this week
  active: boolean; // is the streak currently live
};

/**
 * A guilt-free consistency read. A day "counts" if anything was logged; a
 * planned Shabbat rest day (Sunday) never breaks the streak. A gap simply ends
 * the current streak quietly — there is no penalty, no scolding.
 */
export function computeConsistency(
  logs: LogRow[],
  today = new Date(),
): Consistency {
  const daysWithLog = new Set(logs.map((r) => r.logged_at));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const kept = (d: Date) => daysWithLog.has(iso(d)) || d.getDay() === 0; // Sunday = rest

  // Current streak: walk back from today (today not-yet-logged doesn't break it).
  let streak = 0;
  const cur = new Date(today);
  if (!kept(cur)) cur.setDate(cur.getDate() - 1); // grace for today
  while (kept(cur)) {
    if (daysWithLog.has(iso(cur))) streak += 1; // rest days extend but don't add
    cur.setDate(cur.getDate() - 1);
  }

  // Best streak over the last ~180 days.
  let best = 0;
  let run = 0;
  const start = new Date(today);
  start.setDate(start.getDate() - 180);
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    if (kept(d)) {
      if (daysWithLog.has(iso(d))) run += 1;
    } else {
      best = Math.max(best, run);
      run = 0;
    }
  }
  best = Math.max(best, run, streak);

  const hits = weekDayHits(logs);
  const thisWeek = hits.filter(Boolean).length;

  return { streak, bestStreak: best, thisWeek, active: streak > 0 };
}

// ─── Rolling cycle ───────────────────────────────────────────────────────────
//
// Phase 4 measures training as a rolling ~7–10 day dose, not a fixed calendar
// week. This reads the shared logs cache and answers two things: how the current
// cycle is filling in against its targets, and which strength session is next in
// the rotation (from the last one actually completed — never from the weekday).

export type TrainingCycle = {
  windowDays: number;
  strengthDone: number;
  strengthTarget: number;
  zone2Done: number;
  zone2Min: number;
  zone2Max: number;
  runsDone: number;
  runTarget: number;
  /** Days in the window with nothing logged — a proxy for complete recovery days. */
  recoveryDays: number;
  /** Most recent strength session she actually logged (any of L1/U1/L2/U2/G1). */
  lastStrength: SessionKey | null;
  lastStrengthDate: string | null;
  /** Next session in the L1→U1→L2→U2 rotation after the last one completed. */
  nextStrength: SessionKey;
  /** Was the most recent strength session a lower day? (Feeds "don't stack lowers".) */
  lastWasLower: boolean;
};

const STRENGTH_KEYS = new Set<SessionKey>(["L1", "U1", "L2", "U2", "G1"]);
const LOWER_KEYS = new Set<SessionKey>(["L1", "L2"]);
const AEROBIC_RE = /zone\s*2|bike|swim|walk|dance|row|ellip|jog|cardio|cycl/i;

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function computeCycle(logs: LogRow[], now: Date = new Date()): TrainingCycle {
  const win = ROLLING_TARGETS.windowDays;
  const windowSet = new Set<string>();
  for (let i = 0; i < win; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    windowSet.add(isoLocal(d));
  }

  const inWin = logs.filter((l) => windowSet.has(l.logged_at));
  const activeDays = new Set(inWin.map((l) => l.logged_at));

  let strengthDone = 0;
  let zone2Done = 0;
  let runsDone = 0;
  for (const row of inWin) {
    if (isSessionLog(row)) {
      if (STRENGTH_KEYS.has(row.data.sessionKey as SessionKey)) strengthDone += 1;
    } else if (isRunLog(row)) {
      runsDone += 1;
    } else if (isXtrainLog(row) && AEROBIC_RE.test(row.data.modality)) {
      zone2Done += 1;
    }
  }

  // Rotation continuity comes from the last strength session she actually did,
  // across all of history — not just this window — so a quiet stretch doesn't
  // reset her place in the sequence.
  let lastStrength: SessionKey | null = null;
  let lastStrengthDate: string | null = null;
  // Deterministic order: newest calendar day first, and for two logs on the same
  // day the one recorded later wins. Without the created_at tiebreak, two sessions
  // logged the same day resolve in arbitrary order and the "next in rotation" can
  // flip between reloads.
  const sorted = [...logs].sort(
    (a, b) =>
      b.logged_at.localeCompare(a.logged_at) || b.created_at.localeCompare(a.created_at),
  );
  for (const row of sorted) {
    if (isSessionLog(row) && STRENGTH_KEYS.has(row.data.sessionKey as SessionKey)) {
      lastStrength = row.data.sessionKey as SessionKey;
      lastStrengthDate = row.logged_at;
      break;
    }
  }
  const rotationLast = lastStrength && SESSION_SEQUENCE.includes(lastStrength) ? lastStrength : null;

  return {
    windowDays: win,
    strengthDone,
    strengthTarget: ROLLING_TARGETS.strength,
    zone2Done,
    zone2Min: ROLLING_TARGETS.zone2Min,
    zone2Max: ROLLING_TARGETS.zone2Max,
    runsDone,
    runTarget: ROLLING_TARGETS.run,
    recoveryDays: win - activeDays.size,
    lastStrength,
    lastStrengthDate,
    nextStrength: nextStrengthSession(rotationLast),
    lastWasLower: !!lastStrength && LOWER_KEYS.has(lastStrength),
  };
}
