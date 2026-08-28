import { runCoach } from "@/lib/coach-run";
import { COACH_UNATTENDED_TOOLS } from "@/lib/coach-tools";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/day";
import { rewriteInVoice } from "@/lib/voice";

/** Full weekday name for a YYYY-MM-DD date. Anchored at noon UTC so the calendar
 *  day is stable regardless of where the code runs. */
function weekdayName(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}

// The coach's morning brief. Cached per (date, readiness): a new readiness
// check-in invalidates the cache so the brief reacts to how she's arriving.
// Shared by GET /api/brief (Today screen) and the daily push sender.
export type BriefInputs = {
  generated_at: string;
  model: string;
  context: string;
  lookups: { name: string; input: unknown }[];
};

export async function getOrCreateDailyBrief(forceRefresh = false): Promise<{
  content: string;
  cached: boolean;
  inputs: BriefInputs | null;
}> {
  const db = supabase();
  const today = todayISO();

  const [briefRes, checkinRes] = await Promise.all([
    db.from("hrl_briefs").select("*").eq("brief_date", today).eq("kind", "daily").maybeSingle(),
    db.from("hrl_checkins").select("readiness").eq("date", today).maybeSingle(),
  ]);
  const readiness: string | null = checkinRes.data?.readiness ?? null;

  if (!forceRefresh && briefRes.data && briefRes.data.readiness === readiness) {
    return { content: briefRes.data.content, cached: true, inputs: (briefRes.data.inputs ?? null) as BriefInputs | null };
  }

  const today_weekday = weekdayName(today);

  // Same model, thinking, and tools as the chat coach — it goes and looks before
  // it writes, instead of paraphrasing a digest someone else pre-chewed for it.
  const run = await runCoach({
    tools: COACH_UNATTENDED_TOOLS,
    maxTokens: 8000,
    prompt: `Write my morning brief for today (${today_weekday}). My readiness check-in today: ${readiness ?? "not recorded yet"}.

There is NO fixed weekday schedule. Recommend today's session from the rolling rotation and how I'm actually recovering — never from what day of the week it is. Go look before you decide: what I've actually completed in the last several days (so you know where I am in the strength rotation and whether I've stacked hard days), how my knee and ankle answered the last thing that loaded them, my recovery against my own baseline, and any open decision of yours that's now due. get_program gives you the rotation, the ~7–10 day cycle targets, and the sequencing rules. Two or three lookups is normal. Do not write this from the summary alone.

TODAY'S OVERNIGHT NUMBERS ARE NOT REAL YET. It is early; Apple Health is still consolidating last night. Sleep in particular often shows as a partial block right now and will be two or three times higher by lunchtime, and same-day HRV and resting HR swing as more samples land. get_health_series marks today's row PROVISIONAL and gives you the settled readings separately — use those. NEVER quote a specific same-day sleep, HRV, or resting-HR figure, and never build the day's call on one; you have said "you slept three hours" off a number that was eight by noon. If you need a recovery read this morning, use my readiness check-in (I logged it myself) and the trend of settled days, and speak in direction ("last night ran short", "HRV's been low this week"), not a number.

If a decision of yours is due or overtaken, close it (close_decision) and let that drive today's line. If today's call is one you'll want to hold me to for more than today, record it (record_decision).

Then write the brief itself.

LENGTH: 40 words maximum, two sentences maximum. This lands on my lock screen — everything past the first line or two is cut off. Say the useful thing in the fewest words that still carry the specifics.

WHAT THE BRIEF MUST DO — give me information I'd act on, not encouragement:
- LEAD with today's session and the ONE prescription that matters most for it: the primary lift's target LOAD and REPS for THIS session, taken straight from the "NEXT STRENGTH SESSION" block in your context (e.g. "L2 lower: RDL 3×10–12 @ 95"). Never a load or rep count from a different session or rep range — the L1 strength RDL (~150 for 5–7) is a different lift from the L2 hypertrophy RDL (~95 for 10–12). If you're not certain of a number, name the session and lift without inventing a weight.
- THEN, only if there's a real one, add a single concrete cue I'd act on: a lift that's earned a load bump (name it and the new number), a readiness-driven trim, or an ankle/run heads-up. One, not a list.
- BANNED — motivational filler and empty coaching register. Never "stop short", "don't grind", "stay strong", "trust the process", "keep it clean", "protect the ankle", "show up". If you have nothing specific to add beyond the session and its target, stop there — a short accurate brief beats a padded one.
- No recap of numbers I can already see on my own screen.
- If readiness is yellow or red, lead with the concrete change (drop a set, cap the top-end load).
- If there's little or no recent training, don't mention it or refer to logs/data/"blank slate" — just give one concrete line for today.
- Name the actual session (e.g. "L2 lower today", "easy Zone 2 today"), never a weekday.
- Saturday defaults to recovery unless I've clearly chosen to train; don't assume Sunday is rest — I often resume then.

Plain text only. No preamble, no headers, no lists. Return only the brief — nothing about what you looked up. Obey the voice and banned-word rules in your instructions.`,
  });
  // Voice gate: the brief lands on her lock screen, so it's the surface where a
  // single AI-ism is most glaring. Rewrite to coach voice, holding the 40-word cap.
  const content = await rewriteInVoice(run.text, { maxWords: 40 });
  if (content) {
    await db.from("hrl_briefs").upsert(
      {
        brief_date: today,
        kind: "daily",
        readiness,
        content,
        // What it saw, so "why did it say that?" is answerable later.
        inputs: { generated_at: run.generated_at, model: run.model, context: run.context, lookups: run.lookups },
      },
      { onConflict: "brief_date,kind" },
    );
  }
  return {
    content,
    cached: false,
    inputs: { generated_at: run.generated_at, model: run.model, context: run.context, lookups: run.lookups },
  };
}
