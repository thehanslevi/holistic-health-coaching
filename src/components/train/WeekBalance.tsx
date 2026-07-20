"use client";

import { computeCycle } from "@/lib/analytics";
import { useApp } from "@/components/AppShell";

// Rolling-cycle "dose meter" (Phase 4). No weekdays, and deliberately no "next
// session" — this is a broad reminder of what she's trying to complete over the
// last ~7–10 days and where she is against her targets, not a prescription that
// one specific workout has to come next. It never blocks anything.

type Cell = "on" | "soft" | "off";

function Meter({
  label,
  value,
  sub,
  cells,
  tone = "volt",
}: {
  label: string;
  value: string;
  sub: string;
  cells: Cell[];
  tone?: "volt" | "calm";
}) {
  const onCls = tone === "calm" ? "bg-accent-dim/50" : "bg-accent";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label">{label}</span>
        <span className="num text-[13px] text-ink">
          {value}
          <span className="text-faint">{sub}</span>
        </span>
      </div>
      <div className="flex gap-[3px] h-4">
        {cells.map((c, i) => (
          <span
            key={i}
            className={`flex-1 ${
              c === "on"
                ? onCls
                : c === "soft"
                  ? "bg-accent-dim/25 border border-accent-dim/40"
                  : "bg-surface-2 border border-line"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function fill(count: number, total: number): Cell[] {
  return Array.from({ length: total }, (_, i) => (i < count ? "on" : "off"));
}

export default function WeekBalance() {
  const { logs } = useApp();
  const c = computeCycle(logs);

  const strengthCells = fill(c.strengthDone, c.strengthTarget);
  // Zone 2: filled up to done, then "still aiming" cells up to the minimum,
  // then a faint bonus cell up to the max.
  const zone2Cells: Cell[] = Array.from({ length: c.zone2Max }, (_, i) =>
    i < c.zone2Done ? "on" : i < c.zone2Min ? "soft" : "off",
  );
  const runCells = fill(c.runsDone, Math.max(c.runTarget, c.runsDone, 1));
  const recoveryCells = fill(
    Math.min(c.recoveryDays, 6),
    Math.max(1, Math.min(c.recoveryDays, 6)),
  );

  return (
    <div className="border border-line bg-surface p-3.5 mb-4">
      <div className="flex items-baseline justify-between mb-3.5">
        <div className="label">Cycle dose</div>
        <div className="label !text-faint">last {c.windowDays} days</div>
      </div>

      <div className="flex flex-col gap-3">
        <Meter label="Strength" value={`${c.strengthDone}`} sub={`/${c.strengthTarget}`} cells={strengthCells} />
        <Meter label="Zone 2" value={`${c.zone2Done}`} sub={`/${c.zone2Min}–${c.zone2Max}`} cells={zone2Cells} />
        <Meter label="Run · green" value={`${c.runsDone}`} sub={`/${c.runTarget}`} cells={runCells} />
        <Meter label="Recovery" value={`${c.recoveryDays}`} sub=" days" cells={recoveryCells} tone="calm" />
      </div>
    </div>
  );
}
