import { runCoach } from "@/lib/coach-run";
import { COACH_UNATTENDED_TOOLS } from "@/lib/coach-tools";
import { supabase } from "@/lib/supabase";
import type { LogRow } from "@/lib/types";
import { daysAfterISO, mondayOf } from "@/lib/day";

// Coach-written weekly review, cached per week (hrl_briefs kind=weekly).
// Shared by GET /api/review (Progress screen) and the share-with-coach export.
export async function getOrCreateWeeklyReview(
  forceRefresh = false,
): Promise<{ content: string; week: string; cached: boolean; empty?: boolean }> {
  const db = supabase();
  const week = mondayOf();

  if (!forceRefresh) {
    const { data } = await db
      .from("hrl_briefs")
      .select("*")
      .eq("brief_date", week)
      .eq("kind", "weekly")
      .maybeSingle();
    if (data) return { content: data.content, week, cached: true };
  }

  const weekEndISO = daysAfterISO(6, week);

  // Only needed to answer "did she train at all this week" — the coach pulls the
  // history it actually wants through its own tools, over whatever window the
  // question deserves, rather than being handed a fixed 4-week slice.
  const { data, error } = await db
    .from("hrl_logs")
    .select("id")
    .gte("logged_at", week)
    .lte("logged_at", weekEndISO);
  if (error) throw new Error(error.message);
  const logs = (data ?? []) as Pick<LogRow, "id">[];

  if (logs.length === 0) {
    return {
      content: "Nothing logged this week yet. The review writes itself as you train.",
      week,
      cached: false,
      empty: true,
    };
  }

  const content = await runCoach({
    tools: COACH_UNATTENDED_TOOLS,
    maxTokens: 16000,
    prompt: `Write my weekly review as my coach. The week is ${week} to ${weekEndISO}.

Go and do the work first. Nothing has been pre-analysed for you and nothing should be — read what you actually need. At minimum that means this week's sessions, how the lifts you care about are really tracking over a window long enough to mean something, how my joints answered any running, and my recovery against my own computed baseline. Look up whatever else the week raises. Several lookups is normal and expected.

Check your open decisions. If one's review trigger has been met, verify it against the data and close it with what actually happened — including if it didn't work. If this review lands on a call you'll hold me to next week, record it.

Then write the review:

1. Lead with the ONE or TWO things that actually matter that I could not see myself — a pattern, a mismatch, a risk, or something working and WHY it's working. Something that took your looking to find.
2. Then a short, specific, prioritized plan for next week with the reasoning: what to push, what to hold, what to protect, and why.
3. Sound like a specialist, not a generalist. Ground it in real methodology (concurrent-training high-low, tendon loading, protecting lean mass given my medical context, autoregulation, double progression) without lecturing.

This is analysis, not a recap. Do NOT list my numbers back to me — I know what I lifted. Do not say what you looked up or narrate your process; just tell me what it means.

Plain prose, no headers, no lists, no preamble. 120 to 180 words. Obey the voice and banned-word rules in your instructions.`,
  });
  if (content) {
    await db
      .from("hrl_briefs")
      .upsert(
        { brief_date: week, kind: "weekly", readiness: null, content },
        { onConflict: "brief_date,kind" },
      );
  }
  return { content, week, cached: false };
}
