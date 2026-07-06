"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { ProgramProposal } from "@/lib/types";
import { Button, Dots, EmptyState, ScreenHeader } from "@/components/ui";
import { useApp } from "@/components/AppShell";

export default function ProgressionReview({ onClose }: { onClose: () => void }) {
  const { setOverride } = useApp();
  const [proposals, setProposals] = useState<ProgramProposal[] | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setProposals(null);
    setError(null);
    api<{ proposals: ProgramProposal[] }>("/api/program/propose", { method: "POST", body: "{}" })
      .then((r) => setProposals(r.proposals))
      .catch((e) => setError(e instanceof Error ? e.message : "Review failed"));
  };

  useEffect(run, []);

  const accept = async (p: ProgramProposal) => {
    setApplying(p.exercise_id);
    try {
      await setOverride(p.exercise_id, p.proposed_target, p.rationale);
      setApplied((a) => [...a, p.exercise_id]);
      setProposals((ps) => (ps ? ps.filter((x) => x.exercise_id !== p.exercise_id) : ps));
    } catch {
      /* ignore */
    } finally {
      setApplying(null);
    }
  };

  const dismiss = (id: string) =>
    setProposals((ps) => (ps ? ps.filter((x) => x.exercise_id !== id) : ps));

  return (
    <div className="px-5 pb-8 fade-up">
      <ScreenHeader
        title="Progression review"
        subtitle="Coach reads your recent lifts against your targets"
        onBack={onClose}
      />

      {error ? (
        <div className="text-xs text-stop py-4">{error}</div>
      ) : proposals === null ? (
        <div className="py-10 text-center">
          <Dots />
          <div className="label !text-[9px] mt-3">Coach is reviewing your numbers…</div>
        </div>
      ) : proposals.length === 0 ? (
        <EmptyState
          title={applied.length ? "That's the set" : "Nothing to change yet"}
          hint={
            applied.length
              ? "Applied targets are live in your sessions."
              : "Keep logging — the coach proposes a bump only when your top sets clearly earn it (and never on a HOLD lift)."
          }
        />
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <div key={p.exercise_id} className="border border-line p-3.5">
              <div className="text-sm font-semibold text-ink">{p.exercise_name}</div>
              <div className="flex items-center gap-2 mt-2">
                <span className="num text-[13px] text-muted line-through">{p.current_target}</span>
                <span className="text-accent">→</span>
                <span className="display text-[15px] tracking-[0.04em] text-accent">
                  {p.proposed_target.toUpperCase()}
                </span>
              </div>
              <div className="text-[13px] text-muted leading-relaxed mt-2">{p.rationale}</div>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => accept(p)}
                  disabled={applying === p.exercise_id}
                >
                  {applying === p.exercise_id ? "…" : "Apply"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismiss(p.exercise_id)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {proposals !== null && proposals.length > 0 && (
        <button
          onClick={run}
          className="label mt-6 hover:text-muted cursor-pointer block mx-auto"
        >
          Re-run review
        </button>
      )}
    </div>
  );
}
