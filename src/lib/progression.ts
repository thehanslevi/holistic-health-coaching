import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decisionsBlock, fetchOpenDecisions } from "@/lib/coach-context";
import { SESSIONS, SESSION_ORDER } from "@/lib/program";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { isSessionLog, type LogRow, type ProgramOverride, type ProgramProposal } from "@/lib/types";

// The self-updating-baseline engine (workstream #1). The coach reads recent
// logged performance against the current working targets and proposes changes —
// bumps a lift has earned, or a target that should match what she's actually
// lifting. Pure derivation + one model call; the caller decides what to do with
// the result (surface for confirm on demand, or persist from a scheduled run).
//
// This is deliberately EVIDENCE-driven: the "current load" comes from the logs,
// not from a hardcoded number, so baselines track her instead of rotting in code.

const LOOKBACK_DAYS = 56; // ~8 weeks — enough that a once-weekly lift accrues a real run
const MIN_SESSIONS = 3; // never judge a lift on fewer than this

export async function computeProposals(db: SupabaseClient): Promise<ProgramProposal[]> {
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  const [logsRes, ovrRes, decisions] = await Promise.all([
    db
      .from("hrl_logs")
      .select("*")
      .eq("kind", "session")
      .gte("logged_at", since.toISOString().slice(0, 10))
      .order("logged_at", { ascending: false })
      .limit(80),
    db.from("hrl_program_overrides").select("*"),
    fetchOpenDecisions(db),
  ]);
  const logs = (logsRes.data ?? []) as LogRow[];
  const overrides = new Map(((ovrRes.data ?? []) as ProgramOverride[]).map((o) => [o.exercise_id, o]));

  // Per-exercise performance picture: top set (weight × reps) per session, so the
  // model can reason about double progression (top of the rep range → bump).
  const lines: string[] = [];
  for (const sk of SESSION_ORDER) {
    for (const ex of SESSIONS[sk].exercises) {
      if (ex.weighted === false) continue;
      const perSession: { date: string; weight: number; reps: string }[] = [];
      for (const row of logs) {
        if (!isSessionLog(row)) continue;
        let topWeight = 0;
        let topReps = "";
        for (const [key, entry] of Object.entries(row.data.sets)) {
          if (!key.startsWith(ex.id + "_s")) continue;
          const w = Number(entry.weight) || 0;
          if (w > topWeight) {
            topWeight = w;
            topReps = entry.reps ?? "";
          }
        }
        if (topWeight > 0) perSession.push({ date: row.logged_at, weight: topWeight, reps: topReps });
      }
      if (perSession.length === 0) continue;
      const recent = perSession
        .slice(0, 6)
        .map((t) => `${t.weight}lb×${t.reps || "?"} (${t.date})`)
        .join(", ");
      const target = overrides.get(ex.id)?.target ?? ex.target;
      const enough = perSession.length >= MIN_SESSIONS;
      lines.push(
        `- ${ex.name} [id: ${ex.id}] · rep target: ${ex.reps} · current target: ${target} · sessions in window: ${perSession.length}${
          enough ? "" : " (TOO FEW — need " + MIN_SESSIONS + "+)"
        } · top sets newest-first: ${recent}${ex.note ? ` · coach note: ${ex.note.slice(0, 220)}` : ""}`,
      );
    }
  }

  if (lines.length === 0) return [];

  const open = decisionsBlock(decisions);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ];
  if (open) system.push({ type: "text", text: open });

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system,
    messages: [
      {
        role: "user",
        content: `Review my strength progressions using an 8-week window. Each weighted lift shows its rep target, current weight target, how many sessions I logged for it in the window, and my top set (weight×reps) per session, newest first:\n\n${lines.join(
          "\n",
        )}\n\nThis is a TREND decision, not a snapshot — progress me on consistent evidence, not one or two good days. Propose a target change only when ALL hold: (1) at least 3 logged sessions for that lift in the window (a lift marked "TOO FEW" does NOT have enough data yet — never propose for it, it needs more logging first); (2) across the most recent sessions I am consistently hitting the TOP of the rep target at the current weight with clean form (double progression: top of the rep range across all sets, then the smallest increment); (3) the coach note does NOT say to HOLD, cap, or "do not chase load". Weigh consistency explicitly: if my logging is sparse or my top sets bounce around, hold and say the priority is stringing sessions together first. When my recent working weight already sits above the listed target across 3+ sessions, propose updating the target to match what I am actually lifting. Respect every HOLD / do-not-chase-load instruction absolutely — never propose an increase for those lifts, no matter the numbers. Stay injury-aware; knee and ankle are the limiters. Return JSON only: {"proposals": [{"exercise_id": "...", "exercise_name": "...", "current_target": "...", "proposed_target": "...", "rationale": "one sentence citing the sessions"}]}. Empty array if nothing has earned it yet — that is the correct and common answer. At most 5 proposals.`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const raw = (parsed as { proposals?: unknown })?.proposals;
  if (!Array.isArray(raw)) return [];
  const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
  return raw
    .filter(
      (p): p is ProgramProposal =>
        !!p &&
        typeof (p as ProgramProposal).exercise_id === "string" &&
        typeof (p as ProgramProposal).proposed_target === "string",
    )
    // Drop no-ops: the model sometimes "proposes" the current target unchanged
    // ("already at 120, no change needed") — that isn't a change to confirm.
    .filter((p) => norm(p.proposed_target) !== norm(p.current_target))
    .slice(0, 5);
}

/**
 * Recompute proposals and persist them as the live "pending" set (workstream #1's
 * scheduled path). Replaces prior pending rows so the surface always reflects the
 * latest read; applied/dismissed history is left untouched.
 */
export async function recomputeAndPersist(db: SupabaseClient): Promise<ProgramProposal[]> {
  const proposals = await computeProposals(db);
  // Clear the previous pending set, then insert the fresh one. (No pending rows
  // when nothing is earned — the common, correct case.)
  await db.from("hrl_proposals").delete().eq("status", "pending");
  if (proposals.length) {
    await db.from("hrl_proposals").insert(
      proposals.map((p) => ({
        exercise_id: p.exercise_id,
        exercise_name: p.exercise_name ?? null,
        current_target: p.current_target ?? null,
        proposed_target: p.proposed_target,
        rationale: p.rationale ?? null,
        status: "pending",
      })),
    );
  }
  return proposals;
}
