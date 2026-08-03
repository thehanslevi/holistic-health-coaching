"use client";

import { useMemo } from "react";
import { listWeekSummaries, type WeekMix } from "@/lib/analytics";
import { ROLLING_TARGETS } from "@/lib/program";
import { useApp } from "@/components/AppShell";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

// Full training history by week — the weekly mix + activity the Today cards only
// show for the current week. Complements the day-by-day Calendar (▦): this is
// the shape of each week, newest first, all the way back to the first log.
export default function HistoryOverlay({ onClose }: { onClose: () => void }) {
  const { logs } = useApp();
  const weeks = useMemo(() => listWeekSummaries(logs), [logs]);

  return (
    <div className="fixed inset-0 z-50 bg-bg overflow-y-auto">
      <div className="max-w-[520px] mx-auto px-5 pb-12">
        <div className="flex items-center gap-3 pt-6 pb-4">
          <button
            onClick={onClose}
            aria-label="Close history"
            className="w-9 h-9 border border-line-strong text-muted hover:text-accent hover:border-accent flex items-center justify-center cursor-pointer shrink-0"
          >
            ✕
          </button>
          <h1 className="display text-[22px] text-ink flex-1">Every week</h1>
        </div>

        {/* Day-of-week header, aligned once over the activity dots below. */}
        <div className="flex items-center gap-3 pb-1.5">
          <div className="w-[68px] shrink-0" />
          <div className="flex gap-[3px] flex-1 min-w-0">
            {DOW.map((d, i) => (
              <div key={i} className="flex-1 label !text-[8px] text-center !text-faint">
                {d}
              </div>
            ))}
          </div>
          <div className="w-[92px] shrink-0 text-right label !text-[8px] !text-faint">S · A · R</div>
        </div>

        <div className="border-t border-line">
          {weeks.map((w) => (
            <WeekRow key={w.weekStart} w={w} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekRow({ w }: { w: WeekMix }) {
  const empty = w.activeDays === 0;
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-line">
      <div className="w-[68px] shrink-0">
        <div className={`display text-[13px] ${w.isCurrent ? "text-accent" : "text-ink"}`}>
          {w.isCurrent ? "This wk" : w.label.split("–")[0]}
        </div>
        {!w.isCurrent && (
          <div className="num text-[10px] text-faint">–{w.label.split("–")[1]}</div>
        )}
      </div>

      {/* Mon–Sun activity — volt where anything was logged */}
      <div className="flex gap-[3px] flex-1 min-w-0">
        {w.hits.map((hit, i) => (
          <div key={i} className={`flex-1 h-2.5 ${hit ? "bg-accent" : "bg-surface-2"}`} />
        ))}
      </div>

      {/* Counts: strength / aerobic / rest */}
      {empty ? (
        <div className="w-[92px] shrink-0 text-right label !text-[9px] !text-faint">—</div>
      ) : (
        <div className="w-[92px] shrink-0 flex justify-end gap-2.5">
          <Count n={w.strengthDone} unit="S" cls="text-ink" target={ROLLING_TARGETS.strength} />
          <Count n={w.aerobicDone} unit="A" cls="text-accent" />
          <Count n={w.restDays} unit="R" cls="text-muted" />
        </div>
      )}
    </div>
  );
}

function Count({ n, unit, cls, target }: { n: number; unit: string; cls: string; target?: number }) {
  const short = target != null && n < target;
  return (
    <span className={`stat-num text-[15px] ${short ? "text-faint" : cls}`}>
      {n}
      <span className="label !text-[8px] ml-0.5">{unit}</span>
    </span>
  );
}
