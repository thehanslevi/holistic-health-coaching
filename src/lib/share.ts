import { getOrCreateWeeklyReview, mondayOf } from "@/lib/review";
import { SESSIONS, runTraffic, type SessionKey } from "@/lib/program";
import { getActivePhase } from "@/lib/phases";
import { phaseLabel } from "@/lib/phase-format";
import { supabase } from "@/lib/supabase";
import {
  isRunLog,
  isSessionLog,
  isXtrainLog,
  type Checkin,
  type HealthRow,
  type LogRow,
  type Recovery,
  type SessionLogData,
} from "@/lib/types";

function shortDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${dow} ${d.getMonth() + 1}/${d.getDate()}`;
}

// Best (heaviest) set per exercise in a session, as "Name R×W".
function topSets(data: SessionLogData): string[] {
  const session = SESSIONS[data.sessionKey as SessionKey];
  if (!session) return [];
  const out: string[] = [];
  for (const ex of session.exercises) {
    let best: { reps: string; weight: number } | null = null;
    for (let i = 0; i < ex.sets; i++) {
      const s = data.sets[`${ex.id}_s${i}`];
      if (!s) continue;
      const w = Number(s.weight) || 0;
      if (ex.weighted !== false && w > 0) {
        if (!best || w > best.weight) best = { reps: s.reps ?? "?", weight: w };
      }
    }
    if (best) out.push(`${ex.name} ${best.reps}×${best.weight}`);
  }
  return out;
}

function formatSession(row: LogRow & { data: SessionLogData }): string {
  const d = row.data;
  const session = SESSIONS[d.sessionKey as SessionKey];
  const label = session ? `${session.label} (${d.sessionKey})` : d.sessionKey;
  const lines = [`${shortDay(row.logged_at)}  ${label}`];
  const sets = topSets(d);
  if (sets.length) lines.push(`  ${sets.join(" · ")}`);
  const tail: string[] = [`Knee ${d.kneeStart}→${d.kneeEnd}`];
  if (d.ptDone) tail.push("PT ✓");
  lines.push(`  ${tail.join(" · ")}`);
  return lines.join("\n");
}

function formatRun(d: LogRow["data"] & { run_dist?: string }): string {
  const r = d as import("@/lib/types").RunLogData;
  const t = runTraffic(r.run_am_knee, r.run_am_ankle);
  const light = t.light === "green" ? "GRN" : t.light === "yellow" ? "⚠ YEL" : "⛔ RED";
  return [
    `${shortDay(r.run_date || r.date)}  Run — ${r.run_dist || "?"} mi${r.run_time ? `, ${r.run_time}` : ""}`,
    `  During k${r.run_knee_end || "-"}/a${r.run_ankle || "-"} · Next-AM k${r.run_am_knee || "-"}/a${r.run_am_ankle || "-"} ${light}`,
  ].join("\n");
}

function formatXtrain(d: import("@/lib/types").XtrainLogData): string {
  return `${shortDay(d.date)}  ${d.modality}${d.duration ? ` — ${d.duration} min` : ""}${d.intensity ? ` (${d.intensity})` : ""}`;
}

// Assemble the full plain-text weekly report to hand a coach or PT.
export async function buildWeeklyShareText(): Promise<{ text: string; week: string }> {
  const db = supabase();
  const week = mondayOf(new Date());
  const weekEndD = new Date(week + "T00:00:00");
  weekEndD.setDate(weekEndD.getDate() + 6);
  const weekEnd = weekEndD.toISOString().slice(0, 10);

  const [logsRes, healthRes, checkinRes, recoveryRes, review, phase] = await Promise.all([
    db
      .from("hrl_logs")
      .select("*")
      .gte("logged_at", week)
      .lte("logged_at", weekEnd)
      .order("logged_at", { ascending: true }),
    db.from("hrl_health").select("*").gte("date", week).lte("date", weekEnd),
    db.from("hrl_checkins").select("*").gte("date", week).lte("date", weekEnd),
    db.from("hrl_recovery").select("*").gte("date", week).lte("date", weekEnd),
    getOrCreateWeeklyReview(),
    getActivePhase(),
  ]);

  const logs = (logsRes.data ?? []) as LogRow[];
  const health = (healthRes.data ?? []) as HealthRow[];
  const checkins = (checkinRes.data ?? []) as Checkin[];
  const recovery = (recoveryRes.data ?? []) as Recovery[];

  const rangeLabel = `${new Date(week + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${weekEndD.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const parts: string[] = [];
  parts.push(`VOLT — WEEK OF ${rangeLabel.toUpperCase()}`);
  parts.push(phaseLabel(phase));
  parts.push("");
  parts.push("── COACH'S WEEKLY REVIEW ──");
  parts.push(review.content);

  // Training
  const trained = logs.filter((l) => isSessionLog(l) || isRunLog(l) || isXtrainLog(l));
  parts.push("");
  parts.push("── TRAINING ──");
  if (trained.length === 0) {
    parts.push("No sessions logged this week.");
  } else {
    for (const row of logs) {
      if (isSessionLog(row)) parts.push(formatSession(row));
      else if (isRunLog(row)) parts.push(formatRun(row.data));
      else if (isXtrainLog(row)) parts.push(formatXtrain(row.data));
    }
  }

  // Recovery & health
  const health_bits: string[] = [];
  const slept = health.filter((h) => h.sleep_hours != null);
  if (slept.length) {
    const avg = slept.reduce((s, h) => s + (h.sleep_hours ?? 0), 0) / slept.length;
    health_bits.push(`Sleep avg ${avg.toFixed(1)}h`);
  }
  const rhr = health.filter((h) => h.resting_hr != null);
  if (rhr.length)
    health_bits.push(`RHR ${Math.round(rhr.reduce((s, h) => s + (h.resting_hr ?? 0), 0) / rhr.length)}`);
  const hrv = health.filter((h) => h.hrv != null);
  if (hrv.length)
    health_bits.push(`HRV ${Math.round(hrv.reduce((s, h) => s + (h.hrv ?? 0), 0) / hrv.length)}`);

  // Readiness sequence Mon..Sun
  const readinessByDate = new Map(checkins.map((c) => [c.date, c.readiness]));
  const seq: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(week + "T12:00:00");
    day.setDate(day.getDate() + i);
    const r = readinessByDate.get(day.toISOString().slice(0, 10));
    seq.push(r ? r[0].toUpperCase() : "—");
  }

  const fueledRows = recovery.filter((r) => r.fueled != null);
  const fueledYes = fueledRows.filter((r) => r.fueled).length;
  const sessionLogs = logs.filter(isSessionLog);

  if (health_bits.length || checkins.length || recovery.length || sessionLogs.length) {
    parts.push("");
    parts.push("── RECOVERY & HEALTH ──");
    if (health_bits.length) parts.push(health_bits.join(" · "));
    parts.push(`Readiness: ${seq.join(" ")}`);
    const compliance: string[] = [];
    if (fueledRows.length) compliance.push(`Fueled ${fueledYes}/${fueledRows.length}`);
    if (compliance.length) parts.push(compliance.join(" · "));
  }

  parts.push("");
  parts.push("Sent from Volt · holistic-health-coaching.vercel.app");

  return { text: parts.join("\n"), week };
}
