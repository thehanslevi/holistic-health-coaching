"use client";

import { useEffect, useState } from "react";
import { SESSIONS, type SessionKey } from "@/lib/program";
import { clearSessionDraft, readSessionDraft, type SessionDraft } from "@/lib/session-draft";
import { useApp } from "@/components/AppShell";

// If a guided session was left in progress (e.g. the PWA reloaded mid-workout),
// offer to jump back into it. Resuming reopens the session, which restores the
// saved sets from the draft.
export default function ResumeSessionCard() {
  const { goTrain } = useApp();
  const [draft, setDraft] = useState<SessionDraft | null>(null);

  useEffect(() => {
    setDraft(readSessionDraft());
  }, []);

  if (!draft) return null;
  const session = SESSIONS[draft.sessionKey as SessionKey];
  const done = Object.values(draft.doneSets ?? {}).filter(Boolean).length;

  return (
    <div className="mt-5 border border-accent bg-accent/5 p-3.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="label !text-accent">Unfinished workout</div>
        <div className="text-[13px] text-ink mt-1 leading-snug">
          {session ? session.label : draft.sessionKey}
          {done ? ` — ${done} set${done === 1 ? "" : "s"} logged` : ""}. Pick up where you left off.
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => goTrain({ type: "session", sessionKey: draft.sessionKey })}
          className="display bg-accent text-accent-ink text-[12px] tracking-[0.08em] px-3 py-2 cursor-pointer hover:brightness-110 transition"
        >
          Resume
        </button>
        <button
          onClick={() => {
            clearSessionDraft();
            setDraft(null);
          }}
          aria-label="Discard unfinished workout"
          className="text-faint hover:text-stop text-sm cursor-pointer px-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
