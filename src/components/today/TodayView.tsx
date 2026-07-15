"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiRaw } from "@/lib/client";
import {
  computeConsistency,
  cycleSignal,
  featuredLift,
  pendingRuns,
  suggestReadiness,
  weekDayHits,
  type PendingRun,
} from "@/lib/analytics";
import {
  SESSIONS,
  WEEKLY_SCHEDULE,
  runTraffic,
  todayISO,
} from "@/lib/program";
import { isRunLog, type Checkin, type HealthRow, type Readiness } from "@/lib/types";
import type { CycleState } from "@/lib/cycle";
import { primeVoices, speak, speechSupported, stopSpeaking } from "@/lib/speech";
import { Button, Dots, inputClass } from "@/components/ui";
import BriefWhy, { type BriefInputs } from "@/components/today/BriefWhy";
import { useApp } from "@/components/AppShell";
import CalendarOverlay from "@/components/today/CalendarOverlay";
import RecoveryCard from "@/components/today/RecoveryCard";
import PushOptIn from "@/components/today/PushOptIn";
import ResumeSessionCard from "@/components/today/ResumeSessionCard";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const READINESS_META: Record<
  Readiness,
  { label: string; hint: string; cls: string; active: string; suggest: string; dot: string }
> = {
  green: {
    label: "Green",
    hint: "push as planned",
    cls: "border-go/40 text-go",
    active: "bg-go text-bg border-go",
    suggest: "border-go text-go bg-go/10",
    dot: "bg-go",
  },
  yellow: {
    label: "Yellow",
    hint: "show up, lighter",
    cls: "border-hold/40 text-hold",
    active: "bg-hold text-bg border-hold",
    suggest: "border-hold text-hold bg-hold/10",
    dot: "bg-hold",
  },
  red: {
    label: "Red",
    hint: "recovery only",
    cls: "border-stop/40 text-stop",
    active: "bg-stop text-bg border-stop",
    suggest: "border-stop text-stop bg-stop/10",
    dot: "bg-stop",
  },
};

