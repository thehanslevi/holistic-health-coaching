"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, getPasscode } from "@/lib/client";
import type {
  ChatMessage,
  CoachContextSummary,
  Conversation,
} from "@/lib/types";
import {
  Button,
  Card,
  Dots,
  EmptyState,
  ScreenHeader,
  TrafficLight,
  inputClass,
} from "@/components/ui";
import { useApp } from "@/components/AppShell";

type UiMessage = Pick<ChatMessage, "role" | "content">;

const QUICK_PROMPTS = [
  "Plan today's session",
  "Review my week",
  "Adjust for a yellow day",
  "What should I eat around training today?",
];

type MemoryNote = { id: string; content: string; source: "coach" | "manual" };

function MemoryPanel() {
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api<MemoryNote[]>("/api/memory")
      .then(setNotes)
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const add = async () => {
    const content = draft.trim();
    if (!content || adding) return;
    setAdding(true);
    try {
      const note = await api<MemoryNote>("/api/memory", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setNotes((n) => [...n, note]);
      setDraft("");
    } catch {
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    setNotes((n) => n.filter((x) => x.id !== id));
    try {
      await api(`/api/memory/${id}`, { method: "DELETE" });
    } catch {
      load();
    }
  };

  return (
    <div className="border border-line mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3.5 py-3 cursor-pointer"
      >
        <span className="label !text-accent">Coach remembers · {notes.length}</span>
        <span className="text-faint text-xs">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 border-t border-line pt-3">
          {notes.length === 0 ? (
            <div className="text-xs text-faint mb-3">
              Nothing yet. The coach saves durable facts as you talk — or pin one below.
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {notes.map((note) => (
                <div key={note.id} className="flex items-start gap-2">
                  <span
                    className={`mt-1 w-1.5 h-1.5 shrink-0 ${
                      note.source === "manual" ? "bg-accent" : "bg-line-strong"
                    }`}
                  />
                  <span className="flex-1 text-[13px] text-muted leading-snug">
                    {note.content}
                  </span>
                  <button
                    onClick={() => remove(note.id)}
                    aria-label="Forget this"
                    className="text-faint hover:text-stop text-xs cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Pin something for the coach to remember"
              className={`${inputClass} !py-2 text-[13px]`}
            />
            <Button size="sm" variant="secondary" onClick={add} disabled={adding || !draft.trim()}>
              Pin
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="coach-md text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:mb-2 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:mb-0.5 [&_strong]:text-ink [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold [&_h1]:mb-1.5 [&_h2]:mb-1.5 [&_h3]:mb-1 [&_table]:w-full [&_table]:text-xs [&_table]:my-2 [&_th]:text-left [&_th]:border-b [&_th]:border-line-strong [&_th]:py-1 [&_td]:py-1 [&_td]:border-b [&_td]:border-line [&_code]:num [&_code]:text-[12px] [&_code]:bg-surface-3 [&_code]:px-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function ContextIndicator() {
  const [summary, setSummary] = useState<CoachContextSummary | null>(null);
  const { logs } = useApp();

  useEffect(() => {
    api<CoachContextSummary>("/api/coach/context")
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [logs]); // refresh when logs change

  if (!summary) return null;
  return (
    <div className="flex items-center gap-2 text-[11px] text-faint px-1 pb-2">
      <span>
        Coach sees: last {summary.sinceDays} days · {summary.sessionCount} sessions
      </span>
      {summary.runStatus && <TrafficLight light={summary.runStatus} label={`run ${summary.runStatus}`} />}
    </div>
  );
}

export default function CoachView() {
  const { coachDraft, consumeCoachDraft, tab } = useApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [screen, setScreen] = useState<"list" | "chat">("list");
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(() => {
    api<Conversation[]>("/api/conversations")
      .then(setConversations)
      .catch(() => {});
  }, []);

  useEffect(loadConversations, [loadConversations]);

  // "Ask coach" arrivals from other views
  useEffect(() => {
    if (tab === "coach" && coachDraft) {
      const draft = consumeCoachDraft();
      if (draft) {
        setConvId(null);
        setMessages([]);
        setInput(draft);
        setScreen("chat");
      }
    }
  }, [tab, coachDraft, consumeCoachDraft]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const openConversation = async (c: Conversation) => {
    setConvId(c.id);
    setScreen("chat");
    setMessages([]);
    try {
      const rows = await api<ChatMessage[]>(`/api/conversations/${c.id}`);
      setMessages(rows.map(({ role, content }) => ({ role, content })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversation");
    }
  };

  const send = async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || streaming) return;

    setInput("");
    setError(null);
    setStreaming(true);
    const base: UiMessage[] = [...messages, { role: "user", content: messageText }];
    setMessages([...base, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getPasscode() ?? ""}`,
        },
        body: JSON.stringify({ conversationId: convId, message: messageText }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `Coach unavailable (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }

      const newConvId = res.headers.get("X-Conversation-Id");
      if (newConvId && !convId) setConvId(newConvId);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        const current = assistantText;
        setMessages([...base, { role: "assistant", content: current }]);
      }
      loadConversations();

      // Fire-and-forget: let the coach consolidate what's worth remembering
      const captureConv = newConvId ?? convId;
      if (captureConv) {
        void fetch("/api/memory/capture", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getPasscode() ?? ""}`,
          },
          body: JSON.stringify({ conversationId: captureConv }),
        }).catch(() => {});
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // Stop pressed — keep the partial text already rendered
        loadConversations();
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setMessages(base);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const deleteConversation = async (id: string) => {
    try {
      await api(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch {}
  };

  // ── Conversation list ──
  if (screen === "list") {
    return (
      <div className="px-4 pb-6 fade-up">
        <div className="py-5 flex items-center justify-between">
          <div>
            <h1 className="display-i text-[40px] text-ink">Coach</h1>
            <div className="text-xs text-muted mt-0.5">
              Knows your program, your logs, your constraints.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setConvId(null);
              setMessages([]);
              setScreen("chat");
            }}
          >
            New +
          </Button>
        </div>

        <MemoryPanel />

        {conversations.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            hint="Start one — the coach already sees your recent training."
          />
        ) : (
          conversations.map((c) => (
            <Card key={c.id} className="mb-2 p-3.5 flex items-center gap-3" onClick={() => openConversation(c)}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{c.title}</div>
                <div className="text-[11px] text-faint num mt-0.5">
                  {new Date(c.updated_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(c.id);
                }}
                aria-label="Delete conversation"
                className="text-faint hover:text-stop text-xs cursor-pointer px-2 py-1"
              >
                ✕
              </button>
            </Card>
          ))
        )}
      </div>
    );
  }

  // ── Chat ──
  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] px-4">
      <ScreenHeader
        title="Coach"
        onBack={() => {
          if (streaming) stop();
          setScreen("list");
          loadConversations();
        }}
      />
      <ContextIndicator />

      <div ref={scrollRef} className="flex-1 overflow-y-auto -mx-1 px-1">
        {messages.length === 0 && (
          <div className="pt-6">
            <div className="text-xs text-faint text-center mb-4">
              The coach automatically sees your recent logs — just ask.
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-xs text-muted bg-surface border border-line px-3.5 py-2 hover:border-accent-dim hover:text-ink cursor-pointer transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex mb-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "user" ? (
              <div className="max-w-[85%] px-3.5 py-2.5 bg-surface-2 border-l-[3px] border-accent text-ink text-sm whitespace-pre-wrap">
                {m.content}
              </div>
            ) : (
              <div className="max-w-[92%] text-muted">
                {m.content ? (
                  <Markdown content={m.content} />
                ) : streaming && i === messages.length - 1 ? (
                  <Dots />
                ) : null}
              </div>
            )}
          </div>
        ))}
        {error && <div className="text-xs text-stop py-2">{error}</div>}
      </div>

      <div className="py-3 border-t border-line">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Message your coach…"
            className={`${inputClass} resize-none flex-1`}
          />
          {streaming ? (
            <Button variant="secondary" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button onClick={() => send()} disabled={!input.trim()}>
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
