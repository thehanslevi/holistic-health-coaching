import Anthropic from "@anthropic-ai/sdk";
import { buildCoachContext } from "@/lib/coach-context";
import { WEEKLY_SCHEDULE } from "@/lib/program";
import { supabase } from "@/lib/supabase";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

const client = new Anthropic();

// The coach's morning brief. Cached per (date, readiness): a new readiness
// check-in invalidates the cache so the brief reacts to how she's arriving.
// Shared by GET /api/brief (Today screen) and the daily push sender.
export async function getOrCreateDailyBrief(): Promise<{
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

  if (briefRes.data && briefRes.data.readiness === readiness) {
    return { content: briefRes.data.content, cached: true };
  }

  const context = await buildCoachContext(); // block already includes the computed analysis
  const dayIdx = (new Date().getDay() + 6) % 7;
  const schedule = WEEKLY_SCHEDULE[dayIdx];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: context.block },
    ],
    messages: [
      {
        role: "user",
        content: `Write my morning brief for today. Today's scheduled slot: "${schedule.label}". My readiness check-in today: ${readiness ?? "not recorded yet"}.

Rules: 1 to 2 short sentences, the single most useful thing for me today. Use the computed analysis to say something real and specific: a call for today's session, a heads-up tied to a pattern or mismatch, or the one thing to prioritize or protect. Not a generic line, and not a recap of numbers I already know. If there is little or no recent training, DO NOT mention that or refer to logs, data, or a "blank slate" in any way; just give me one concrete, useful line for today. If readiness is yellow or red, lead with what to change. If it is Shabbat, one plain line about resting. Plain text only, no preamble. Obey the voice and banned-word rules in your instructions.`,
      },
    ],
  });

  const content =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
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
