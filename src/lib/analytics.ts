import { SESSIONS, SESSION_ORDER } from "@/lib/program";
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

/** Exercises (across all sessions) that have at least one logged weighted set */
export function loggedExercises(logs: LogRow[]): { id: string; name: string }[] {
  const seen = new Set<string>();
  for (const row of logs) {
    if (!isSessionLog(row)) continue;
    for (const [key, entry] of Object.entries(row.data.sets)) {
      if (entry.weight) seen.add(key.replace(/_s\d+$/, ""));
    }
  }
  const out: { id: string; name: string }[] = [];
  for (const sk of SESSION_ORDER) {
    for (const ex of SESSIONS[sk].exercises) {
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

/** % of strength sessions with the PT circuit done, per week */
export function ptCompliance(logs: LogRow[]): WeekPoint[] {
  const byWeek = new Map<string, { done: number; total: number }>();
  for (const row of logs) {
    if (!isSessionLog(row)) continue;
    const wk = weekOf(row.logged_at);
    const cur = byWeek.get(wk) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (row.data.ptDone) cur.done += 1;
    byWeek.set(wk, cur);
  }
  return [...byWeek.entries()]
    .map(([week, { done, total }]) => ({
      week,
      value: Math.round((done / total) * 100),
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
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

import { runTraffic } from "@/lib/program";
import type { HealthRow } from "@/lib/types";

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

function volumeForWeekStart(logs: LogRow[], weekStart: string): number {
  let vol = 0;
  for (const row of logs) {
    if (!isSessionLog(row) || weekOf(row.logged_at) !== weekStart) continue;
    vol += sessionVolume(row.data);
  }
  return vol;
}

/** Coach-worded alerts computed from logs + health. Most severe first. */
export function computeSignals(logs: LogRow[], health: HealthRow[]): Signal[] {
  const out: Signal[] = [];

  // Ankle / knee next-AM trend across recent runs
  const runs = runSeries(logs);
  const scored = runs.filter((r) => r.amKnee > 0 || r.amAnkle > 0);
  if (scored.length >= 2) {
    const recent = scored.slice(-3);
    const ankleUp =
      recent.length >= 2 &&
      recent[recent.length - 1].amAnkle >= 3 &&
      recent[recent.length - 1].amAnkle >= recent[0].amAnkle &&
      recent[recent.length - 1].amAnkle > 2;
    const kneeUp =
      recent.length >= 2 &&
      recent[recent.length - 1].amKnee >= 3 &&
      recent[recent.length - 1].amKnee >= recent[0].amKnee;
    const last = scored[scored.length - 1];
    const light = runTraffic(last.amKnee, last.amAnkle).light;
    if (light === "red")
      out.push({ tone: "stop", text: "Last run's next-AM response was red. Bike or pool only until it settles, and flag it for PT." });
    else if (ankleUp)
      out.push({ tone: "hold", text: `Right ankle next-AM is climbing (now ${last.amAnkle}/10). Freeze run volume and refine form before adding mileage.` });
    else if (kneeUp)
      out.push({ tone: "hold", text: `Left knee next-AM is trending up (now ${last.amKnee}/10). Hold volume and watch it into the next afternoon.` });
  }

  // Weekly volume spike (current logged week vs prior)
  const weeks = weeklyVolume(logs).map((w) => w.week);
  if (weeks.length >= 2) {
    const thisW = weeks[weeks.length - 1];
    const prevW = weeks[weeks.length - 2];
    const cur = volumeForWeekStart(logs, thisW);
    const prev = volumeForWeekStart(logs, prevW);
    if (prev > 0 && cur > prev * 1.35) {
      const pct = Math.round(((cur - prev) / prev) * 100);
      out.push({ tone: "hold", text: `Weekly lifting volume is up ${pct}% over last week. Strong, but watch knee response and fatigue.` });
    }
  }

  // PT compliance slipping this week
  const pt = ptCompliance(logs);
  if (pt.length) {
    const thisWeek = weekOf(new Date().toISOString().slice(0, 10));
    const cur = pt.find((p) => p.week === thisWeek);
    const sessionsThisWeek = logs.filter(
      (r) => isSessionLog(r) && weekOf(r.logged_at) === thisWeek,
    ).length;
    if (cur && sessionsThisWeek >= 2 && cur.value < 50)
      out.push({ tone: "accent", text: `PT circuit is at ${cur.value}% this week. It's your posterior-tibial insurance for running — don't let it slide.` });
  }

  // Sleep low (Apple Health)
  const slept = health.filter((h) => h.sleep_hours != null).slice(0, 3);
  if (slept.length >= 2) {
    const avg = slept.reduce((s, h) => s + (h.sleep_hours ?? 0), 0) / slept.length;
    if (avg < 6.5)
      out.push({ tone: "hold", text: `Sleep is averaging ${avg.toFixed(1)}h over your last ${slept.length} nights. Sleep is foundational — protect it before pushing intensity.` });
  }

  return out.slice(0, 4);
}
