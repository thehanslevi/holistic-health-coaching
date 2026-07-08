import Anthropic from "@anthropic-ai/sdk";
import { fetchMemoryNotes, memoryBlock } from "@/lib/coach-context";
import { formatLogAsText } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import type { LogRow } from "@/lib/types";

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
  const { data: logRows, error } = await db
    .from("hrl_logs")
    .select("*")
    .gte("logged_at", week)
    .lte("logged_at", weekEnd.toISOString().slice(0, 10))
    .order("logged_at", { ascending: true });
  if (error) throw new Error(error.message);
  const logs = (logRows ?? []) as LogRow[];

  if (logs.length === 0) {
    return {
      content: "Nothing logged this week yet. The review writes itself as you train.",
      week,
      cached: false,
      empty: true,
    };
  }

  const logsText = logs.map((l) => formatLogAsText(l)).join("\n\n");
  const mem = memoryBlock(await fetchMemoryNotes(db));

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: `${mem}WEEK UNDER REVIEW (Mon ${week} onward):\n\n${logsText}` },
    ],
    messages: [
      {
        role: "user",
        content: `Write my weekly review. Structure: one short paragraph on what the week proved (reference concrete numbers), one on joint signals (knee and ankle against the traffic light), one on what next week should target. Plain prose, no headers, no lists, no preamble. Under 180 words.`,
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
