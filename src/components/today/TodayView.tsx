"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiRaw } from "@/lib/client";
import {
  cycleSignal,
  featuredLift,
  pendingRuns,
  suggestReadiness,
  weekDayHits,
  type PendingRun,
} from "@/lib/analytics";
import { runTraffic, todayISO } from "@/lib/program";
import { isRunLog, type Checkin, type HealthRow, type Readiness } from "@/lib/types";
import { cycleChip, cyclePractical, type CycleState } from "@/lib/cycle";
import { freshness } from "@/lib/freshness";
import { primeVoices, speak, speechSupported, stopSpeaking } from "@/lib/speech";
import { Button, Dots, inputClass } from "@/components/ui";
import BriefWhy, { type BriefInputs } from "@/components/today/BriefWhy";
import { useApp } from "@/components/AppShell";
import CalendarOverlay from "@/components/today/CalendarOverlay";
import PushOptIn from "@/components/today/PushOptIn";
import BaselineProposals from "@/components/today/BaselineProposals";
import ResumeSessionCard from "@/components/today/ResumeSessionCard";
import WeekBalance from "@/components/train/WeekBalance";


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

// The block now asks how she *feels*, not for a traffic-light label. The stored
// value is still green/yellow/red (the coach reasons in those terms); only the
// button words change.
const FEEL_LABEL: Record<Readiness, string> = { green: "Good", yellow: "Okay", red: "Low" };

