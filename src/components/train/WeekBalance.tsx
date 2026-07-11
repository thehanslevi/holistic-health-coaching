"use client";

import { WEEKLY_SCHEDULE } from "@/lib/program";

// Informational high-low view of the week. Hard and easy days should alternate;
// this shows the picture and flags when two hard days sit back to back. It never
// blocks anything — just a heads-up you can act on or ignore.

type Intensity = "hard" | "mod" | "easy" | "rest";

const BY_KEY: Record<string, Intensity> = {
  L1: "hard",
  L2: "hard",
  U1: "mod",
  U2: "mod",
  C1: "easy",
  G1: "mod",
};

function intensityFor(day: string, sessionKey: string | null): Intensity {
  if (sessionKey) return BY_KEY[sessionKey] ?? "mod";
  return day === "SUN" ? "rest" : "hard"; // SAT = run
}

const BAR: Record<Intensity, { h: string; cls: string; label: string; labelCls: string }> = {
  hard: { h: "34px", cls: "bg-accent text-accent-ink", label: "HARD", labelCls: "text-accent-dim" },
  mod: { h: "26px", cls: "bg-accent-dim/25 text-accent", label: "MOD", labelCls: "text-faint" },
  easy: { h: "16px", cls: "bg-surface-3 text-muted", label: "EASY", labelCls: "text-faint" },
  rest: { h: "14px", cls: "bg-surface border border-line text-faint", label: "REST", labelCls: "text-faint" },
};

export default function WeekBalance() {
  const days = WEEKLY_SCHEDULE.map((d) => ({
    ...d,
    intensity: intensityFor(d.day, d.sessionKey),
    tag: d.sessionKey ?? (d.day === "SUN" ? "—" : "RUN"),
  }));

  // Flag any two hard days back to back.
  const stacked: string[] = [];
  for (let i = 1; i < days.length; i++) {
    if (days[i].intensity === "hard" && days[i - 1].intensity === "hard") {
      stacked.push(`${days[i - 1].day}–${days[i].day}`);
    }
  }

  return (
    <div className="border border-line bg-surface p-3.5 mb-4">
      <div className="label mb-3">Hard / easy this week</div>
      <div className="flex gap-1.5 items-end">
        {days.map((d) => {
          const b = BAR[d.intensity];
          return (
            <div key={d.day} className="flex-1 text-center">
              <div
                style={{ height: b.h }}
                className={`display flex items-center justify-center text-[10px] tracking-[0.02em] ${b.cls}`}
              >
                {d.tag}
              </div>
              <div className={`label !text-[8px] mt-1 ${b.labelCls}`}>{b.label}</div>
              <div className="label !text-[8px] !text-faint mt-0.5">{d.day[0]}</div>
            </div>
          );
        })}
      </div>
      {stacked.length ? (
        <div className="border-l-[3px] border-hold pl-3 py-1 mt-3.5">
          <div className="text-[12px] text-ink leading-snug">
            Two hard days back to back ({stacked.join(", ")}). Put an easy day or rest between them,
            or make one lighter.
          </div>
        </div>
      ) : (
        <div className="border-l-[3px] border-go/60 pl-3 py-1 mt-3.5">
          <div className="text-[12px] text-muted leading-snug">
            Good spacing — nothing hard is stacked back to back. If you move your run, keep a day
            between it and heavy lower work.
          </div>
        </div>
      )}
    </div>
  );
}
