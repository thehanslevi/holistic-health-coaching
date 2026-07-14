import Anthropic from "@anthropic-ai/sdk";
import { buildCoachAnalysis } from "@/lib/coach-analysis";
import { decisionsBlock, fetchOpenDecisions } from "@/lib/coach-context";
import { formatLogAsText } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import type { HealthRow, LogRow } from "@/lib/types";

const client = new Anthropic();

export function mondayOf(d: Date): string {
  const m = new Date(d);
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return m.toISOString().slice(0, 10);
}

// Coach-written weekly review, cached per week (hrl_briefs kind=weekly).
// Shared by GET /api/review (Progress screen) and the share-with-coach export.
export async function getOrCreateWeeklyReview(
  forceRefresh = false,
): Promise<{ content: string; week: string; cached: boolean; empty?: boolean }> {
  const db = supabase();
  const week = mondayOf(new Date());

  if (!forceRefresh) {
    const { data } = await db
      .from("hrl_briefs")
      .select("*")
      .eq("brief_date", week)
      .eq("kind", "weekly")
      .maybeSingle();
    if (data) return { content: data.content, week, cached: true };
  }

  const weekEnd = new Date(week + "T00:00:00");
  weekEnd.setDate(weekEnd.getDate() + 6);
  // Trends need history beyond the week; pull ~5 weeks for analysis + health.
  const trendSince = new Date(week + "T00:00:00");
  trendSince.setDate(trendSince.getDate() - 28);
  const [weekRes, trendRes, healthRes] = await Promise.all([
    db
      .from("hrl_logs")
      .select("*")
      .gte("logged_at", week)
      .lte("logged_at", weekEnd.toISOString().slice(0, 10))
      .order("logged_at", { ascending: true }),
    db
      .from("hrl_logs")
      .select("*")
      .gte("logged_at", trendSince.toISOString().slice(0, 10))
      .order("logged_at", { ascending: false })
      .limit(80),
    db.from("hrl_health").select("*").order("date", { ascending: false }).limit(21),
  ]);
  if (weekRes.error) throw new Error(weekRes.error.message);
  const logs = (weekRes.data ?? []) as LogRow[];
  const trendLogs = (trendRes.data ?? []) as LogRow[];
  const health = (healthRes.data ?? []) as HealthRow[];

  if (logs.length === 0) {
    return {
      content: "Nothing logged this week yet. The review writes itself as you train.",
      week,
      cached: false,
      empty: true,
    };
  }

  const analysis = buildCoachAnalysis(trendLogs, health);
  const weekLogsText = logs.map((l) => formatLogAsText(l)).join("\n\n");
  const open = decisionsBlock(await fetchOpenDecisions(db));

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      {
        type: "text",
        text: `${open}${analysis}\n\n--- THIS WEEK'S SESSIONS (for reference only, do not recap) ---\n${weekLogsText}`,
      },
    ],
    messages: [
      {
        role: "user",
        content: `Write my weekly review as my coach.

This is analysis, not a recap. Do NOT list my numbers back to me. I know what I lifted. Use the computed analysis above.

1. Lead with the ONE or TWO things that actually matter that I might not see myself: a pattern, a mismatch, a risk, or something working and why it's working. If there's a mismatch flag, that is almost certainly your lead.
2. Then a short, specific, prioritized plan for next week with the reasoning: what to push, what to hold, what to protect, and why.
3. Sound like a specialist, not a generalist. Ground it in real methodology (concurrent-training high-low, tendon loading, muscle protection on the medication, autoregulation, double progression) without lecturing.

Plain prose, no headers, no lists, no preamble. 120 to 180 words. Obey the voice and banned-word rules in your instructions.`,
      },
    ],
  });

  const content =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
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
