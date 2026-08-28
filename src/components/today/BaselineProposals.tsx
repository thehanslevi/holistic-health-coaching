"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { useApp } from "@/components/AppShell";

type Proposal = {
  id: string;
  exercise_id: string;
  exercise_name: string | null;
  current_target: string | null;
  proposed_target: string;
  rationale: string | null;
};

// Workstream #1 — self-updating baselines, surfaced proactively. A weekly job
// re-derives what her logged performance has earned; this shows any pending
// change on Today so she doesn't have to go hunting. Nothing is auto-applied —
// each is her one-tap confirm, which writes the working target (an override the
// logger and coach already read).
export default function BaselineProposals() {
  const { setOverride } = useApp();
  const [items, setItems] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<Proposal[]>("/api/proposals")
      .then(setItems)
      .catch(() => {});
  }, []);

  const resolve = async (p: Proposal, action: "applied" | "dismissed") => {
    setBusy(p.id);
    try {
      if (action === "applied") await setOverride(p.exercise_id, p.proposed_target, p.rationale ?? undefined);
      await api("/api/proposals", { method: "PATCH", body: JSON.stringify({ id: p.id, status: action }) });
      setItems((xs) => xs.filter((x) => x.id !== p.id));
    } catch {
      setBusy(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="border border-accent/40 bg-accent/[0.04] p-3.5 mt-5">
      <div className="label !text-accent-dim mb-1">
        Your lifting earned {items.length === 1 ? "a change" : `${items.length} changes`}
      </div>
      <div className="text-[12px] text-muted leading-snug mb-3">
        From your logged top sets — confirm to update the working target, or dismiss.
      </div>
      <div className="space-y-2.5">
        {items.map((p) => (
          <div key={p.id} className="border-t border-line pt-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-ink">{p.exercise_name ?? p.exercise_id}</span>
              <span className="num text-[12px] shrink-0">
                <span className="text-faint line-through">{p.current_target ?? "—"}</span>{" "}
                <span className="text-accent">→ {p.proposed_target}</span>
              </span>
            </div>
            {p.rationale && (
              <div className="text-[11px] text-faint leading-snug mt-1">{p.rationale}</div>
            )}
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={() => resolve(p, "applied")} disabled={busy === p.id}>
                {busy === p.id ? "…" : "Apply"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => resolve(p, "dismissed")} disabled={busy === p.id}>
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
