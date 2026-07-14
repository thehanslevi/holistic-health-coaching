"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { phaseDateRange, phaseWeek } from "@/lib/phase-format";
import type { Phase } from "@/lib/types";
import { Button, Dots, Field, inputClass, ScreenHeader } from "@/components/ui";
import { useApp } from "@/components/AppShell";

type Mode = "overview" | "advance" | "edit" | "swap";
type Carry = "keep" | "reset" | "propose";

const CARRY_OPTS: { value: Carry; label: string; hint: string }[] = [
  { value: "keep", label: "Carry current weights", hint: "Start the new phase on your working targets." },
  { value: "propose", label: "Let the coach propose", hint: "Keep weights, then run a progression review to earn bumps." },
  { value: "reset", label: "Reset to base program", hint: "Clear overrides — back to the program's default targets." },
];

type ProgramChange = {
  id: string;
  created_at: string;
  session_key: string | null;
  summary: string;
  rationale: string;
  source: "coach" | "manual";
  reverted_at: string | null;
};

// What the coach changed, and why — with an undo.
//
// The coach is allowed to edit her program unprompted (her call). This panel is
// the other half of that bargain: no change is silent, every change carries its
// reasoning, and any of it can be taken back. Control after the fact rather than
// a permission gate before it.
function ProgramChanges() {
  const { refreshPhase } = useApp();
  const [changes, setChanges] = useState<ProgramChange[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<ProgramChange[]>("/api/program/changes")
      .then(setChanges)
      .catch(() => setChanges([]));
  }, []);

  useEffect(load, [load]);

  const undo = async (c: ProgramChange) => {
    setBusy(c.id);
    setErr(null);
    try {
      await api(`/api/program/changes/${c.id}`, { method: "POST" });
      await Promise.all([refreshPhase(), Promise.resolve(load())]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not undo that.");
    } finally {
      setBusy(null);
    }
  };

  const live = changes.filter((c) => !c.reverted_at);
  if (!changes.length) return null;

  return (
    <>
      <div className="label mt-7 mb-2">
        Coach changes {live.length > 0 ? `· ${live.length} live` : ""}
      </div>
      <div className="space-y-2">
        {changes.map((c) => {
          const undone = !!c.reverted_at;
          return (
            <div
              key={c.id}
              className={`border px-3.5 py-3 ${undone ? "border-line opacity-50" : "border-line-strong bg-surface"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div
                    className={`text-[13px] leading-snug ${undone ? "text-faint line-through" : "text-ink"}`}
                  >
                    {c.summary}
                  </div>
                  <div className="text-[12px] text-muted leading-snug mt-1">{c.rationale}</div>
                  <div className="text-[10px] text-faint mt-1.5 num">
                    {new Date(c.created_at).toLocaleDateString()} ·{" "}
                    {c.source === "coach" ? "by your coach" : "by you"}
                    {undone ? " · undone" : ""}
                  </div>
                </div>
                {!undone && (
                  <button
                    onClick={() => undo(c)}
                    disabled={busy === c.id}
                    className="label !text-[10px] !text-faint hover:!text-stop cursor-pointer shrink-0 disabled:opacity-40"
                    title="Restore the program to how it was before this change. Anything changed after it is undone too."
                  >
                    {busy === c.id ? "…" : "Undo"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {err && <div className="text-xs text-stop mt-2">{err}</div>}
    </>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProgramView({
  onClose,
  onOpenProgression,
}: {
  onClose: () => void;
  onOpenProgression: () => void;
}) {
  const { overrides, refreshPhase, refreshOverrides } = useApp();
  const [mode, setMode] = useState<Mode>("overview");
  const [active, setActive] = useState<Phase | null>(null);
  const [history, setHistory] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overrideCount = useMemo(
    () => Object.values(overrides).filter((o) => o.target).length,
    [overrides],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { active, history } = await api<{ active: Phase | null; history: Phase[] }>(
        "/api/phases",
      );
      setActive(active);
      setHistory(history);
    } catch {
      setError("Couldn't load phases.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Advance form ──
  const [name, setName] = useState("");
  const [focus, setFocus] = useState("");
  const [startedOn, setStartedOn] = useState(todayISO());
  const [carry, setCarry] = useState<Carry>("keep");

  const startAdvance = () => {
    setName("");
    setFocus("");
    setStartedOn(todayISO());
    setCarry("keep");
    setError(null);
    setMode("advance");
  };

  const submitAdvance = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/phases", {
        method: "POST",
        body: JSON.stringify({ name, focus, started_on: startedOn, carry }),
      });
      await Promise.all([refreshPhase(), refreshOverrides(), load()]);
      if (carry === "propose") {
        onOpenProgression();
        return;
      }
      setMode("overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't advance the phase.");
    } finally {
      setBusy(false);
    }
  };

  // ── Edit form ──
  const startEdit = () => {
    if (!active) return;
    setName(active.name);
    setFocus(active.focus ?? "");
    setStartedOn(active.started_on);
    setError(null);
    setMode("edit");
  };

  const submitEdit = async () => {
    if (!active || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/phases/${active.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, focus, started_on: startedOn }),
      });
      await Promise.all([refreshPhase(), load()]);
      setMode("overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const swapTo = async (phase: Phase) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/phases/${phase.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activate: true }),
      });
      await Promise.all([refreshPhase(), refreshOverrides(), load()]);
      setMode("overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't swap.");
    } finally {
      setBusy(false);
    }
  };

  // ── Advance / Edit form screen ──
  if (mode === "advance" || mode === "edit") {
    const isAdvance = mode === "advance";
    return (
      <div className="px-4 pb-8 fade-up">
        <ScreenHeader
          title={isAdvance ? "Advance phase" : "Edit phase"}
          onBack={() => setMode("overview")}
        />
        <div className="space-y-4">
          <Field label="Phase name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Run Build"
              className={inputClass}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={isAdvance ? "Starts" : "Started"}>
              <input
                type="date"
                value={startedOn}
                onChange={(e) => setStartedOn(e.target.value)}
                className={`${inputClass} num`}
              />
            </Field>
            <Field label="Focus (optional)">
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="Endurance"
                className={inputClass}
              />
            </Field>
          </div>

          {isAdvance && (
            <div>
              <span className="label block mb-2">Working targets from this phase</span>
              <div className="space-y-2">
                {CARRY_OPTS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setCarry(o.value)}
                    className={`w-full text-left border px-3.5 py-3 transition-colors ${
                      carry === o.value
                        ? "border-accent bg-accent/5"
                        : "border-line hover:border-line-strong"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="display text-[13px] tracking-[0.06em] text-ink">
                        {o.label}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          carry === o.value ? "bg-accent" : "bg-surface-3"
                        }`}
                      />
                    </div>
                    <div className="text-[12px] text-muted mt-1 leading-snug">{o.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div className="text-xs text-stop">{error}</div>}

          <Button
            size="lg"
            onClick={isAdvance ? submitAdvance : submitEdit}
            disabled={busy || !name.trim()}
          >
            {busy
              ? "Working…"
              : isAdvance
                ? `Start Phase ${(active?.phase_number ?? 0) + 1} →`
                : "Save changes"}
          </Button>
          {isAdvance && active && (
            <div className="text-[11px] text-faint text-center">
              Phase {active.phase_number} gets archived with its logs — nothing is lost.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Swap screen ──
  if (mode === "swap") {
    return (
      <div className="px-4 pb-8 fade-up">
        <ScreenHeader title="Swap plan" subtitle="Make a past phase active again" onBack={() => setMode("overview")} />
        {history.length === 0 ? (
          <div className="text-sm text-muted py-8 text-center border border-dashed border-line">
            No other phases yet. Advance to create your next one.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((p) => (
              <button
                key={p.id}
                onClick={() => swapTo(p)}
                disabled={busy}
                className="w-full text-left border border-line bg-surface px-3.5 py-3 hover:border-accent transition-colors"
              >
                <div className="display text-[13px] tracking-[0.06em] text-ink">
                  Phase {p.phase_number}: {p.name}
                </div>
                <div className="text-[11px] text-faint mt-0.5">{phaseDateRange(p)}</div>
              </button>
            ))}
          </div>
        )}
        {error && <div className="text-xs text-stop mt-3">{error}</div>}
      </div>
    );
  }

  // ── Overview ──
  return (
    <div className="px-4 pb-8 fade-up">
      <ScreenHeader title="Program" onBack={onClose} />

      {loading ? (
        <div className="py-8"><Dots /></div>
      ) : active ? (
        <>
          <div className="border border-accent bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="display text-[12px] tracking-[0.1em] text-accent">
                Phase {active.phase_number} · Active
              </span>
              <span className="label !text-[10px]">Week {phaseWeek(active)}</span>
            </div>
            <div className="display text-[20px] text-ink mt-2 leading-tight">{active.name}</div>
            <div className="text-[12px] text-muted mt-2">
              {phaseDateRange(active)}
              {active.focus ? ` · ${active.focus}` : ""}
              {overrideCount > 0 ? ` · ${overrideCount} target override${overrideCount === 1 ? "" : "s"} live` : ""}
            </div>
          </div>

          <Button size="lg" className="mt-3" onClick={startAdvance}>
            Advance to next phase →
          </Button>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button variant="secondary" size="md" onClick={() => setMode("swap")}>
              Swap plan
            </Button>
            <Button variant="secondary" size="md" onClick={startEdit}>
              Edit this phase
            </Button>
          </div>

          <ProgramChanges />

          <div className="label mt-7 mb-2">History</div>
          {history.length === 0 ? (
            <div className="text-[12px] text-faint border border-dashed border-line px-3.5 py-4">
              No past phases yet. When you advance, the phase you leave lands here with its logs.
            </div>
          ) : (
            <div className="border-l-2 border-line pl-3.5 space-y-4">
              {history.map((p) => (
                <div key={p.id}>
                  <div className="display text-[13px] tracking-[0.04em] text-muted">
                    Phase {p.phase_number}: {p.name}
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">{phaseDateRange(p)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-muted py-8">No active phase.</div>
      )}
      {error && <div className="text-xs text-stop mt-3">{error}</div>}
    </div>
  );
}