// "Jul 31" for a stale health row's date — terse, no prose.
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

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
  const { logs, goTrain, setTab, activePhase } = useApp();
  const [checkin, setCheckin] = useState<Checkin | null | undefined>(undefined);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefInputs, setBriefInputs] = useState<BriefInputs | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [health, setHealth] = useState<HealthRow[]>([]);

  const now = new Date();
  const today = todayISO();

  // No named "next session" on Today — the day leads with how she's arriving
  // (feel + a quiet cycle/sleep/HRV factor row), then the weekly mix, not a
  // workout the app says is due. The coach brief carries the nuanced call.
  const phaseFocus = activePhase?.focus?.split(/[;,]/)[0]?.trim().toUpperCase() ?? "";

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

  // Apple Health. There is no manual "sync": a PWA can't read Apple Health, and
  // the phone's Health Auto Export pushes on its own schedule — a button could
  // only ever re-read what's already arrived, which is misleading. Instead we
  // re-read on mount AND every time the app comes back to the foreground, which
  // is exactly when a fresh HAE push may have landed. So returning to the app
  // surfaces new numbers on its own, no button, no false promise.
  const loadHealth = useCallback(
    () => api<HealthRow[]>("/api/health").then(setHealth).catch(() => {}),
    [],
  );
  useEffect(() => {
    loadHealth();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadHealth();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", loadHealth);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", loadHealth);
    };
  }, [loadHealth]);
  const latestHealth = health[0] ?? null;
  // Today's row is provisional: Apple Health re-syncs the current day for hours,
  // and if the watch hasn't synced it may be missing or stale. Track freshness so
  // the numbers are never shown as settled fact without a way to refresh.
  const healthIsToday = latestHealth?.date === today;

  // Menstrual cycle (derived phase)
  const [cycle, setCycle] = useState<CycleState | null>(null);
  useEffect(() => {
    api<{ state: CycleState }>("/api/cycle")
      .then((r) => setCycle(r.state))
      .catch(() => {});
  }, []);
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

  // Today's only proactive strip item is a gentle bleeding-day note. Everything
  // interpretive (injury watch, adherence, recovery) is the coach's job now — it
  // reasons from live context in the brief/chat instead of firing fixed rules.
  const signals = useMemo(() => {
    const cs = cycleSignal(cycle);
    return cs ? [cs] : [];
  }, [cycle]);
  const suggestion = useMemo(() => suggestReadiness(health), [health]);
  const pending = useMemo(() => pendingRuns(logs), [logs]);

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
        {phaseFocus && (
          <button
            onClick={() => setTab("train")}
            className="label !text-faint hover:!text-muted cursor-pointer"
            aria-label="Program and phases"
          >
            PHASE {activePhase?.phase_number} · {phaseFocus}
          </button>
        )}
      </div>

      {/* Today — how you feel leads; cycle is one quiet factor beside sleep/HRV/RHR */}
      <div className="mt-5 border border-line bg-surface p-4">
        <div className="label mb-2.5">Today</div>
        <div className="flex items-center gap-2">
          {(Object.keys(READINESS_META) as Readiness[]).map((r) => {
            const meta = READINESS_META[r];
            const active = checkin?.readiness === r;
            const suggested = !checkin && suggestion?.level === r;
            return (
              <button
                key={r}
                onClick={() => submitReadiness(r)}
                className={`display text-[14px] tracking-[0.1em] px-4 py-2.5 border flex-1 text-center cursor-pointer transition-colors ${
                  active ? meta.active : suggested ? meta.suggest : `${meta.cls} hover:bg-surface-2`
                }`}
              >
                {FEEL_LABEL[r]}
              </button>
            );
          })}
        </div>
        {!checkin && suggestion ? (
          <div className="text-[13px] text-muted leading-snug mt-3.5">
            Coach&apos;s leaning {FEEL_LABEL[suggestion.level]}: {suggestion.reasons.join(", ")}.
          </div>
        ) : checkin ? (
          <div className="text-[13px] text-muted leading-snug mt-3.5">
            {READINESS_META[checkin.readiness].hint.charAt(0).toUpperCase() +
              READINESS_META[checkin.readiness].hint.slice(1)}
            .
          </div>
        ) : null}
        {(() => {
          const chip = cycle ? cycleChip(cycle) : null;
          const hasHealth =
            latestHealth &&
            (latestHealth.sleep_hours != null ||
              latestHealth.hrv != null ||
              latestHealth.resting_hr != null);
          if (!chip && !hasHealth) return null;
          const numCls = healthIsToday ? "text-faint" : "text-muted"; // dim provisional
          // Freshness is judged per pipeline (workstream #4): health and cycle
          // sync independently, so each is checked against its OWN latest reading
          // — not one gated on the other. Health stale after 3 days; the cycle
          // estimate is unreliable once nothing's synced in ~3 weeks.
          const health = freshness(latestHealth?.date, 3, today);
          const cycleStale = cycle ? freshness(cycle.dataThrough, 21, today).stale : true;
          return (
            <div className="mt-3.5 pt-3 border-t border-line">
              <div className={`flex gap-3.5 flex-wrap text-[11px] text-faint ${health.stale ? "opacity-60" : ""}`}>
                {chip &&
                  (cycleStale ? (
                    <span>
                      cycle <span className="text-hold">tracking behind</span>
                    </span>
                  ) : (
                    <span>
                      cycle <span className="num text-muted">{chip}</span>
                    </span>
                  ))}
                {latestHealth?.sleep_hours != null && (
                  <span>
                    sleep <span className={`num ${numCls}`}>{latestHealth.sleep_hours.toFixed(1)}</span>h
                  </span>
                )}
                {latestHealth?.hrv != null && (
                  <span>
                    HRV <span className={`num ${numCls}`}>{Math.round(latestHealth.hrv)}</span>
                  </span>
                )}
                {latestHealth?.resting_hr != null && (
                  <span>
                    RHR <span className={`num ${numCls}`}>{Math.round(latestHealth.resting_hr)}</span>
                  </span>
                )}
              </div>
              {hasHealth && health.stale && latestHealth?.date ? (
                <div className="text-[10px] text-hold mt-1.5">
                  Sync stalled · from {shortDate(latestHealth.date)} ({health.ageDays}d)
                </div>
              ) : hasHealth && !healthIsToday && latestHealth?.date ? (
                <div className="text-[10px] text-faint mt-1.5">from {shortDate(latestHealth.date)}</div>
              ) : null}
              {/* What the cycle phase means today — only while cycle tracking is
                  current. Skipped on a bleeding day (the signal strip covers that)
                  and when the estimate is stale (it can't be trusted). */}
              {!cycleStale && cycle && cyclePractical(cycle) && (
                <div className="text-[11px] text-faint mt-2 leading-snug">{cyclePractical(cycle)}</div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Weekly training mix — the shape she trains in */}
      <div className="mt-4">
        <WeekBalance />
      </div>

      {/* Self-updating baselines — earned target changes to confirm (workstream #1) */}
      <BaselineProposals />

      {/* Resume an unfinished session (survives an app reload) */}
      <ResumeSessionCard />

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

      {/* The old "Momentum" block (rolling last-7/last-30 counts + week dots) was
          removed: its counts duplicated and disagreed with the weekly "See all
          weeks" history, and the week dots duplicated the This-Week mix card and
          the "Week days" stat. One weekly view is the single source now. */}

      {/* CTA — you pick the session; nothing is prescribed */}
      <Button size="lg" className="mt-6" onClick={() => setTab("train")}>
        Open training →
      </Button>
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
