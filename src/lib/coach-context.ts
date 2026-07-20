import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCoachAnalysis } from "@/lib/coach-analysis";
import { cycleContextLine, deriveCycleState, type CycleDay } from "@/lib/cycle";
import { formatLogAsText } from "@/lib/format";
import { daysAgoISO, mondayOf, todayISO } from "@/lib/day";
import { PHASE, runTraffic } from "@/lib/program";
import { supabase } from "@/lib/supabase";
import {
  isRunLog,
  type Checkin,
  type CoachContextSummary,
  type HealthRow,
  type LogRow,
  type ProfileEntry,
} from "@/lib/types";

// The living profile Hannah maintains — authoritative, current, and overrides
// anything older in the static system prompt.
export function profileBlock(entries: ProfileEntry[]): string {
  if (!entries.length) return "";
  const active = entries.filter((e) => e.status === "active");
  const resolved = entries.filter((e) => e.status === "resolved");
  const label = (k: string) => (k === "priority" ? "priority" : k === "constraint" ? "constraint" : "note");
  const lines = [
    "HANNAH'S CURRENT STATUS — she maintains this herself. It is CURRENT and AUTHORITATIVE. It OVERRIDES anything older in your background profile; where they conflict, THIS wins. Do not apply an old constraint she has marked resolved.",
  ];
  if (active.length) {
    lines.push("Current:");
    for (const e of active) lines.push(`- [${label(e.kind)}] ${e.text}`);
  }
  if (resolved.length) {
    lines.push("Resolved / no longer a factor (do NOT program around these):");
    for (const e of resolved) lines.push(`- ${e.text}`);
  }
  return lines.join("\n") + "\n";
}

const WINDOW_DAYS = 14;
const MAX_CONTEXT_CHARS = 9000;

// Dates resolve in the athlete's timezone, not the server's — see lib/day.ts.

// ─── Core context (tool-enabled chat coach) ───────────────────────────────────
//
// The chat coach gets a SMALL always-on context and a set of tools, rather than
// a fixed digest of everything. This block holds only what is true right now and
// cheap to state — who she is today, where the week stands, the latest readings.
// Anything historical, per-lift, or trend-shaped is deliberately absent: the
// coach fetches that itself, so it reads the real series instead of a summary of
// a summary that was computed once and frozen.
//
// buildCoachContext (below) is unchanged and still serves the brief and review.

const mean = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);

