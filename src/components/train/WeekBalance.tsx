"use client";

import { computeCycle, nextMove } from "@/lib/analytics";
import { ROLLING_TARGETS } from "@/lib/program";
import { useApp } from "@/components/AppShell";

// Weekly training mix — the shape she trains in, not a rolling-adherence grade.
// Each modality shows its dose filling against her usual mix (no SHORT/MET
// scoring), and a single goal-aware "next move" sits below. The 7-day window is
// an implementation detail; the framing is "this week," never "rolling 7 days."

type Row = { label: string; done: number; target: number; sub: string };

export default function WeekBalance() {
  const { logs } = useApp();
  const c = computeCycle(logs);
  const move = nextMove(c);
  const activeDays = ROLLING_TARGETS.windowDays - c.recoveryDays;

  const rows: Row[] = [
    {
      label: "Strength",
      done: c.strengthDone,
      target: c.strengthTarget,
      sub: c.lastStrength ? `last: ${c.lastStrength}` : "none logged",
    },
    {
      label: "Aerobic",
      done: c.aerobicDone,
      target: c.zone2Max,
      sub: `${c.runsDone} run${c.runsDone === 1 ? "" : "s"} · ${c.zone2Done} Zone 2`,
    },
    { label: "Rest", done: c.recoveryDays, target: ROLLING_TARGETS.recovery, sub: "full days off" },
  ];

  return (
    <div className="border border-line bg-surface mb-4">
      <div className="p-4">
        <div className="flex items-baseline justify-between mb-3.5">
          <span className="label">This week</span>
          <span className="text-[11px] text-accent-dim">
            consistent — {activeDays} of last {ROLLING_TARGETS.windowDays} days
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const slots = Math.max(r.done, r.target);
            return (
              <div key={r.label} className="flex items-center gap-3">
                <span className="display text-ink text-[13px] tracking-[0.04em] w-[64px] shrink-0">
                  {r.label.toUpperCase()}
                </span>
                <div className="flex gap-1.5 flex-1">
                  {Array.from({ length: slots }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-2.5 flex-1 max-w-6 ${
                        i < r.done
                          ? "bg-accent"
                          : i < r.target
                            ? "border border-line"
                            : "border border-dashed border-line/50"
                      }`}
                    />
                  ))}
                </div>
                <span className="num text-[12px] text-faint w-9 text-right shrink-0">
                  {r.done}/{r.target}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {move && (
        <div className="border-t border-line px-4 py-3 flex items-start gap-2.5">
          <span className="display text-[11px] tracking-[0.08em] text-accent-ink bg-accent px-1.5 py-0.5 shrink-0 mt-0.5">
            NEXT
          </span>
          <div className="text-[12.5px] text-muted leading-snug">{move.text}</div>
        </div>
      )}
    </div>
  );
}
