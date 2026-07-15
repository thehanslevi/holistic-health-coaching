import Anthropic from "@anthropic-ai/sdk";
import { buildCoachCore } from "@/lib/coach-context";
import type { COACH_TOOLS, COACH_UNATTENDED_TOOLS } from "@/lib/coach-tools";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

const client = new Anthropic();

// Each tool carries its own argument type, so the toolsets are heterogeneous
// arrays that can't collapse to a single BetaRunnableTool<T>[]. Naming them
// directly keeps full inference and documents what may actually be passed.
type CoachToolset = typeof COACH_TOOLS | typeof COACH_UNATTENDED_TOOLS;

// One coach, one brain, every surface.
//
// The chat coach got tools and real reasoning; the brief and the weekly review
// were left answering from a frozen digest on a cheaper model with a handful of
// hardcoded flags. That split showed: the coach she talked to could go read her
// runs and push back, while the one that pushed to her phone at 8am recited a
// summary. Same voice, two different levels of intelligence, no reason for it.
//
// This is the non-streaming counterpart to the chat route: same model, same
// thinking, same tools, run to completion instead of streamed.

const MODEL = "claude-opus-4-8";

/** What the coach saw and did, kept so a wrong answer can be explained. */
export type CoachRun = {
  text: string;
  /** Everything it was told before it did anything. */
  context: string;
  /** What it went and read, in the order it read it. */
  lookups: { name: string; input: unknown }[];
  model: string;
  generated_at: string;
};

export async function runCoach({
  prompt,
  tools,
  maxTokens = 16000,
  extraContext,
}: {
  prompt: string;
  tools: CoachToolset;
  /**
   * Covers thinking AND output. NOT a length control — the old brief capped this
   * at 300 to keep the brief short, which with adaptive thinking would truncate
   * mid-thought before a word was written. Constrain length in the prompt; leave
   * this generous.
   */
  maxTokens?: number;
  /** Surface-specific context appended after the shared core. */
  extraContext?: string;
}): Promise<CoachRun> {
  const core = await buildCoachCore();
  const context = extraContext ? `${core}\n\n${extraContext}` : core;

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    tools,
    max_iterations: 12,
    system: [
      {
        // Stable prefix — byte-identical with the chat route, so these surfaces
        // share its cached tools+system block rather than paying a cold write.
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: context },
    ],
    messages: [{ role: "user", content: prompt }],
  });

  // Iterated rather than awaited so the lookups can be captured on the way past.
  // Iteration ends when the coach stops calling tools, and the last message it
  // yields is the final answer.
  const lookups: { name: string; input: unknown }[] = [];
  let final: Anthropic.Beta.BetaMessage | undefined;
  for await (const message of runner) {
    final = message;
    for (const block of message.content) {
      if (block.type === "tool_use") lookups.push({ name: block.name, input: block.input });
    }
  }

  const text = (final?.content ?? [])
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return { text, context, lookups, model: MODEL, generated_at: new Date().toISOString() };
}