function medianOf(ns: number[]): number {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function buildCoachCore(): Promise<string> {
  const db = supabase();
  const monday = mondayOf();
  const today = todayISO();

  const [weekRes, checkinRes, healthRes, hrvRes, recoveryRes, cycleRes, profileRes, decisions, lastRunRes] =
    await Promise.all([
      db.from("hrl_logs").select("logged_at, kind, session_key").gte("logged_at", monday),
      db.from("hrl_checkins").select("*").order("date", { ascending: false }).limit(1),
      db.from("hrl_health").select("*").order("date", { ascending: false }).limit(1),
      db
        .from("hrl_health")
        .select("hrv")
        .gte("date", daysAgoISO(60))
        .order("date", { ascending: false }),
      db.from("hrl_recovery").select("*").order("date", { ascending: false }).limit(1),
      db
        .from("hrl_cycle")
        .select("date, is_period, flow")
        .gte("date", daysAgoISO(180))
        .order("date", { ascending: true }),
      db.from("hrl_profile").select("*").order("status", { ascending: true }).order("created_at", { ascending: true }),
      fetchOpenDecisions(db),
      db
        .from("hrl_logs")
        .select("*")
        .eq("kind", "run")
        .order("logged_at", { ascending: false })
        .limit(1),
    ]);

  const week = (weekRes.data ?? []) as { logged_at: string; kind: string; session_key: string | null }[];
  const sessions = week.filter((w) => w.kind === "session");
  const runs = week.filter((w) => w.kind === "run");
  const xtrain = week.filter((w) => w.kind === "xtrain");

  const lines: string[] = [
    "RIGHT NOW — auto-generated, current as of this message. This is a summary, not the data. You have tools; use them to look at the actual logs, lift histories, run responses, and health series before making a call. Do not answer a question about a trend, a progression, or how something has been going from this block alone — go read it.",
    `Today: ${today} (week starting ${monday})`,
    `Current program phase: ${PHASE}`,
    "",
    `This week so far: ${sessions.length} strength session(s)${
      sessions.length ? ` (${sessions.map((s) => s.session_key).filter(Boolean).join(", ")})` : ""
    }, ${runs.length} run(s), ${xtrain.length} cross-training.`,
  ];

  const checkin = (checkinRes.data?.[0] ?? null) as Checkin | null;
  lines.push(
    checkin
      ? `Latest readiness check-in: ${checkin.readiness.toUpperCase()} on ${checkin.date}${checkin.note ? ` — "${checkin.note}"` : ""}`
      : "No readiness check-in recorded.",
  );

  const health = (healthRes.data?.[0] ?? null) as HealthRow | null;
  if (health) {
    const bits = [
      health.sleep_hours != null ? `sleep ${health.sleep_hours}h` : null,
      health.hrv != null ? `HRV ${health.hrv}` : null,
      health.resting_hr != null ? `resting HR ${health.resting_hr}` : null,
      health.steps != null ? `${health.steps} steps` : null,
    ].filter(Boolean);
    if (bits.length) {
      // Freshness is load-bearing, and its absence caused a real failure: the
      // coach read a day-old HRV of 28.7 and told her it had "dropped hard
      // overnight". The date was right here in the context; nothing said to care.
      //
      // Two facts make same-day health data untrustworthy. Her export syncs
      // sporadically (often late at night, sometimes not before the 8am brief),
      // so the newest row is frequently yesterday's. And it REVISES past days as
      // more samples land — that same 28.7 was later corrected to 42.4. A reading
      // is provisional until the day is over.
      if (health.date === today) {
        lines.push(
          `Apple Health (today, ${health.date}): ${bits.join(", ")}. Today's numbers can still be revised upward as more samples sync, so treat them as provisional — real but not final.`,
        );
      } else {
        lines.push(
          `Apple Health — the most recent readings are from ${health.date}, which is NOT today (${today}). Today's have not synced yet. These are ${bits.join(", ")}. Do NOT describe them as this morning's, and do NOT say anything "dropped overnight" — you do not know what happened overnight. If today's recovery matters to your answer, say plainly that today's numbers aren't in yet.`,
        );
      }
    }
  }

  // Baseline is COMPUTED, never remembered — it moves, and a stale one is worse
  // than none. Stated here only so a flagged reading is legible at a glance.
  const hrvs = ((hrvRes.data ?? []) as { hrv: number | null }[])
    .map((r) => r.hrv)
    .filter((v): v is number => v != null);
  if (hrvs.length >= 5) {
    lines.push(
      `HRV baseline over the last 60 days: median ${Math.round(medianOf(hrvs))}, last-7 mean ${Math.round(
        mean(hrvs.slice(0, 7)),
      )} (n=${hrvs.length}). Judge today's reading against this, not against a remembered number.`,
    );
  }

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
      recovery.sleep_quality != null ? `sleep quality: ${recovery.sleep_quality}/5` : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`Recovery check (${recovery.date}): ${bits.join(", ")}.`);
  }

  const cycleLine = cycleContextLine(deriveCycleState((cycleRes.data ?? []) as CycleDay[]));
  if (cycleLine) lines.push(`Menstrual cycle: ${cycleLine}`);

  const lastRun = ((lastRunRes.data ?? []) as LogRow[]).find(isRunLog);
  if (lastRun) {
    const t = runTraffic(lastRun.data.run_am_knee, lastRun.data.run_am_ankle);
    lines.push(
      `Most recent run: ${lastRun.logged_at}, ${lastRun.data.run_dist || "?"} mi — next-AM signal ${t.light}. Call get_run_history before any volume decision; one run is not a trend.`,
    );
  } else {
    lines.push("No runs logged.");
  }

  const profile = profileBlock((profileRes.data ?? []) as ProfileEntry[]);
  const open = decisionsBlock(decisions);
  return [profile, open, lines.join("\n")].filter(Boolean).join("\n");
}

