import type { SupabaseClient } from "@supabase/supabase-js";
import { cycleContextLine, deriveCycleState, type CycleDay } from "@/lib/cycle";
import { formatLogAsText } from "@/lib/format";
import { runTraffic } from "@/lib/program";
import { supabase } from "@/lib/supabase";
import {
  isRunLog,
  type Checkin,
  type CoachContextSummary,
  type LogRow,
} from "@/lib/types";

const WINDOW_DAYS = 14;
const MAX_CONTEXT_CHARS = 9000;

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Durable memory notes the coach has accumulated. Shared by chat, brief, review.
export async function fetchMemoryNotes(db: SupabaseClient): Promise<string[]> {
  const { data } = await db
    .from("hrl_memory")
    .select("content")
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => r.content as string);
}

export function memoryBlock(notes: string[]): string {
  if (!notes.length) return "";
  return [
    "PERSISTENT MEMORY — durable facts you have saved about the athlete across past conversations. Treat as current unless something in this session contradicts it.",
    ...notes.map((n) => `- ${n}`),
    "",
  ].join("\n");
}

// Assembles the dynamic context block the coach sees on every message.
// Lives in a second, UNCACHED system block so the cached SYSTEM_PROMPT
// prefix stays byte-identical across requests.
export async function buildCoachContext(): Promise<{
  block: string;
  summary: CoachContextSummary;
}> {
  const since = daysAgoISO(WINDOW_DAYS);
  const db = supabase();

  const cycleSince = daysAgoISO(180);
  const [logsRes, checkinRes, memory, healthRes, ovrRes, recoveryRes, cycleRes] = await Promise.all([
    db
      .from("hrl_logs")
      .select("*")
      .gte("logged_at", since)
      .order("logged_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40),
    db.from("hrl_checkins").select("*").order("date", { ascending: false }).limit(1),
    fetchMemoryNotes(db),
    db.from("hrl_health").select("*").order("date", { ascending: false }).limit(7),
    db.from("hrl_program_overrides").select("exercise_id, target, note"),
    db.from("hrl_recovery").select("*").order("date", { ascending: false }).limit(1),
    db.from("hrl_cycle").select("date, is_period, flow").gte("date", cycleSince).order("date", { ascending: true }),
  ]);
  if (logsRes.error) throw new Error(logsRes.error.message);

  const logs = (logsRes.data ?? []) as LogRow[];
  const latestCheckin = (checkinRes.data?.[0] ?? null) as Checkin | null;
  const health = (healthRes.data ?? []) as {
    date: string;
    sleep_hours: number | null;
    steps: number | null;
    resting_hr: number | null;
    hrv: number | null;
  }[];

  const lastRun = logs.find(isRunLog);
  const traffic = lastRun
    ? runTraffic(lastRun.data.run_am_knee, lastRun.data.run_am_ankle)
    : null;

  const sessionCount = logs.filter((l) => l.kind === "session").length;
  const runCount = logs.filter((l) => l.kind === "run").length;
  const xtrainCount = logs.filter((l) => l.kind === "xtrain").length;

  const lines: string[] = [
    `DYNAMIC CONTEXT — auto-generated from the athlete's tracker (last ${WINDOW_DAYS} days). Read before responding; takes precedence over defaults.`,
    `Current date: ${new Date().toISOString().slice(0, 10)}`,
    latestCheckin
      ? `Latest readiness check-in: ${latestCheckin.readiness.toUpperCase()} on ${latestCheckin.date}${latestCheckin.note ? ` — "${latestCheckin.note}"` : ""}`
      : "No readiness check-ins recorded.",
    traffic && lastRun
      ? `Run traffic light: ${traffic.label} (last run ${lastRun.logged_at}, ${lastRun.data.run_dist || "?"} mi)`
      : "No runs logged in window.",
    `Window totals: ${sessionCount} strength sessions, ${runCount} runs, ${xtrainCount} cross-training.`,
  ];

  const recovery = (recoveryRes.data?.[0] ?? null) as {
    date: string;
    fueled: boolean | null;
    post_run_protocol: boolean | null;
    vipassana: number | null;
    sleep_quality: number | null;
  } | null;
  if (recovery) {
    const bits = [
      recovery.fueled != null ? `fueled: ${recovery.fueled ? "yes" : "no"}` : null,
      recovery.post_run_protocol != null
        ? `ankle post-run protocol: ${recovery.post_run_protocol ? "done" : "not done"}`
        : null,
      recovery.vipassana != null ? `Vipassana: ${recovery.vipassana}/3` : null,
      recovery.sleep_quality != null ? `sleep quality: ${recovery.sleep_quality}/5` : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`Recovery check (${recovery.date}): ${bits.join(", ")}.`);
  }

  const overrides = (ovrRes.data ?? []) as {
    exercise_id: string;
    target: string | null;
    note: string | null;
  }[];
  if (overrides.length) {
    lines.push(
      "",
      "PROGRAM ADJUSTMENTS (current working targets that override the base program; treat these as the active plan):",
      ...overrides
        .filter((o) => o.target)
        .map((o) => `- ${o.exercise_id}: ${o.target}${o.note ? ` (${o.note})` : ""}`),
    );
  }

  if (health.length) {
    const latest = health[0];
    const slept = health.filter((h) => h.sleep_hours != null);
    const avgSleep = slept.length
      ? (slept.reduce((s, h) => s + (h.sleep_hours ?? 0), 0) / slept.length).toFixed(1)
      : null;
    const bits = [
      latest.sleep_hours != null ? `sleep ${latest.sleep_hours}h (avg ${avgSleep}h)` : null,
      latest.steps != null ? `${latest.steps} steps` : null,
      latest.resting_hr != null ? `resting HR ${latest.resting_hr}` : null,
      latest.hrv != null ? `HRV ${latest.hrv}` : null,
    ].filter(Boolean);
    if (bits.length)
      lines.push(`Apple Health (as of ${latest.date}): ${bits.join(", ")}.`);
  }

  const cycleLine = cycleContextLine(deriveCycleState((cycleRes.data ?? []) as CycleDay[]));
  if (cycleLine) lines.push(`Menstrual cycle: ${cycleLine}`);

  if (logs.length) {
    lines.push("", "--- RECENT LOGS (newest first) ---");
    let used = lines.join("\n").length;
    for (const row of logs) {
      const text = formatLogAsText(row);
      if (used + text.length > MAX_CONTEXT_CHARS) {
        lines.push(`[…older logs truncated at ${MAX_CONTEXT_CHARS} chars]`);
        break;
      }
      lines.push(text, "");
      used += text.length + 1;
    }
  } else {
    lines.push("", "No logs in the window yet.");
  }

  const mem = memoryBlock(memory);
  return {
    block: mem ? `${mem}\n${lines.join("\n")}` : lines.join("\n"),
    summary: {
      sessionCount,
      runStatus: traffic?.light ?? null,
      sinceDays: WINDOW_DAYS,
      lastLogDate: logs[0]?.logged_at ?? null,
    },
  };
}
