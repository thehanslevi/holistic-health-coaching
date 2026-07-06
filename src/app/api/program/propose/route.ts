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
    const since = new Date();
    since.setDate(since.getDate() - 35);

    const [logsRes, ovrRes, memory] = await Promise.all([
      db
        .from("hrl_logs")
        .select("*")
        .eq("kind", "session")
        .gte("logged_at", since.toISOString().slice(0, 10))
        .order("logged_at", { ascending: false })
        .limit(40),
      db.from("hrl_program_overrides").select("*"),
      fetchMemoryNotes(db),
    ]);
    const logs = (logsRes.data ?? []) as LogRow[];
    const overrides = new Map(
      ((ovrRes.data ?? []) as ProgramOverride[]).map((o) => [o.exercise_id, o]),
    );

    // Build a per-exercise performance picture for weighted lifts with data.
    const lines: string[] = [];
    for (const sk of SESSION_ORDER) {
      for (const ex of SESSIONS[sk].exercises) {
        if (ex.weighted === false) continue;
        const topByDate: { date: string; top: number }[] = [];
        for (const row of logs) {
          if (!isSessionLog(row)) continue;
          let top = 0;
          for (const [key, entry] of Object.entries(row.data.sets)) {
            if (key.startsWith(ex.id + "_s")) top = Math.max(top, Number(entry.weight) || 0);
          }
          if (top > 0) topByDate.push({ date: row.logged_at, top });
        }
        if (topByDate.length === 0) continue;
        const recent = topByDate.slice(0, 3).map((t) => `${t.top}lb (${t.date})`).join(", ");
        const target = overrides.get(ex.id)?.target ?? ex.target;
        lines.push(
          `- ${ex.name} [id: ${ex.id}] · current target: ${target} · recent top sets: ${recent}${
            ex.note ? ` · coach note: ${ex.note.slice(0, 220)}` : ""
          }`,
        );
      }
    }

    if (lines.length === 0) {
      return NextResponse.json({ proposals: [] });
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
          content: `Review my strength progressions. Here is each weighted lift with its current target and my recent top sets:\n\n${lines.join(
            "\n",
          )}\n\nPropose a target change when BOTH hold: (1) my recent top sets across at least two sessions clearly meet or exceed the current target at the prescribed reps, and (2) the coach note does NOT say to HOLD, cap, or "do not chase load". When my recent working weight already sits above the listed target, propose updating the target to match what I am actually lifting (a small increment beyond is fine only if the note allows). Respect every HOLD / do-not-chase-load instruction absolutely — never propose an increase for those lifts, no matter the numbers. Stay injury-aware; knee and ankle are the limiters. Return JSON only: {"proposals": [{"exercise_id": "...", "exercise_name": "...", "current_target": "...", "proposed_target": "...", "rationale": "one sentence"}]}. Empty array if nothing is genuinely ready. At most 5 proposals.`,
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