// The coach's open decisions. Shared by chat, brief, review, program review.
//
// This replaced a flat "persistent memory" list of sentences the model rewrote
// after every turn. That design stored CONCLUSIONS ("ankle trending up",
// "baseline HRV ~43") which were true when written and rotted afterward — and
// rewriting the whole list each turn made it drift besides. Durable facts about
// her now live in hrl_profile, which she maintains; anything derivable from her
// data is computed on demand via the coach's tools.
//
// What remains worth carrying between sessions is the coach's own reasoning:
// what it decided, why, and what would change its mind. That is append-only, so
// it cannot drift, and it is small enough to sit in front of the coach on every
// surface rather than waiting behind a tool call.
export type OpenDecision = {
  id: string;
  created_at: string;
  decision: string;
  rationale: string;
  review_trigger: string | null;
};

export async function fetchOpenDecisions(db: SupabaseClient): Promise<OpenDecision[]> {
  const { data } = await db
    .from("hrl_decisions")
    .select("id, created_at, decision, rationale, review_trigger")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  return (data ?? []) as OpenDecision[];
}

export function decisionsBlock(decisions: OpenDecision[]): string {
  if (!decisions.length) return "";
  const days = (iso: string) =>
    Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return [
    "YOUR OPEN DECISIONS — calls you made in earlier sessions that are still standing. This is your own reasoning, not a fact about her. Pick these threads back up: if a review trigger has been met, go check the data and close it with close_decision. If one is stale or was overtaken by events, close it honestly. Do not silently contradict an open decision — if you are changing your mind, say so and close it.",
    ...decisions.map((d) =>
      [
        `- [${d.id}] ${d.decision} (made ${days(d.created_at)}d ago)`,
        `    why: ${d.rationale}`,
        d.review_trigger ? `    revisit when: ${d.review_trigger}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
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
  const trendSince = daysAgoISO(28);
  const [logsRes, checkinRes, decisions, healthRes, ovrRes, recoveryRes, cycleRes, trendRes, profileRes] =
    await Promise.all([
      db
        .from("hrl_logs")
        .select("*")
        .gte("logged_at", since)
        .order("logged_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40),
      db.from("hrl_checkins").select("*").order("date", { ascending: false }).limit(1),
      fetchOpenDecisions(db),
      db.from("hrl_health").select("*").order("date", { ascending: false }).limit(14),
      db.from("hrl_program_overrides").select("exercise_id, target, note"),
      db.from("hrl_recovery").select("*").order("date", { ascending: false }).limit(1),
      db.from("hrl_cycle").select("date, is_period, flow").gte("date", cycleSince).order("date", { ascending: true }),
      db
        .from("hrl_logs")
        .select("*")
        .gte("logged_at", trendSince)
        .order("logged_at", { ascending: false })
        .limit(80),
      db
        .from("hrl_profile")
        .select("*")
        .order("status", { ascending: true })
        .order("created_at", { ascending: true }),
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
    `Current date: ${todayISO()}`,
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

  const open = decisionsBlock(decisions);
  const profile = profileBlock((profileRes.data ?? []) as ProfileEntry[]);
  const analysis = buildCoachAnalysis(
    (trendRes.data ?? []) as LogRow[],
    (healthRes.data ?? []) as HealthRow[],
  );
  const blockBody = `${lines.join("\n")}\n\n${analysis}`;
  return {
    block: [profile, open, blockBody].filter(Boolean).join("\n"),
    summary: {
      sessionCount,
      runStatus: traffic?.light ?? null,
      sinceDays: WINDOW_DAYS,
      lastLogDate: logs[0]?.logged_at ?? null,
    },
  };
}
