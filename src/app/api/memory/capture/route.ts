import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const client = new Anthropic();

const MAX_NOTES = 30;
const MAX_NOTE_LEN = 300;

// Runs after a coach turn: consolidates what's worth remembering long-term.
// Manual (user-pinned) notes are never touched; coach notes are fully managed.
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { conversationId } = await req.json();
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId required" }, { status: 400 });
    }
    const db = supabase();

    const [msgRes, memRes] = await Promise.all([
      db
        .from("hrl_messages")
        .select("role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(8),
      db.from("hrl_memory").select("id, content, source"),
    ]);

    const recent = (msgRes.data ?? []).reverse();
    if (recent.length === 0) return NextResponse.json({ updated: false });

    const memRows = (memRes.data ?? []) as {
      id: string;
      content: string;
      source: string;
    }[];
    const coachNotes = memRows.filter((m) => m.source === "coach").map((m) => m.content);
    const manualNotes = memRows.filter((m) => m.source === "manual").map((m) => m.content);

    const transcript = recent
      .map((m) => `${m.role === "user" ? "Athlete" : "Coach"}: ${m.content}`)
      .join("\n\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "You maintain a coach's long-term memory about the athlete. You decide what is worth remembering across future conversations: durable preferences, constraints, life context, recurring body signals, equipment or scheduling realities, and decisions or commitments made. Ignore ephemeral chatter, one-off numbers already captured in their logs, and anything that will not matter next week.",
      messages: [
        {
          role: "user",
          content: `Notes you have already saved:\n${
            coachNotes.length ? coachNotes.map((n) => `- ${n}`).join("\n") : "(none yet)"
          }\n\nNotes the user pinned themselves (do NOT repeat or restate these):\n${
            manualNotes.length ? manualNotes.map((n) => `- ${n}`).join("\n") : "(none)"
          }\n\nMost recent exchange:\n${transcript}\n\nReturn the full updated list of YOUR saved notes as JSON: {"memory": ["note", ...]}. Keep every prior note that is still true, add any genuinely new durable facts from this exchange, merge duplicates, and drop only notes that are now wrong or obsolete. One concise sentence each, at most ${MAX_NOTES} notes. Respond with only the JSON object.`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ updated: false });

    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return NextResponse.json({ updated: false });
    }

    const raw = (parsed as { memory?: unknown })?.memory;
    if (!Array.isArray(raw)) return NextResponse.json({ updated: false });

    const next = Array.from(
      new Set(
        raw
          .filter((n): n is string => typeof n === "string")
          .map((n) => n.trim().slice(0, MAX_NOTE_LEN))
          .filter(Boolean)
          // never duplicate a user-pinned note
          .filter((n) => !manualNotes.some((m) => m.toLowerCase() === n.toLowerCase())),
      ),
    ).slice(0, MAX_NOTES);

    // Safety: don't let a bad response wipe existing memory
    if (next.length === 0 && coachNotes.length > 0) {
      return NextResponse.json({ updated: false });
    }

    // Replace only coach-sourced notes; leave manual notes untouched
    const coachIds = memRows.filter((m) => m.source === "coach").map((m) => m.id);
    if (coachIds.length) await db.from("hrl_memory").delete().in("id", coachIds);
    if (next.length)
      await db
        .from("hrl_memory")
        .insert(next.map((content) => ({ content, source: "coach" })));

    return NextResponse.json({ updated: true, count: next.length });
  } catch (e) {
    return errorResponse(e);
  }
}
