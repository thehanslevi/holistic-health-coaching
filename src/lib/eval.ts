import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guardBrief, type Violation } from "@/lib/brief-guard";
import { getOrCreateDailyBrief } from "@/lib/brief";
import { todayISO } from "@/lib/day";

// The eval harness. Two layers:
//   1. guardBrief — deterministic, free, catches the known classes of bug.
//   2. an LLM judge — a cheap model reading the brief against the exact context
//      it was written from, scoring the things regexes can't: is the number
//      grounded, is the cue real, would a coach who knew her say this.
// Runs nightly on today's brief (regenerating it once if it fails, so she never
// sees the bad one), and on demand as a REPLAY over past briefs — the same
// judge over her real history, which is how a prompt change gets checked
// before it ships instead of after.

const JUDGE_MODEL = "claude-sonnet-4-6";

export type Judge = {
  pass: boolean;
  score: number; // 0–10
  issues: string[];
  grounded: boolean;
  actionable: boolean;
};

const RUBRIC = `You are auditing a one-line morning training brief written by an AI coach for a single athlete. You are given the brief and the exact context block it was written from. Judge ONLY against that context.

Score 0–10 and return JSON: {"pass": bool, "score": n, "grounded": bool, "actionable": bool, "issues": ["..."]}.

pass = false if ANY of these hold:
- A load or rep prescription in the brief does not match the "NEXT STRENGTH SESSION" block (wrong session's number, invented number).
- It invents logistics: time limits, "if you run out of time", session lengths, telling her to skip/trim/reorder without her readiness check-in being Low.
- It quotes a same-day sleep/HRV/resting-HR figure.
- It contains motivational filler or generic coaching register with no specific content.
- It restates what's already on her screen (exercise order, counts) instead of adding something.
- It names a weekday as the reason for the session.

grounded = every number and claim traces to the context. actionable = she'd do something differently because of it (a target, a real cue), not just feel encouraged. A brief that is just "session + correct primary lift target" and nothing else is a PASS with score ~7 — short and accurate beats padded. Be strict; issues must quote the offending words.

Choosing the day is the brief's job: the athlete follows a rolling rotation with no fixed weekdays, so recommending a run, an easy Zone 2 session, or the next strength session — including a cardio dose like "3 easy miles" or "30-40 min" — is the coach's legitimate call, NOT an invention, and it does not require a readiness check-in (none filed is the normal case). Judge the CHOICE only for consistency with RECENT TRAINING and the phase focus; judge the NUMBERS for grounding. What IS a failure: a strength load not in the session block, a claimed trend the numbers contradict, a claimed history the log doesn't show, or a call that contradicts one of the coach's own OPEN DECISIONS.

Reading the context: "RIGHT NOW" carries health trend, baseline, readiness, and the most recent run; "RECENT TRAINING" lists what she actually did and when; "NEXT STRENGTH SESSION" (present only in newer briefs) carries the prescribed loads. A claim like "no run in eight days" or "HRV ran low this week" is GROUNDED if those sections support it. A recommended cardio session with a duration ("Zone 2 bike, 30–40 min") is a legitimate prescription, not invented logistics. If the context has no NEXT STRENGTH SESSION block, judge loads against whatever the context does say and do not fail the brief merely because the block is absent — but a load that appears nowhere in the context is still invented.`;

// The whole context, capped. The judge needs RIGHT NOW + RECENT TRAINING too, or
// it calls every trend claim invented.
function judgeContext(context: string): string {
  return context.length > 9000 ? context.slice(0, 9000) + "\n…[truncated]" : context;
}

export async function judgeBrief(content: string, context: string, readiness: string | null): Promise<Judge> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 600,
    system: RUBRIC,
    messages: [
      {
        role: "user",
        content: `READINESS CHECK-IN: ${readiness ?? "none"}\n\nCONTEXT THE BRIEF WAS WRITTEN FROM:\n${judgeContext(context)}\n\nBRIEF:\n"${content}"\n\nReturn JSON only.`,
      },
    ],
  });
  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { pass: false, score: 0, issues: ["judge returned no JSON"], grounded: false, actionable: false };
  try {
    const j = JSON.parse(m[0]) as Partial<Judge>;
    return {
      pass: !!j.pass,
      score: Number(j.score ?? 0),
      issues: Array.isArray(j.issues) ? j.issues.map(String) : [],
      grounded: !!j.grounded,
      actionable: !!j.actionable,
    };
  } catch {
    return { pass: false, score: 0, issues: ["judge JSON unparseable"], grounded: false, actionable: false };
  }
}

export type EvalResult = {
  surface: "brief";
  subject_date: string;
  content: string;
  passed: boolean;
  violations: Violation[];
  judge: Judge;
  regenerated: boolean;
};

async function record(db: SupabaseClient, r: EvalResult, model: string | null) {
  await db.from("hrl_evals").insert({
    surface: r.surface,
    subject_date: r.subject_date,
    content: r.content,
    passed: r.passed,
    violations: r.violations,
    judge: r.judge,
    model,
    regenerated: r.regenerated,
  });
}

/** Judge one stored brief row (no regeneration). */
export async function evalBriefRow(
  db: SupabaseClient,
  row: { brief_date: string; readiness: string | null; content: string; inputs: { context?: string; model?: string } | null },
  persist = true,
): Promise<EvalResult> {
  const context = row.inputs?.context ?? "";
  const violations = guardBrief(row.content, context, row.readiness);
  const judge = await judgeBrief(row.content, context, row.readiness);
  const r: EvalResult = {
    surface: "brief",
    subject_date: row.brief_date,
    content: row.content,
    passed: violations.length === 0 && judge.pass,
    violations,
    judge,
    regenerated: false,
  };
  if (persist) await record(db, r, row.inputs?.model ?? null);
  return r;
}

/**
 * Nightly: judge today's brief; if it fails, regenerate once (the guard inside
 * brief.ts gets a second shot too) and judge again. She sees the better one.
 */
export async function evalToday(db: SupabaseClient): Promise<{ first: EvalResult; second?: EvalResult }> {
  const today = todayISO();
  const { data } = await db.from("hrl_briefs").select("*").eq("brief_date", today).eq("kind", "daily").maybeSingle();
  if (!data) {
    // No brief yet today — generate, then judge that.
    await getOrCreateDailyBrief(false);
  }
  const fresh = await db.from("hrl_briefs").select("*").eq("brief_date", today).eq("kind", "daily").maybeSingle();
  const row = fresh.data as { brief_date: string; readiness: string | null; content: string; inputs: { context?: string; model?: string } | null };
  const first = await evalBriefRow(db, row);
  if (first.passed) return { first };

  await getOrCreateDailyBrief(true);
  const again = await db.from("hrl_briefs").select("*").eq("brief_date", today).eq("kind", "daily").maybeSingle();
  const row2 = again.data as typeof row;
  const second = await evalBriefRow(db, row2, false);
  second.regenerated = true;
  await record(db, second, row2.inputs?.model ?? null);
  return { first, second };
}

/** Replay: judge the last N stored briefs. The regression suite, on her real data. */
export async function replayBriefs(db: SupabaseClient, n: number, persist: boolean): Promise<EvalResult[]> {
  const { data } = await db
    .from("hrl_briefs")
    .select("*")
    .eq("kind", "daily")
    .order("brief_date", { ascending: false })
    .limit(n);
  const rows = (data ?? []) as { brief_date: string; readiness: string | null; content: string; inputs: { context?: string; model?: string } | null }[];
  const out: EvalResult[] = [];
  for (const row of rows) out.push(await evalBriefRow(db, row, persist));
  return out;
}
