"use client";

import { useEffect, useState } from "react";
import {
  PHASE,
  PHASE_DATES,
  SESSIONS,
  SESSION_ORDER,
  WEEKLY_SCHEDULE,
  type SessionKey,
} from "@/lib/program";
import { phaseDateRange, phaseLabel } from "@/lib/phase-format";
import { Card, Segmented, SectionLabel } from "@/components/ui";
import SessionLogger from "@/components/train/SessionLogger";
import RunHub from "@/components/train/RunHub";
import XtrainLogger from "@/components/train/XtrainLogger";
import HistoryList from "@/components/train/HistoryList";
import ProgressionReview from "@/components/train/ProgressionReview";
import ProgramView from "@/components/train/ProgramView";
import WeekBalance from "@/components/train/WeekBalance";
import { useApp } from "@/components/AppShell";

type Screen =
  | { name: "home" }
  | { name: "session"; key: SessionKey; date?: string }
  | { name: "run"; date?: string }
  | { name: "xtrain"; date?: string }
  | { name: "progression" }
  | { name: "program" };

export default function TrainView() {
  const { trainIntent, consumeTrainIntent, tab, activePhase } = useApp();
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [section, setSection] = useState<"start" | "history">("start");

  // Quick actions from Today / Calendar land here with an intent
  useEffect(() => {
    if (tab === "train" && trainIntent) {
      const intent = consumeTrainIntent();
      if (!intent) return;
      if (intent.type === "session")
        setScreen({ name: "session", key: intent.sessionKey as SessionKey, date: intent.date });
      else if (intent.type === "run") setScreen({ name: "run", date: intent.date });
      else setScreen({ name: "xtrain", date: intent.date });
    }
  }, [tab, trainIntent, consumeTrainIntent]);

  if (screen.name === "session")
    return (
      <SessionLogger
        sessionKey={screen.key}
        initialDate={screen.date}
        onClose={() => setScreen({ name: "home" })}
      />
    );
  if (screen.name === "run")
    return <RunHub initialDate={screen.date} onClose={() => setScreen({ name: "home" })} />;
  if (screen.name === "xtrain")
    return <XtrainLogger initialDate={screen.date} onClose={() => setScreen({ name: "home" })} />;
  if (screen.name === "progression")
    return <ProgressionReview onClose={() => setScreen({ name: "home" })} />;
  if (screen.name === "program")
    return (
      <ProgramView
        onClose={() => setScreen({ name: "home" })}
        onOpenProgression={() => setScreen({ name: "progression" })}
      />
    );

  const todayIdx = (new Date().getDay() + 6) % 7; // MON=0 … SUN=6

  return (
    <div className="px-4 pb-6 fade-up">
      <div className="py-5">
        <h1 className="display-i text-[40px] text-ink">Train</h1>
        <button
          onClick={() => setScreen({ name: "program" })}
          className="text-xs text-muted mt-0.5 hover:text-accent transition-colors cursor-pointer text-left"
        >
          {activePhase ? phaseLabel(activePhase) : PHASE} ·{" "}
          {activePhase ? phaseDateRange(activePhase) : PHASE_DATES} <span className="text-accent">›</span>
        </button>
      </div>

      <div className="mb-4">
        <Segmented
          value={section}
          onChange={setSection}
          options={[
            { value: "start", label: "Start" },
            { value: "history", label: "History" },
          ]}
        />
      </div>

      {section === "start" ? (
        <div>
          <SectionLabel>Strength sessions</SectionLabel>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {SESSION_ORDER.map((key) => {
              const s = SESSIONS[key];
              return (
                <Card
                  key={key}
                  onClick={() => setScreen({ name: "session", key })}
                  className="p-3.5"
                >
                  <div className="display text-[13px] tracking-[0.06em] text-accent">{key}</div>
                  <div className="text-sm font-semibold text-ink mt-1 leading-tight">
                    {s.label}
                  </div>
                  <div className="text-[11px] text-muted mt-0.5 leading-tight">{s.subtitle}</div>
                </Card>
              );
            })}
          </div>

          <SectionLabel>Endurance & recovery</SectionLabel>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Card onClick={() => setScreen({ name: "run" })} className="p-3.5">
              <div className="display text-[13px] tracking-[0.06em] text-accent">RUN</div>
              <div className="text-sm font-semibold text-ink mt-1">Run session</div>
              <div className="text-[11px] text-muted mt-0.5">Warm-up · log · cooldown</div>
            </Card>
            <Card onClick={() => setScreen({ name: "xtrain" })} className="p-3.5">
              <div className="display text-[13px] tracking-[0.06em] text-accent">X</div>
              <div className="text-sm font-semibold text-ink mt-1">Cross-training</div>
              <div className="text-[11px] text-muted mt-0.5">Zone 2 · swim · sauna · walk</div>
            </Card>
          </div>

          <Card
            onClick={() => setScreen({ name: "progression" })}
            className="p-3.5 mb-2 border-accent/40"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="display text-[13px] tracking-[0.06em] text-accent">
                  Progression review
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Have the coach check if any lift has earned a bump
                </div>
              </div>
              <span className="text-accent text-lg">→</span>
            </div>
          </Card>

          <Card onClick={() => setScreen({ name: "program" })} className="p-3.5 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="display text-[13px] tracking-[0.06em] text-accent">
                  Program &amp; phases
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Advance to a new phase, swap plans, see history
                </div>
              </div>
              <span className="text-accent text-lg">→</span>
            </div>
          </Card>

          <WeekBalance />

          <SectionLabel>This week</SectionLabel>
          <Card className="p-1.5">
            {WEEKLY_SCHEDULE.map((d, i) => (
              <div
                key={d.day}
                className={`flex gap-3 items-baseline px-2.5 py-2 ${
                  i === todayIdx ? "bg-accent/10" : ""
                }`}
              >
                <span
                  className={`num text-[11px] font-bold w-9 shrink-0 ${
                    i === todayIdx ? "text-accent" : "text-faint"
                  }`}
                >
                  {d.day}
                </span>
                <span className={`text-xs ${i === todayIdx ? "text-ink" : "text-muted"}`}>
                  {d.label}
                </span>
              </div>
            ))}
          </Card>
        </div>
      ) : (
        <HistoryList />
      )}
    </div>
  );
}
