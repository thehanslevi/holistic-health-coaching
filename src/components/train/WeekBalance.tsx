"use client";

import { computeCycle } from "@/lib/analytics";
import { useApp } from "@/components/AppShell";

// "This week, honest" dose view (Phase 4). A rolling 7-day window, so a count and
// a weekly target share a unit — 3 of 4 strength reads as 3/4, no scaling games.
// Each row carries a plain-language state so the gap reads at a glance. It never
// blocks anything; it's a picture of the week she can act on.

type Tone = "behind" | "ok" | "ahead" | "held" | "over" | "neutral";
type Cell = "fill" | "empty" | "warn" | "bonus" | "extra";

type Metric = { label: string; value: string; sub: string; tag: string; tone: Tone; cells: Cell[]; note?: string };

function cellsFor(done: number, goal: number, behind: boolean, over: "bonus" | "extra" | null): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < goal; i++) out.push(i < done ? "fill" : behind ? "warn" : "empty");
  for (let i = goal; i < done; i++) out.push(over ?? "extra");
  return out.slice(0, 6);
}

function buildMetrics(c: ReturnType<typeof computeCycle>): Metric[] {
  const s = c.strengthDone;
  const strength: Metric = {
    label: "Strength",
    value: `${s}`,
    sub: `/${c.strengthTarget}`,
    ...(s < c.strengthTarget
      ? { tag: `${c.strengthTarget - s} short`, tone: "behind" as Tone }
      : s === c.strengthTarget
        ? { tag: "met", tone: "ok" as Tone }
        : { tag: "held", tone: "held" as Tone }),
    cells: cellsFor(s, c.strengthTarget, s < c.strengthTarget, "extra"),
  };

  // Aerobic counts runs too — a run is aerobic work, so it fills the Zone 2 goal.
  // The composition line keeps the mix visible (e.g. all runs, no low-impact Z2).
  const a = c.aerobicDone;
  const aerobic: Metric = {
    label: "Aerobic",
    value: `${a}`,
    sub: `/${c.zone2Min}–${c.zone2Max}`,
    ...(a === 0
      ? { tag: "none yet", tone: "behind" as Tone }
      : a < c.zone2Min
        ? { tag: `${c.zone2Min - a} short`, tone: "behind" as Tone }
        : a <= c.zone2Max
          ? { tag: "on track", tone: "ok" as Tone }
          : { tag: "ahead", tone: "ahead" as Tone }),
    cells: cellsFor(a, c.zone2Max, a < c.zone2Min, "bonus"),
    note: `${c.runsDone} run${c.runsDone === 1 ? "" : "s"} · ${c.zone2Done} Zone 2`,
  };

  const rec = c.recoveryDays;
  const recovery: Metric = {
    label: "Recovery",
    value: `${rec}`,
    sub: " day" + (rec === 1 ? "" : "s"),
    ...(rec === 0
      ? { tag: "rest due", tone: "neutral" as Tone }
      : rec === 1
        ? { tag: "met", tone: "ok" as Tone }
        : { tag: `+${rec - 1} rest`, tone: "over" as Tone }),
    cells: cellsFor(rec, 1, false, "extra"),
  };

  return [strength, aerobic, recovery];
}

const CELL: Record<Cell, string> = {
  fill: "bg-accent border border-accent",
  bonus: "bg-go border border-go",
  extra: "bg-accent-dim/40 border border-accent-dim/40",
  warn: "bg-transparent border border-hold/60",
  empty: "bg-surface-2 border border-line",
};

const TAG: Record<Tone, string> = {
  behind: "text-hold border-hold/40",
  ok: "text-go border-go/40",
  ahead: "bg-accent text-accent-ink border-accent",
  held: "text-muted border-line",
  over: "text-hold border-hold/40",
  neutral: "text-faint border-line",
};

export default function WeekBalance() {
  const { logs } = useApp();
  const c = computeCycle(logs);
  const metrics = buildMetrics(c);

  return (
    <div className="border border-line bg-surface p-3.5 mb-4">
      <div className="flex items-baseline justify-between mb-3.5">
        <div className="label">This week</div>
        <div className="label !text-faint">rolling {c.windowDays} days</div>
      </div>

      <div className="flex flex-col gap-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="label">{m.label}</span>
              <span className="num text-[13px] text-ink">
                {m.value}
                <span className="text-faint">{m.sub}</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex gap-[3px] h-4 flex-1">
                {m.cells.map((cell, i) => (
                  <span key={i} className={`flex-1 ${CELL[cell]}`} />
                ))}
              </div>
              <span
                className={`display text-[9px] tracking-[0.08em] px-1.5 py-0.5 border shrink-0 ${TAG[m.tone]}`}
              >
                {m.tag.toUpperCase()}
              </span>
            </div>
            {m.note && <div className="text-[11px] text-faint num mt-1.5">{m.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
