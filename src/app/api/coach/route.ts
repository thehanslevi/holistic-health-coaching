import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { buildCoachCore } from "@/lib/coach-context";
import { COACH_TOOLS, toolStatusLabel } from "@/lib/coach-tools";
import { supabase } from "@/lib/supabase";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import type { ChatMessage } from "@/lib/types";

const client = new Anthropic();

// The coach reasons, then goes and looks, then reasons again — so a turn is a
// loop, not a single completion. It gets a small always-true context plus tools
// over her real data, rather than a fixed digest computed before the question
// was known.
//
// Wire format: plain UTF-8 text, with control frames delimited by \x1e (ASCII
// record separator, which never appears in model output). Frames carry status
// while the coach is thinking or querying, so a multi-second lookup reads as
// work rather than as a hang.
const RS = "\x1e";
const frame = (obj: unknown) => `${RS}${JSON.stringify(obj)}${RS}`;

export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { conversationId, message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const db = supabase();

    // Resolve or create the conversation
    let convId: string = conversationId;
    if (!convId) {
      const title = message.replace(/\s+/g, " ").slice(0, 60);
      const { data, error } = await db
        .from("hrl_conversations")
        .insert({ title })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      convId = data.id;
    }

    const [historyRes, core] = await Promise.all([
      db
        .from("hrl_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true }),
      buildCoachCore(),
    ]);
    if (historyRes.error) throw new Error(historyRes.error.message);
    const history = (historyRes.data ?? []) as ChatMessage[];

    // Persist the user turn up front so history survives a failed stream
    const { error: userInsertError } = await db
      .from("hrl_messages")
      .insert({ conversation_id: convId, role: "user", content: message });
    if (userInsertError) throw new Error(userInsertError.message);

    const runner = client.beta.messages.toolRunner({
      model: "claude-opus-4-8",
      max_tokens: 32000,
      // Adaptive thinking: the model decides how much deliberation a question
      // deserves. "Should I train hard today" is a genuine multi-variable call —
      // recovery signals against their own baseline, joint response to recent
      // load, the week so far, whatever the athlete's own status says — and it
      // used to get a single forward pass.
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tools: COACH_TOOLS,
      max_iterations: 12,
      system: [
        {
          // Stable prefix. Tools render ahead of this, so both are cached
          // together and both must stay byte-identical across requests.
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
        {
          // Volatile block, after the cache breakpoint
          type: "text",
          text: core,
        },
      ],
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: message },
      ],
      stream: true,
    });

    let assistantText = "";
    const persistAssistant = async () => {
      if (!assistantText.trim()) return;
      await db
        .from("hrl_messages")
        .insert({ conversation_id: convId, role: "assistant", content: assistantText });
      await db
        .from("hrl_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", convId);
    };

    const readableStream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (s: string) => controller.enqueue(enc.encode(s));
        try {
          // Outer loop: one pass per model turn. Between passes the runner
          // executes whatever tools the coach asked for.
          for await (const messageStream of runner) {
            for await (const event of messageStream) {
              if (event.type === "content_block_start") {
                if (event.content_block.type === "thinking") {
                  send(frame({ type: "status", text: "Thinking…" }));
                }
              } else if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta"
              ) {
                assistantText += event.delta.text;
                send(event.delta.text);
              }
            }

            // Tool inputs only exist once the block is complete, so label the
            // lookups here — right before the runner runs them.
            const finalMessage = await messageStream.finalMessage();
            for (const block of finalMessage.content) {
              if (block.type === "tool_use") {
                send(
                  frame({ type: "status", text: toolStatusLabel(block.name, block.input) }),
                );
              }
            }
          }
          send(frame({ type: "status", text: "" }));
          await persistAssistant();
          controller.close();
        } catch (e) {
          await persistAssistant(); // keep whatever streamed before the failure
          controller.error(e);
        }
      },
      async cancel() {
        // Client hit Stop or navigated away: stop paying for tokens, keep the partial
        await persistAssistant();
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Conversation-Id": convId,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
