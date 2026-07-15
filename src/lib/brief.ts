import { runCoach } from "@/lib/coach-run";
import { COACH_UNATTENDED_TOOLS } from "@/lib/coach-tools";
import { WEEKLY_SCHEDULE } from "@/lib/program";
import { supabase } from "@/lib/supabase";

// The coach's morning brief. Cached per (date, readiness): a new readiness
// check-in invalidates the cache so the brief reacts to how she's arriving.
// Shared by GET /api/brief (Today screen) and the daily push sender.
export async function getOrCreateDailyBrief(forceRefresh = false): Promise<{
  content: string;
  cached: boolean;
}> {
  const db = supabase();
  const today = new Date().toISOString().slice(0, 10);

  const [briefRes, checkinRes] = await Promise.all([
    db.from("hrl_briefs").select("*").eq("brief_date", today).eq("kind", "daily").maybeSingle(),
    db.from("hrl_checkins").select("readiness").eq("date", today).maybeSingle(),
  ]);
  const readiness: string | null = checkinRes.data?.readiness ?? null;

  if (!forceRefresh && briefRes.data && briefRes.data.readiness === readiness) {
    return { content: briefRes.data.content, cached: true };
  }

  const dayIdx = (new Date().getDay() + 6) % 7;
  const schedule = WEEKLY_SCHEDULE[dayIdx];

  // Same model, thinking, and tools as the chat coach — it goes and looks before
  // it writes, instead of paraphrasing a digest someone else pre-chewed for it.
  const content = await runCoach({
    tools: COACH_UNATTENDED_TOOLS,
    maxTokens: 8000,
    prompt: `Write my morning brief for today. Today's scheduled slot: "${schedule.label}". My readiness check-in today: ${readiness ?? "not recorded yet"}.

Go look first. The block above is a summary, not the data — check whatever actually bears on today before you write a word. Usually that means how the week is really going, how my joints answered the last thing that loaded them, my recovery against my own baseline rather than a remembered number, and any open decision of yours that's now due. Two or three lookups is normal. Do not write this from the summary alone.

If a decision of yours is due or overtaken, close it (close_decision) and let that drive today's line. If today's call is one you'll want to hold me to for more than today, record it (record_decision).

Then write the brief itself.

LENGTH IS A HARD CONSTRAINT: 40 words maximum, two sentences maximum. This is a push notification — it lands on my lock screen, and everything past roughly the first line is cut off and never read. A brilliant third sentence is a wasted one. All that digging you just did earns you ONE call, said in the fewest words that still land it. Cut the reasoning, keep the instruction.

- The single most useful thing for me today, nothing else.
- It must be something I could not have worked out by glancing at my own screen. A call for today's session, a real heads-up, or the one thing to prioritize or protect.
- No recap of numbers I already know. No generic encouragement.
- If readiness is yellow or red, lead with what to change.
- If there is little or no recent training, DO NOT mention that, and do not refer to logs, data, or a "blank slate" in any way. Just give me one concrete, useful line for today.
- If it is Shabbat, one plain line about resting.

Plain text only. No preamble, no headers, no lists. Return only the brief — nothing about what you looked up. Obey the voice and banned-word rules in your instructions.`,
  });
  if (content) {
    await db
      .from("hrl_briefs")
      .upsert(
        { brief_date: today, kind: "daily", readiness, content },
        { onConflict: "brief_date,kind" },
      );
  }
  return { content, cached: false };
}
