"use client";

import { useState } from "react";
import { computeCycle, nextMove, weekMix, weekMonday } from "@/lib/analytics";
import { ROLLING_TARGETS } from "@/lib/program";
import { useApp } from "@/components/AppShell";
import HistoryOverlay from "@/components/today/HistoryOverlay";

// Weekly training mix — the shape she trains in, not a rolling-adherence grade.
// Each modality shows its dose filling against her usual mix (no SHORT/MET
// scoring). The ‹ › pager steps back through calendar weeks; "See all weeks"
// opens the full history. The goal-aware NEXT nudge only shows for this week.

type Row = { label: string; done: number; target: number };

export default function WeekBalance() {
  const { logs } = useApp();
  const [offset, setOffset] = useState(0); // 0 = this week, negative = back
  const [historyOpen, setHistoryOpen] = useState(false);

  const mix = weekMix(logs, weekMonday(offset));
  const isCurrent = offset === 0;

  // NEXT is forward-looking — compute it from the current week only, blending the
  // rolling rotation (which session is next) with this week's actual counts.
  const rolling = computeCycle(logs);
  const cur = isCurrent ? mix : weekMix(logs, weekMonday(0));
  const move = isCurrent
    ? nextMove({
        ...rolling,
        strengthDone: cur.strengthDone,
        runsDone: cur.runsDone,
        aerobicDone: cur.aerobicDone,
        zone2Done: cur.zone2Done,
      })
    : null;

  const rows: Row[] = [
    { label: "Strength", done: mix.strengthDone, target: ROLLING_TARGETS.strength },
    { label: "Aerobic", done: mix.aerobicDone, target: ROLLING_TARGETS.zone2Max },
    { label: "Rest", done: mix.restDays, target: ROLLING_TARGETS.recovery },
  ];

  return (
    <>
      <div className="border border-line bg-surface mb-4">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setOffset((o) => o - 1)}
                aria-label="Previous week"
                className="display text-[16px] leading-none text-faint hover:text-accent cursor-pointer"
              >
                ‹
              </button>
              <span className="label !text-ink !tracking-[0.08em]">{mix.label}</span>
              <button
                onClick={() => setOffset((o) => Math.min(0, o + 1))}
                aria-label="Next week"
                disabled={isCurrent}
                className={`display text-[16px] leading-none cursor-pointer ${
                  isCurrent ? "text-surface-3 cursor-default" : "text-faint hover:text-accent"
                }`}
              >
                ›
              </button>
            </div>
            <span className="num text-[11px] text-faint">{mix.activeDays} of 7 days</span>
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

        <button
          onClick={() => setHistoryOpen(true)}
          className="w-full border-t border-line py-2.5 display text-[12px] tracking-[0.08em] text-accent hover:bg-surface-2 cursor-pointer transition-colors"
        >
          See all weeks →
        </button>
      </div>

      {historyOpen && <HistoryOverlay onClose={() => setHistoryOpen(false)} />}
    </>
  );
}
