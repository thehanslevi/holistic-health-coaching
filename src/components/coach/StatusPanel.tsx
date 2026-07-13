"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { ProfileEntry, ProfileKind } from "@/lib/types";
import { Button, inputClass } from "@/components/ui";

// "Your status" — the living profile Hannah maintains. The coach treats it as
// current and authoritative; it overrides anything older baked into the prompt.
// Mark something resolved and the coach stops using it.

const KIND_LABEL: Record<ProfileKind, string> = {
  priority: "Priority",
  constraint: "Constraint",
  note: "Note",
};

const KIND_CLS: Record<ProfileKind, string> = {
  priority: "text-accent border-accent/50",
  constraint: "text-hold border-hold/50",
  note: "text-muted border-line-strong",
};

export default function StatusPanel() {
  const [entries, setEntries] = useState<ProfileEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<ProfileKind>("constraint");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<ProfileEntry[]>("/api/profile").then(setEntries).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const add = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const e = await api<ProfileEntry>("/api/profile", {
        method: "POST",
        body: JSON.stringify({ kind, text }),
      });
      setEntries((p) => [...p, e]);
      setDraft("");
    } catch {
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (e: ProfileEntry) => {
    const status = e.status === "active" ? "resolved" : "active";
    setEntries((p) => p.map((x) => (x.id === e.id ? { ...x, status } : x)));
    try {
      await api(`/api/profile/${e.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    } catch {
      load();
    }
  };

  const remove = async (id: string) => {
    setEntries((p) => p.filter((x) => x.id !== id));
    try {
      await api(`/api/profile/${id}`, { method: "DELETE" });
    } catch {
      load();
    }
  };

  const active = entries.filter((e) => e.status === "active");
  const resolved = entries.filter((e) => e.status === "resolved");

  return (
    <div className="border border-line mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3.5 py-3 cursor-pointer"
      >
        <span className="label !text-accent">Your status · {active.length}</span>
        <span className="text-faint text-xs">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 border-t border-line pt-3">
          <div className="text-[11px] text-faint mb-3 leading-relaxed">
            What&apos;s true for you right now. The coach treats this as current and it beats anything
            older it was told. Mark something resolved and it stops shaping your training.
          </div>

          <div className="space-y-2 mb-3">
            {active.map((e) => (
              <div key={e.id} className="flex items-start gap-2">
                <span
                  className={`display text-[8px] tracking-[0.1em] px-1.5 py-0.5 border shrink-0 mt-0.5 ${KIND_CLS[e.kind]}`}
                >
                  {KIND_LABEL[e.kind].toUpperCase()}
                </span>
                <span className="flex-1 text-[13px] text-ink leading-snug">{e.text}</span>
                <button
                  onClick={() => toggle(e)}
                  className="label !text-[9px] !text-faint hover:!text-muted cursor-pointer shrink-0 mt-1"
                >
                  resolve
                </button>
                <button
                  onClick={() => remove(e.id)}
                  aria-label="Delete"
                  className="text-faint hover:text-stop text-xs cursor-pointer shrink-0 mt-0.5"
                >
                  ✕
                </button>
              </div>
            ))}
            {active.length === 0 && (
              <div className="text-xs text-faint">
                Nothing yet. Add your current priorities and constraints below.
              </div>
            )}
          </div>

          {resolved.length > 0 && (
            <div className="border-t border-line pt-2 mb-3">
              <div className="label !text-[9px] mb-1.5">Resolved</div>
              <div className="space-y-1.5">
                {resolved.map((e) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <span className="flex-1 text-[12px] text-faint line-through leading-snug">
                      {e.text}
                    </span>
                    <button
                      onClick={() => toggle(e)}
                      className="label !text-[9px] !text-faint hover:!text-accent cursor-pointer shrink-0"
                    >
                      reactivate
                    </button>
                    <button
                      onClick={() => remove(e.id)}
                      aria-label="Delete"
                      className="text-faint hover:text-stop text-xs cursor-pointer shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 items-center">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ProfileKind)}
              className={`${inputClass} !py-2 !px-2 text-[12px] !w-auto shrink-0`}
            >
              <option value="priority">Priority</option>
              <option value="constraint">Constraint</option>
              <option value="note">Note</option>
            </select>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Add current status…"
              className={`${inputClass} !py-2 text-[13px] flex-1 min-w-0`}
            />
            <Button size="sm" variant="secondary" onClick={add} disabled={busy || !draft.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
