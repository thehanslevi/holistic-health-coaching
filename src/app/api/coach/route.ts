import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { buildCoachContext } from "@/lib/coach-context";
import { supabase } from "@/lib/supabase";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import type { ChatMessage } from "@/lib/types";

const client = new Anthropic();

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

    // Prior turns + dynamic context
    const [historyRes, context] = await Promise.all([
      db
        .from("hrl_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true }),
      buildCoachContext(),
    ]);
    if (historyRes.error) throw new Error(historyRes.error.message);
    const history = (historyRes.data ?? []) as ChatMessage[];

    // Persist the user turn up front so history survives a failed stream
    const { error: userInsertError } = await db
      .from("hrl_messages")
      .insert({ conversation_id: convId, role: "user", content: message });
    if (userInsertError) throw new Error(userInsertError.message);

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [
        {
          // Stable, byte-identical block — prompt cache hits on every request
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
        {
          // Volatile block, after the cache breakpoint
          type: "text",
          text: context.block,
        },
      ],
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: message },
      ],
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
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              assistantText += chunk.delta.text;
              controller.enqueue(new TextEncoder().encode(chunk.delta.text));
            }
          }
          await persistAssistant();
          controller.close();
        } catch (e) {
          await persistAssistant(); // keep whatever streamed before the failure
          controller.error(e);
        }
      },
      async cancel() {
        // Client hit Stop or navigated away: stop paying for tokens, keep the partial
        stream.abort();
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
