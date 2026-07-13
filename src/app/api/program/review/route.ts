import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { buildCoachAnalysis } from "@/lib/coach-analysis";
import { fetchMemoryNotes, memoryBlock } from "@/lib/coach-context";
import { SESSIONS, SESSION_ORDER } from "@/lib/program";
import { supabase } from "@/lib/supabase";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { isSessionLog, type HealthRow, type LogRow, type ProgramOverride } from "@/lib/types";

const client = new Anthropic();

// Coach-driven PROGRAM DESIGN review: looks at the whole program against her
// goals and recommends structural changes (add / swap / drop exercises), not
// weight bumps. Cached per day in hrl_briefs (kind=program_review); ?refresh=1
// regenerates.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const db = supabase();
    const today = new Date().toISOString().slice(0, 10);
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";

    if (!refresh) {
      const { data } = await db
        .from("hrl_briefs")
        .select("content")
        .eq("brief_date", today)
        .eq("kind", "program_review")
        .maybeSingle();
      if (data) return NextResponse.json({ content: data.content, cached: true });
    }

    const trendSince = new Date();
    trendSince.setDate(trendSince.getDate() - 28);
    const [ovrRes, logsRes, healthRes, memory] = await Promise.all([
      db.from("hrl_program_overrides").select("*"),
      db
        .from("hrl_logs")
        .select("*")
        .gte("logged_at", trendSince.toISOString().slice(0, 10))
        .order("logged_at", { ascending: false })
        .limit(80),
      db.from("hrl_health").select("*").order("date", { ascending: false }).limit(21),
      fetchMemoryNotes(db),
    ]);

    const overrides = new Map(
      ((ovrRes.data ?? []) as ProgramOverride[]).map((o) => [o.exercise_id, o]),
    );
    const logs = (logsRes.data ?? []) as LogRow[];
    const health = (healthRes.data ?? []) as HealthRow[];
    const analysis = buildCoachAnalysis(logs, health);

    // The full current program — every circuit and exercise, override-aware.
    const program: string[] = [];
    for (const sk of SESSION_ORDER) {
      const s = SESSIONS[sk];
      program.push(`\n${s.label} (${sk}) — ${s.subtitle}:`);
      for (const ex of s.exercises) {
        const target = overrides.get(ex.id)?.target ?? ex.target;
        const load = ex.weighted !== false ? `, target ${target}` : "";
        const note = ex.note ? `  [${ex.note.slice(0, 160)}]` : "";
        program.push(`  - ${ex.name}: ${ex.sets} x ${ex.reps}${load}${note}`);
      }
    }

    // Which exercises she actually trains (so the review can flag dead weight).
    const logged = new Set<string>();
    for (const row of logs) {
      if (!isSessionLog(row)) continue;
      for (const k of Object.keys(row.data.sets)) logged.add(k.replace(/_s\d+$/, ""));
    }

    const mem = memoryBlock(memory);
    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ];
    if (mem) system.push({ type: "text", text: mem });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      system,
      messages: [
        {
          role: "user",
          content: `Do a PROGRAM DESIGN REVIEW of my whole program against my goals. You know my goals and my constraints. This is structural, NOT a weight review, so do not tell me to add pounds to anything.

Here is my full current program, every circuit and every exercise:
${program.join("\n")}

Exercises I have actually logged recently: ${[...logged].join(", ") || "none in the window"}.

${analysis}

Look at the structure against what I am training for: my first strict pull-up, a lean muscular athletic build, the hybrid strength-and-endurance rebuild, protecting muscle while I am on the medication, and my left knee and right ankle. Give me 3 to 5 concrete recommendations, most important first. For each: the specific structural change (an exercise to add and which day, one to swap, or one to drop or cut back) and one line on why it serves a specific goal. Respect every HOLD, cap, and joint note in the program above, and never recommend something that fights my knee or ankle. If a part of the program is already well built for a goal, say so instead of inventing a change. Be specific and plain, no filler. Obey the voice and banned-word rules in your instructions.`,
        },
      ],
    });

    const content =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (content) {
      await db
        .from("hrl_briefs")
        .upsert(
          { brief_date: today, kind: "program_review", readiness: null, content },
          { onConflict: "brief_date,kind" },
        );
    }
    return NextResponse.json({ content, cached: false });
  } catch (e) {
    return errorResponse(e);
  }
}
