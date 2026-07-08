import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { fetchMemoryNotes, memoryBlock } from "@/lib/coach-context";
import { SESSIONS, SESSION_ORDER } from "@/lib/program";
import { supabase } from "@/lib/supabase";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { isSessionLog, type LogRow, type ProgramOverride } from "@/lib/types";

const client = new Anthropic();

// Coach reviews recent performance against current targets and proposes changes.
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const db = supabase();
    // Progression is a trend decision, not a snapshot: look back far enough that
    // even a lift trained ~once a week accumulates a real run of sessions, and
    // consistency dips don't masquerade as a plateau.
    const LOOKBACK_DAYS = 56; // ~8 weeks
    const MIN_SESSIONS = 3; // don't judge a lift on fewer than this
    const since = new Date();
    since.setDate(since.getDate() - LOOKBACK_DAYS);

    const [logsRes, ovrRes, memory] = await Promise.all([
      db
        .from("hrl_logs")
        .select("*")
        .eq("kind", "session")
        .gte("logged_at", since.toISOString().slice(0, 10))
        .order("logged_at", { ascending: false })
        .limit(80),
      db.from("hrl_program_overrides").select("*"),
      fetchMemoryNotes(db),
    ]);
    const logs = (logsRes.data ?? []) as LogRow[];
    const overrides = new Map(
      ((ovrRes.data ?? []) as ProgramOverride[]).map((o) => [o.exercise_id, o]),
    );

    // Build a per-exercise performance picture for weighted lifts with data.
    // For each session capture the top set's weight AND its reps, so the model
    // can reason about double progression (hit the top of the rep range → bump).
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
          } · top sets newest-first: ${recent}${
            ex.note ? ` · coach note: ${ex.note.slice(0, 220)}` : ""
          }`,
        );
      }
    }

    if (lines.length === 0) {
      return NextResponse.json({ proposals: [], reason: "no logged lifts yet" });
    }

    const mem = memoryBlock(memory);
    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ];
    if (mem) system.push({ type: "text", text: mem });

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
    if (!match) return NextResponse.json({ proposals: [] });
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return NextResponse.json({ proposals: [] });
    }
    const raw = (parsed as { proposals?: unknown })?.proposals;
    const proposals = Array.isArray(raw) ? raw.slice(0, 5) : [];
    return NextResponse.json({ proposals });
  } catch (e) {
    return errorResponse(e);
  }
}