function PendingRunCard({ run }: { run: PendingRun }) {
  const { refreshLogs } = useApp();
  const [amKnee, setAmKnee] = useState("");
  const [amAnkle, setAmAnkle] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiRaw(`/api/logs/${run.id}`, {
        method: "PATCH",
        body: JSON.stringify({ data: { run_am_knee: amKnee, run_am_ankle: amAnkle } }),
      });
      await refreshLogs();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="border border-hold/50 bg-hold/5 p-3.5 mt-4">
      <div className="label !text-hold mb-1">Morning check</div>
      <div className="text-[13px] text-ink mb-3">
        Your {run.dist || "?"} mi run on {run.date} is waiting on next-morning scores — they set the
        traffic light.
      </div>
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="label !text-[9px] block mb-1">Knee AM (0–10)</span>
          <input
            type="number"
            inputMode="numeric"
            value={amKnee}
            onChange={(e) => setAmKnee(e.target.value)}
            className={`${inputClass} stat-num !text-[18px] text-center`}
          />
        </label>
        <label className="flex-1">
          <span className="label !text-[9px] block mb-1">Ankle AM (0–10)</span>
          <input
            type="number"
            inputMode="numeric"
            value={amAnkle}
            onChange={(e) => setAmAnkle(e.target.value)}
            className={`${inputClass} stat-num !text-[18px] text-center`}
          />
        </label>
        <Button
          size="md"
          onClick={save}
          disabled={saving || (!amKnee && !amAnkle)}
        >
          {saving ? "…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export default function TodayView() {
  const { logs, goTrain, setTab } = useApp();
  const [checkin, setCheckin] = useState<Checkin | null | undefined>(undefined);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefInputs, setBriefInputs] = useState<BriefInputs | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [health, setHealth] = useState<HealthRow[]>([]);

  const now = new Date();
  const today = todayISO();
  const dayIdx = (now.getDay() + 6) % 7;
  const schedule = WEEKLY_SCHEDULE[dayIdx];
  const isShabbat = dayIdx === 6;
  const isRunDay = dayIdx === 5;

  // Poster title: the day's mission
  const titleLines: [string, string] = isShabbat
    ? ["Shabbat", "Recover"]
    : isRunDay
      ? ["Run", "Day"]
      : schedule.sessionKey
        ? (SESSIONS[schedule.sessionKey].label.toUpperCase().split(" ").length > 1
            ? [
                SESSIONS[schedule.sessionKey].label.split(" ")[0],
                SESSIONS[schedule.sessionKey].label.split(" ").slice(1).join(" "),
              ]
            : [SESSIONS[schedule.sessionKey].label, ""])
        : ["Train", ""];

  // Readiness
  useEffect(() => {
    api<Checkin[]>(`/api/checkins?since=${today}`)
      .then((rows) => setCheckin(rows.find((r) => r.date === today) ?? null))
      .catch(() => setCheckin(null));
  }, [today]);

  // Morning brief — refreshes when readiness changes
  const loadBrief = useCallback(() => {
    setBriefLoading(true);
    api<{ content: string; inputs: BriefInputs | null }>("/api/brief")
      .then((r) => {
        setBrief(r.content);
        setBriefInputs(r.inputs ?? null);
      })
      .catch(() => {
        setBrief(null);
        setBriefInputs(null);
      })
      .finally(() => setBriefLoading(false));
  }, []);

  useEffect(() => {
    if (checkin !== undefined) loadBrief();
  }, [checkin, loadBrief]);

  const submitReadiness = async (readiness: Readiness) => {
    setCheckin({ date: today, readiness, note: null });
    try {
      const saved = await api<Checkin>("/api/checkins", {
        method: "POST",
        body: JSON.stringify({ date: today, readiness }),
      });
      setCheckin(saved);
    } catch {
      setCheckin(null);
    }
  };

  // Apple Health
  useEffect(() => {
    api<HealthRow[]>("/api/health")
      .then(setHealth)
      .catch(() => {});
  }, []);
  const latestHealth = health[0] ?? null;

  // Menstrual cycle (derived phase)
  const [cycle, setCycle] = useState<CycleState | null>(null);
  useEffect(() => {
    api<{ state: CycleState }>("/api/cycle")
      .then((r) => setCycle(r.state))
      .catch(() => {});
  }, []);
  const showCycle = cycle && (cycle.lastStart || cycle.bleedingToday);

  // Voice: read the morning brief aloud (built-in speech)
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => primeVoices(), []);
  const toggleBriefAudio = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (!brief) return;
    setSpeaking(true);
    speak(brief, { rate: 0.98, onEnd: () => setSpeaking(false) });
  };

  // Stats
  const lastRun = useMemo(() => logs.find(isRunLog), [logs]);
  const lastRunTraffic = lastRun
    ? runTraffic(lastRun.data.run_am_knee, lastRun.data.run_am_ankle)
    : null;
  const hits = useMemo(() => weekDayHits(logs), [logs]);
  const weekCount = hits.filter(Boolean).length;
  const lift = useMemo(() => featuredLift(logs), [logs]);
  const consistency = useMemo(() => computeConsistency(logs), [logs]);

  // Today's only proactive strip item is a gentle bleeding-day note. Everything
  // interpretive (injury watch, adherence, recovery) is the coach's job now — it
  // reasons from live context in the brief/chat instead of firing fixed rules.
  const signals = useMemo(() => {
    const cs = cycleSignal(cycle);
    return cs ? [cs] : [];
  }, [cycle]);
  const suggestion = useMemo(() => suggestReadiness(health), [health]);
  const pending = useMemo(() => pendingRuns(logs), [logs]);
  const fuelingDay = !isShabbat; // strength or run day

  const startToday = () => {
    if (schedule.sessionKey) goTrain({ type: "session", sessionKey: schedule.sessionKey });
    else if (isRunDay) goTrain({ type: "run" });
    else setTab("train");
  };

  const lightColor = (l: "green" | "yellow" | "red") =>
    l === "green" ? "text-go" : l === "yellow" ? "text-hold" : "text-stop";

  return (
    <div className="px-5 pb-8 fade-up">
      {/* Masthead */}
      <div className="pt-6 flex justify-between items-baseline">
        <button
          onClick={() => setCalOpen(true)}
          className="flex items-center gap-1.5 cursor-pointer group"
          aria-label="Open calendar"
        >
          <span className="display text-[15px] tracking-[0.08em] text-accent group-hover:brightness-110">
            {now
              .toLocaleDateString("en-US", { weekday: "short", month: "2-digit", day: "2-digit" })
              .toUpperCase()
              .replace(",", "")}
          </span>
          <span className="text-accent text-[13px] leading-none">▦</span>
        </button>
      </div>

      {/* Poster title */}
      <h1 className="display-i text-[64px] text-ink mt-4">
        {titleLines[0]}
        {titleLines[1] && (
          <>
            <br />
            {titleLines[1]}
          </>
        )}
      </h1>
      <div className="flex items-center gap-2.5 mt-3">
        {schedule.sessionKey && (
          <span className="display bg-accent text-accent-ink text-[14px] tracking-[0.06em] px-2.5 py-0.5">
            {schedule.sessionKey}
          </span>
        )}
        <span className="label !text-muted">
          {isShabbat
            ? "RECOVERY · MOBILITY · WALKING"
            : isRunDay
              ? "RUN OR LONG ZONE 2 · CHECK ANKLE AM"
              : schedule.sessionKey
                ? `${SESSIONS[schedule.sessionKey].subtitle.toUpperCase()} · 45 MIN CAP`
                : schedule.label.toUpperCase()}
        </span>
      </div>

      {/* Resume an unfinished session (survives an app reload) */}
      <ResumeSessionCard />

      {/* Readiness — coach read (data-informed) + your call */}
      <div className="mt-6">
        {!checkin && suggestion && (
          <div className={`border p-3 mb-3 ${READINESS_META[suggestion.level].cls}`}>
            <div className="label !text-[9px] !text-current">Coach read · this morning</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${READINESS_META[suggestion.level].dot}`} />
              <span className="display text-[16px] text-ink">
                Leaning {READINESS_META[suggestion.level].label}
              </span>
            </div>
            <div className="text-[12px] text-muted mt-1 leading-snug">
              {suggestion.reasons.join(" · ")}. {READINESS_META[suggestion.level].hint}.
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="label shrink-0 mr-1">Arriving</span>
          {(Object.keys(READINESS_META) as Readiness[]).map((r) => {
            const meta = READINESS_META[r];
            const active = checkin?.readiness === r;
            const suggested = !checkin && suggestion?.level === r;
            return (
              <button
                key={r}
                onClick={() => submitReadiness(r)}
                className={`display text-[12px] tracking-[0.1em] px-3 py-1.5 border cursor-pointer transition-colors ${
                  active ? meta.active : suggested ? meta.suggest : `${meta.cls} hover:bg-surface-2`
                }`}
              >
                {meta.label}
              </button>
            );
          })}
          {checkin && (
            <span className="text-[11px] text-faint ml-1">
              {READINESS_META[checkin.readiness].hint}
            </span>
          )}
        </div>
        {!checkin && suggestion && (
          <div className="text-[10px] text-faint mt-1.5">
            Coach suggests {READINESS_META[suggestion.level].label} — tap to confirm or overrule.
          </div>
        )}
      </div>

      {/* Proactive signals */}
      {signals.length > 0 && (
        <div className="mt-5 space-y-2">
          {signals.map((s, i) => (
            <div
              key={i}
              className={`border-l-[3px] pl-3 py-1.5 ${
                s.tone === "stop"
                  ? "border-stop"
                  : s.tone === "hold"
                    ? "border-hold"
                    : "border-accent"
              }`}
            >
              <div
                className={`label !text-[9px] mb-0.5 ${
                  s.tone === "stop"
                    ? "!text-stop"
                    : s.tone === "hold"
                      ? "!text-hold"
                      : "!text-accent"
                }`}
              >
                Signal
              </div>
              <div className="text-[13px] text-ink leading-snug">{s.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pending run morning checks */}
      {pending.map((run) => (
        <PendingRunCard key={run.id} run={run} />
      ))}

      {/* Morning coach push opt-in */}
      <PushOptIn />

      {/* Coach brief */}
      <div className="mt-5 border-l-[3px] border-accent pl-3.5 py-0.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="label">Coach · this morning</span>
          {brief && speechSupported() && (
            <button
              onClick={toggleBriefAudio}
              className="display text-[10px] tracking-[0.1em] text-muted hover:text-accent transition-colors cursor-pointer inline-flex items-center gap-1"
              aria-label={speaking ? "Stop reading" : "Read brief aloud"}
            >
              {speaking ? "◼ Stop" : "▶ Listen"}
            </button>
          )}
        </div>
        {briefLoading && !brief ? (
          <Dots />
        ) : brief ? (
          <>
            <div className="text-[14px] leading-relaxed text-muted">{brief}</div>
            <BriefWhy inputs={briefInputs} />
          </>
        ) : (
          <div className="text-[13px] text-faint">
            Brief unavailable — check in above and it regenerates.
          </div>
        )}
      </div>

      {/* Stat board */}
      <div className="grid grid-cols-3 gap-px bg-line border border-line mt-6">
        <div className="bg-surface p-3">
          <div className="stat-num text-[26px] text-ink">
            {weekCount}
            <span className="text-faint text-[16px]">/6</span>
          </div>
          <div className="label mt-1.5">Week days</div>
        </div>
        <div className="bg-surface p-3">
          {lastRunTraffic ? (
            <>
              <div className={`stat-num text-[26px] ${lightColor(lastRunTraffic.light)}`}>
                RUN ●
              </div>
              <div className="label mt-1.5">
                {lastRunTraffic.light} · {lastRun!.data.run_dist || "?"} mi
              </div>
            </>
          ) : (
            <>
              <div className="stat-num text-[26px] text-faint">RUN ○</div>
              <div className="label mt-1.5">No runs yet</div>
            </>
          )}
        </div>
        <div className="bg-surface p-3">
          {lift ? (
            <>
              <div className="stat-num text-[26px] text-ink">
                {lift.current}
                <span className="text-accent text-[16px]">↗</span>
              </div>
              <div className="label mt-1.5">
                {lift.shortName.split(" ")[0]} · +{lift.delta} in {lift.spanWeeks}wk
              </div>
            </>
          ) : (
            <>
              <div className="stat-num text-[26px] text-faint">—</div>
              <div className="label mt-1.5">Lift trend</div>
            </>
          )}
        </div>
      </div>

      {/* Apple Health + cycle strip */}
      {(() => {
        const hasHealth =
          latestHealth &&
          (latestHealth.sleep_hours != null ||
            latestHealth.steps != null ||
            latestHealth.hrv != null ||
            latestHealth.resting_hr != null);
        if (!hasHealth && !showCycle) return null;
        return (
          <div className="flex items-center gap-4 mt-3 border border-line px-3.5 py-2.5">
            <span className="label !text-[9px] shrink-0">Health</span>
            <div className="flex gap-4 flex-wrap items-center">
              {latestHealth?.sleep_hours != null && (
                <span className="text-[12px] text-muted">
                  <span className="num text-ink">{latestHealth.sleep_hours}</span>h sleep
                </span>
              )}
              {latestHealth?.steps != null && (
                <span className="text-[12px] text-muted">
                  <span className="num text-ink">{latestHealth.steps.toLocaleString()}</span> steps
                </span>
              )}
              {latestHealth?.hrv != null && (
                <span className="text-[12px] text-muted">
                  HRV <span className="num text-ink">{latestHealth.hrv}</span>
                </span>
              )}
              {latestHealth?.resting_hr != null && (
                <span className="text-[12px] text-muted">
                  RHR <span className="num text-ink">{latestHealth.resting_hr}</span>
                </span>
              )}
              {showCycle && cycle && (
                <span className="display text-[11px] tracking-[0.06em] text-accent-dim border border-accent-dim/40 px-1.5 py-0.5">
                  {cycle.label}
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Consistency — showing up made visible (momentum, never guilt) */}
      <div className="border border-line bg-surface p-3.5 mt-4">
        <div className="flex items-baseline justify-between">
          <span className="label">Consistency</span>
          {consistency.bestStreak > 0 && (
            <span className="label !text-[9px]">Best {consistency.bestStreak}</span>
          )}
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="stat-num text-[32px] text-accent">{consistency.streak}</span>
          <span className="display text-[12px] tracking-[0.08em] text-muted">
            day{consistency.streak === 1 ? "" : "s"} strong
          </span>
          <span className="ml-auto display text-[13px] text-ink">
            {consistency.thisWeek}
            <span className="text-faint">/6 this wk</span>
          </span>
        </div>
        <div className="flex gap-1.5 mt-3">
          {hits.map((hit, i) => (
            <div key={i} className="flex-1">
              <div
                className={`h-[5px] ${
                  hit ? "bg-accent" : i === dayIdx ? "bg-surface-3" : "bg-surface-2"
                }`}
              />
              <div
                className={`label !text-[9px] text-center mt-1 ${
                  i === dayIdx ? "!text-accent" : ""
                }`}
              >
                {DAY_LETTERS[i]}
              </div>
            </div>
          ))}
        </div>
        {consistency.streak >= 3 && (
          <div className="text-[11px] text-accent-dim mt-2.5">
            {consistency.streak} days in a row. Keep it rolling.
          </div>
        )}
      </div>

      {/* Daily recovery check */}
      <RecoveryCard fuelingDay={fuelingDay} />

      {/* CTA */}
      {!isShabbat && (
        <Button size="lg" className="mt-6" onClick={startToday}>
          {schedule.sessionKey
            ? `Start ${schedule.sessionKey} →`
            : isRunDay
              ? "Open run day →"
              : "Open train →"}
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2 mt-2.5">
        <Button variant="secondary" size="md" onClick={() => goTrain({ type: "run" })}>
          Log run
        </Button>
        <Button variant="secondary" size="md" onClick={() => goTrain({ type: "xtrain" })}>
          Log cross
        </Button>
      </div>

      {calOpen && <CalendarOverlay onClose={() => setCalOpen(false)} />}
    </div>
  );
}
