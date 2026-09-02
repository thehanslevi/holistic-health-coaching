"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Recalibration, DriftItem, StaleProfileItem, BaselineItem } from "@/lib/recalibration";
import { Button } from "@/components/ui";
import { useApp } from "@/components/AppShell";

// Workstream #5 — the monthly recalibration, surfaced inline on Progress
// (direction A). Three sections, each item resolved in place with one tap:
//   Earned      — lifts the logs say have earned a change (#1's proposals)
//   Reconcile   — program targets that disagree with what she's actually lifting
//   Still true? — living-profile facts unconfirmed for 45+ days
// Nothing is applied without her tap. A clean month renders nothing at all.

// "Keep 75" on a drift item is a decision for this month, not forever: hide it
// locally until the next calendar month, when the cron will re-ask if it's
// still true. No server state needed.
const KEEP_KEY = "volt_recal_keep";
function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function readKept(): Set<string> {
  try {
    const raw = localStorage.getItem(KEEP_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { month: string; ids: string[] };
    return parsed.month === monthKey() ? new Set(parsed.ids) : new Set();
  } catch {
    return new Set();
  }
}
function writeKept(ids: Set<string>) {
  try {
    localStorage.setItem(KEEP_KEY, JSON.stringify({ month: monthKey(), ids: [...ids] }));
  } catch {
    /* non-fatal */
  }
}

function SectionHead({ label, count, live }: { label: string; count: number; live: boolean }) {
  return (
    <div className={`label ${live ? "!text-accent" : "!text-faint"} mb-2`}>
      {label} · {count}
    </div>
  );
}

export default function RecalibrationCard() {
  const { setOverride } = useApp();
  const [recal, setRecal] = useState<Recalibration | null>(null);
  // Lazy so the month's "keep" choices are read once, without a setState in an
  // effect. readKept swallows the server-side ReferenceError → empty set.
  const [kept, setKept] = useState<Set<string>>(() => readKept());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Recalibration>("/api/recalibration").then(setRecal).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!recal) return null;

  const drift = recal.drift.filter((d) => !kept.has(d.exercise_id));
  const total = recal.baselines.length + drift.length + recal.stale_profile.length;
  if (total === 0) return null;

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  // ── Earned (baseline proposals) ──
  const applyBaseline = (p: BaselineItem) =>
    run(p.id, async () => {
      await setOverride(p.exercise_id, p.proposed_target, p.rationale ?? undefined);
      await api("/api/proposals", { method: "PATCH", body: JSON.stringify({ id: p.id, status: "applied" }) });
      setRecal((r) => r && { ...r, baselines: r.baselines.filter((x) => x.id !== p.id) });
    });
  const dismissBaseline = (p: BaselineItem) =>
    run(p.id, async () => {
      await api("/api/proposals", { method: "PATCH", body: JSON.stringify({ id: p.id, status: "dismissed" }) });
      setRecal((r) => r && { ...r, baselines: r.baselines.filter((x) => x.id !== p.id) });
    });

  // ── Reconcile (drift) ──
  const matchDrift = (d: DriftItem) =>
    run(d.exercise_id, async () => {
      // Preserve the target's own phrasing ("75 lbs" → "70 lbs"); fall back to lbs.
      const next = /\d/.test(d.target)
        ? d.target.replace(/-?\d+(\.\d+)?/, String(d.logged_load))
        : `${d.logged_load} lbs`;
      await setOverride(d.exercise_id, next, `Matched to logged top sets (${d.sessions} sessions) · monthly recalibration`);
      setRecal((r) => r && { ...r, drift: r.drift.filter((x) => x.exercise_id !== d.exercise_id) });
    });
  const keepDrift = (d: DriftItem) => {
    const next = new Set(kept);
    next.add(d.exercise_id);
    setKept(next);
    writeKept(next);
  };

  // ── Still true? (profile) ──
  const confirmProfile = (e: StaleProfileItem) =>
    run(e.id, async () => {
      await api(`/api/profile/${e.id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
      setRecal((r) => r && { ...r, stale_profile: r.stale_profile.filter((x) => x.id !== e.id) });
    });
  const resolveProfile = (e: StaleProfileItem) =>
    run(e.id, async () => {
      await api(`/api/profile/${e.id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved" }) });
      setRecal((r) => r && { ...r, stale_profile: r.stale_profile.filter((x) => x.id !== e.id) });
    });

  return (
    <div className="border border-accent border-l-[3px] bg-accent/[0.04] p-3.5 mb-5">
      <div className="flex items-baseline justify-between">
        <div className="display-i text-[18px] text-accent">Monthly recalibration</div>
        <div className="num text-[13px] text-accent">{total}</div>
      </div>
      <div className="text-[12px] text-muted leading-snug mt-1 mb-3.5">
        A few taps to bring your program in line with what you&apos;re actually doing.
      </div>

      {/* Earned */}
      <SectionHead label="Earned" count={recal.baselines.length} live={recal.baselines.length > 0} />
      {recal.baselines.length === 0 ? (
        <div className="text-[12px] text-faint mb-4">Nothing to bump — logging&apos;s steady.</div>
      ) : (
        <div className="mb-3.5">
          {recal.baselines.map((p) => (
            <div key={p.id} className="border-t border-line py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-ink">{p.exercise_name ?? p.exercise_id}</span>
                <span className="num text-[12px] shrink-0 whitespace-nowrap">
                  <span className="text-faint line-through">{p.current_target ?? "—"}</span>{" "}
                  <span className="text-accent">→ {p.proposed_target}</span>
                </span>
              </div>
              {p.rationale && <div className="text-[11px] text-faint leading-snug mt-0.5">{p.rationale}</div>}
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={() => applyBaseline(p)} disabled={busy === p.id}>
                  {busy === p.id ? "…" : "Apply"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismissBaseline(p)} disabled={busy === p.id}>
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reconcile */}
      {drift.length > 0 && (
        <div className="mb-3.5">
          <SectionHead label="Reconcile" count={drift.length} live />
          {drift.map((d) => (
            <div key={d.exercise_id} className="border-t border-line py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-ink">{d.exercise_name}</span>
                <span className="num text-[12px] shrink-0 whitespace-nowrap">
                  <span className="text-faint">{d.target_load}</span>{" "}
                  <span className="text-muted">→</span>{" "}
                  <span className="text-accent">{d.logged_load}</span>
                </span>
              </div>
              <div className="text-[11px] text-faint leading-snug mt-0.5">
                You&apos;ve logged {d.direction} this for {d.sessions} sessions. Match it, or keep it as the goal?
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={() => matchDrift(d)} disabled={busy === d.exercise_id}>
                  {busy === d.exercise_id ? "…" : `Set ${d.logged_load}`}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => keepDrift(d)} disabled={busy === d.exercise_id}>
                  Keep {d.target_load}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Still true? */}
      {recal.stale_profile.length > 0 && (
        <div>
          <SectionHead label="Still true?" count={recal.stale_profile.length} live />
          {recal.stale_profile.map((e) => (
            <div key={e.id} className="border-t border-line py-2.5">
              <div className="text-[13px] text-ink leading-snug">{e.text}</div>
              <div className="text-[11px] text-faint mt-0.5 capitalize">
                {e.kind} · confirmed {e.age_days} days ago
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={() => confirmProfile(e)} disabled={busy === e.id}>
                  {busy === e.id ? "…" : "Still true"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => resolveProfile(e)} disabled={busy === e.id}>
                  Done with it
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
