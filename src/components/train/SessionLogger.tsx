"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { exerciseMax, lastSessionLog, sessionAdjustment, sessionVolume } from "@/lib/analytics";
import { prescribeSet } from "@/lib/prescribe";
import { formatLogAsText } from "@/lib/format";
import {
  EXERCISE_THERAPY,
  FUEL_OPTIONS,
  FUEL_TIMING_OPTIONS,
  PT_CIRCUIT,
  SESSIONS,
  todayISO,
  type Exercise,
  type SessionKey,
} from "@/lib/program";
import type {
  Checkin,
  FuelStatus,
  FuelTiming,
  LogRow,
  Readiness,
  SessionLogData,
  SetEntry,
} from "@/lib/types";
import { Button, ChipGroup, Delta, Field, SectionLabel, inputClass } from "@/components/ui";
import { useApp } from "@/components/AppShell";
import { primeVoices, speak, speechSupported, stopSpeaking } from "@/lib/speech";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from "@/lib/session-draft";

const REST_SECONDS = 90;

// Effort, in her words rather than a bare number.
const RPE_OPTIONS = [
  { value: 5, label: "easy" },
  { value: 6, label: "could do more" },
  { value: 7, label: "solid" },
  { value: 8, label: "hard" },
  { value: 9, label: "very hard" },
  { value: 10, label: "max / failed" },
] as const;

// Reps left on the last hard set. -1 is the one that blocks progression.
const RIR_OPTIONS = [
  { value: 4, label: "4+" },
  { value: 3, label: "3" },
  { value: 2, label: "2" },
  { value: 1, label: "1" },
  { value: 0, label: "0" },
  { value: -1, label: "form broke" },
] as const;

// Parse a spoken set like "70 for 8", "8 reps at 70 pounds", "12 reps" into
// weight/reps. Keyword anchors win; otherwise the larger number is the weight.
function parseSetSpeech(text: string): { reps?: string; weight?: string } {
  const lower = text.toLowerCase();
  let reps: string | undefined;
  let weight: string | undefined;
  const repM = lower.match(/(\d+(?:\.\d+)?)\s*reps?\b/);
  if (repM) reps = repM[1];
  const wM = lower.match(/(\d+(?:\.\d+)?)\s*(?:pounds?|lbs?)\b/);
  if (wM) weight = wM[1];
  if (!reps || !weight) {
    const nums = lower.match(/\d+(?:\.\d+)?/g);
    if (nums && nums.length >= 2) {
      const a = Number(nums[0]);
      const b = Number(nums[1]);
      weight = weight ?? String(Math.max(a, b));
      reps = reps ?? String(Math.min(a, b));
    } else if (nums && nums.length === 1) {
      reps = reps ?? nums[0];
    }
  }
  return { reps, weight };
}

type Stage =
  | { name: "intro" }
  | { name: "exercise"; idx: number }
  | { name: "finish" }
  | { name: "saved"; row: LogRow };

// ─── Rest timer (starts each time a set is completed) ─────────────────────────

function RestTimer({
  endsAt,
  onDismiss,
  voice,
}: {
  endsAt: number;
  onDismiss: () => void;
  voice?: boolean;
}) {
  const [left, setLeft] = useState(() => Math.ceil((endsAt - Date.now()) / 1000));

  useEffect(() => {
    const t = setInterval(() => {
      const remaining = Math.ceil((endsAt - Date.now()) / 1000);
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(t);
        if (voice) speak("Rest's up. Next set.");
        onDismiss();
      }
    }, 250);
    return () => clearInterval(t);
  }, [endsAt, onDismiss, voice]);

  if (left <= 0) return null;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <button
      onClick={onDismiss}
      className="fixed bottom-0 inset-x-0 z-50 cursor-pointer"
      aria-label="Dismiss rest timer"
    >
      <div className="max-w-[520px] mx-auto bg-accent text-accent-ink flex items-center justify-between px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <span className="display text-[15px] tracking-[0.12em]">Rest</span>
        <span className="stat-num text-[28px]">
          {mm}:{ss}
        </span>
        <span className="display text-[12px] tracking-[0.1em] opacity-70">Tap to skip</span>
      </div>
    </button>
  );
}

// ─── Big stepper input ────────────────────────────────────────────────────────

function Stepper({
  value,
  onChange,
  step,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  step: number;
  label: string;
}) {
  const bump = (dir: 1 | -1) => {
    const next = (Number(value) || 0) + dir * step;
    onChange(next > 0 ? String(next) : "");
  };
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-stretch border border-line-strong">
        <button
          onClick={() => bump(-1)}
          className="w-10 text-muted hover:text-accent text-lg cursor-pointer shrink-0"
          aria-label={`decrease ${label}`}
        >
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
          className="stat-num w-full min-w-0 bg-transparent text-center text-[24px] text-ink outline-none py-2"
        />
        <button
          onClick={() => bump(1)}
          className="w-10 text-muted hover:text-accent text-lg cursor-pointer shrink-0"
          aria-label={`increase ${label}`}
        >
          +
        </button>
      </div>
      <div className="label !text-[9px] text-center mt-1">{label}</div>
    </div>
  );
}

// ─── Editable target (writes a program override) ──────────────────────────────

function TargetEditor({ ex }: { ex: Exercise }) {
  const { overrides, setOverride, removeOverride } = useApp();
  const override = overrides[ex.id];
  const effective = override?.target ?? ex.target;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(effective);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVal(override?.target ?? ex.target);
  }, [override, ex.target]);

  if (!editing) {
    return (
      <button
        onClick={() => {
          setVal(effective);
          setEditing(true);
        }}
        className="flex items-center gap-1.5 cursor-pointer group"
        aria-label="Edit target"
      >
        <span className="display text-[13px] tracking-[0.06em] text-accent group-hover:brightness-110">
          {effective.toUpperCase()}
        </span>
        {override?.target ? (
          <span className="label !text-[9px] !text-faint">adjusted</span>
        ) : (
          <span className="text-faint text-[11px]">✎</span>
        )}
      </button>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await setOverride(ex.id, val.trim() || null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    setSaving(true);
    try {
      await removeOverride(ex.id);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 w-full mt-1">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        autoFocus
        className={`${inputClass} !py-1.5 !px-2.5 text-[13px] flex-1`}
      />
      <Button size="sm" onClick={save} disabled={saving}>
        Save
      </Button>
      {override?.target && (
        <button onClick={reset} className="label !text-[9px] hover:text-stop cursor-pointer">
          reset
        </button>
      )}
      <button
        onClick={() => setEditing(false)}
        aria-label="Cancel"
        className="text-faint text-sm cursor-pointer px-1"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Guided session ───────────────────────────────────────────────────────────

export default function SessionLogger({
  sessionKey,
  initialDate,
  onClose,
}: {
  sessionKey: SessionKey;
  initialDate?: string;
  onClose: () => void;
}) {
  // Resolved, not the code template — this is the workout she actually does, so
  // it has to reflect anything the coach swapped, added, or dropped.
  const { logs, addLog, askCoach, overrides, sessions } = useApp();
  const session = sessions[sessionKey];

  const prev = useMemo(() => lastSessionLog(logs, sessionKey), [logs, sessionKey]);

  const [stage, setStage] = useState<Stage>({ name: "intro" });
  const [log, setLog] = useState<SessionLogData>({
    date: initialDate ?? todayISO(),
    sessionKey,
    kneeStart: 0,
    kneeEnd: 0,
    bikeMin: 0,
    ptDone: false,
    exerciseTherapyDone: false,
    sets: {},
    cooldownCount: 0,
    cooldownTotal: session.cooldown.length,
    notes: "",
    sessionRPE: null,
    lastSetRIR: null,
  });
  // When Begin was pressed — the session's real length, auto-filled at the end
  // and editable there. Nothing wrote this before, so durations were absent or
  // came from the old v1 import (hence the 1- and 2-minute "sessions").
  const startedAtRef = useRef<number | null>(null);
  const [doneSets, setDoneSets] = useState<Record<string, boolean>>({});
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [showPt, setShowPt] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recovery inputs relocated here from the old Today card — captured at their
  // natural moment (right after training) and written to hrl_recovery so the
  // coach still sees them. Fuel-beforehand is already collected on the exercise
  // screen (log.preFuel); these two are the after/yesterday half.
  const [postFuel, setPostFuel] = useState<FuelStatus | null>(null);
  const [proteinFloor, setProteinFloor] = useState<"yes" | "close" | "no" | "unknown" | null>(null);

  // Today's readiness → autoregulation note in the intro.
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  useEffect(() => {
    const today = todayISO();
    api<Checkin[]>(`/api/checkins?since=${today}`)
      .then((rows) => setReadiness(rows.find((r) => r.date === today)?.readiness ?? null))
      .catch(() => {});
  }, []);
  const adjust = sessionAdjustment(readiness);

  // Restore an in-progress draft for this session (survives an app reload).
  useEffect(() => {
    const d = readSessionDraft();
    if (d && d.sessionKey === sessionKey) {
      setLog(d.log);
      setDoneSets(d.doneSets ?? {});
      setStage(d.stage as Stage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft while actively logging.
  useEffect(() => {
    if (stage.name === "exercise" || stage.name === "finish") {
      writeSessionDraft({ sessionKey, stage, log, doneSets });
    }
  }, [stage, log, doneSets, sessionKey]);

  // Voice cues (built-in speech), remembered across sessions.
  const [voiceOn, setVoiceOn] = useState(false);
  useEffect(() => {
    setVoiceOn(localStorage.getItem("volt_voice_cues") === "1");
    primeVoices();
  }, []);
  const toggleVoice = () =>
    setVoiceOn((v) => {
      const next = !v;
      localStorage.setItem("volt_voice_cues", next ? "1" : "0");
      if (!next) stopSpeaking();
      return next;
    });

  // Voice logging: speak a set → transcribe → fill the first not-yet-done set.
  const voiceFillRef = useRef<(text: string) => void>(() => {});
  const logVoice = useVoiceRecorder((text) => voiceFillRef.current(text));

  // Announce each exercise as you reach it.
  useEffect(() => {
    if (!voiceOn || stage.name !== "exercise") return;
    const ex = session.exercises[stage.idx];
    if (!ex) return;
    if (ex.id === "g1_note") {
      speak(ex.name);
      return;
    }
    const target = overrides[ex.id]?.target ?? ex.target;
    speak(`${ex.name}. ${ex.sets} sets of ${ex.reps}. Target ${target}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, voiceOn]);

  const setField = <K extends keyof SessionLogData>(field: K, val: SessionLogData[K]) =>
    setLog((l) => ({ ...l, [field]: val }));

  const setEntry = (key: string, v: SetEntry) =>
    setLog((l) => ({ ...l, sets: { ...l.sets, [key]: v } }));

  // Prefill: last session's numbers are the starting point — but only where the
  // prior effort actually matches what THIS session prescribes. A strength load
  // does not become the suggestion for a high-rep day, and a yellow morning
  // trims what's offered. See lib/prescribe.ts.
  const begin = () => {
    setLog((l) => {
      const next: Record<string, SetEntry> = {};
      for (const ex of session.exercises) {
        for (let i = 0; i < ex.sets; i++) {
          const key = `${ex.id}_s${i}`;
          // NEVER overwrite a set she's already typed into. Re-entering a session
          // (e.g. one started yesterday) must keep her logged weights/reps, not
          // reset them to the prescription's previous-session default.
          const existing = l.sets[key];
          if (
            existing &&
            (existing.reps || existing.weight || existing.duration || existing.assistWeight)
          ) {
            next[key] = existing;
            continue;
          }
          const { source, ...entry } = prescribeSet({
            exercise: ex,
            previous: prev?.data.sets[key],
            readiness,
          });
          void source;
          if (entry.reps || entry.weight || entry.duration) next[key] = entry;
        }
      }
      return { ...l, sets: next };
    });
    startedAtRef.current = Date.now();
    setStage({ name: "exercise", idx: 0 });
    setShowNote(false);
  };

  /** Elapsed minutes since Begin, for the duration field at save. */
  const elapsedMin = (): number | null =>
    startedAtRef.current == null
      ? null
      : Math.max(1, Math.round((Date.now() - startedAtRef.current) / 60000));

  const completeSet = (key: string, isLastSetOfExercise: boolean) => {
    setDoneSets((d) => {
      const next = { ...d, [key]: !d[key] };
      if (next[key] && !isLastSetOfExercise) setRestEndsAt(Date.now() + REST_SECONDS * 1000);
      return next;
    });
  };

  const goTo = (idx: number) => {
    setRestEndsAt(null);
    setShowNote(false);
    if (idx < 0) setStage({ name: "intro" });
    else if (idx >= session.exercises.length) {
      // Auto-fill the elapsed time on arrival; she can correct it below.
      const mins = elapsedMin();
      if (mins != null) setLog((l) => (l.durationMin == null ? { ...l, durationMin: mins } : l));
      setStage({ name: "finish" });
    } else setStage({ name: "exercise", idx });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    // Only sets marked done are real — prefilled-but-unperformed sets drop out
    const performedSets: Record<string, SetEntry> = {};
    for (const [key, entry] of Object.entries(log.sets)) {
      if (doneSets[key] && (entry.reps || entry.weight || entry.duration || entry.assistWeight))
        performedSets[key] = entry;
    }
    const payload: SessionLogData = { ...log, sets: performedSets };
    try {
      const row = await api<LogRow>("/api/logs", {
        method: "POST",
        body: JSON.stringify({
          logged_at: payload.date,
          kind: "session",
          session_key: sessionKey,
          data: payload,
        }),
      });
      addLog(row);
      // Relocated recovery inputs → hrl_recovery for the session date, keeping the
      // coach's recovery line fed. Best-effort; a failure never blocks the log.
      if (postFuel || proteinFloor) {
        api("/api/recovery", {
          method: "POST",
          body: JSON.stringify({
            date: payload.date,
            ...(postFuel ? { post_training_fuel: postFuel } : {}),
            ...(proteinFloor ? { protein_floor: proteinFloor } : {}),
          }),
        }).catch(() => {});
      }
      clearSessionDraft();
      setStage({ name: "saved", row });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── INTRO ──
  if (stage.name === "intro") {
    return (
      <div className="px-5 pb-8 fade-up">
        <div className="pt-6 flex justify-between items-baseline">
          <button onClick={onClose} className="label hover:text-muted cursor-pointer">
            ← Exit
          </button>
          <span className="display bg-accent text-accent-ink text-[13px] tracking-[0.06em] px-2.5 py-0.5">
            {sessionKey}
          </span>
        </div>
        <h1 className="display-i text-[52px] text-ink mt-5">
          {session.label.split(" ")[0]}
          <br />
          {session.label.split(" ").slice(1).join(" ") || session.subtitle.split(" ")[0]}
        </h1>
        <div className="label !text-muted mt-3">
          {session.subtitle.toUpperCase()} · {session.exercises.length} exercises · 45 min cap
        </div>
        {prev && (
          <div className="label mt-2">
            Last time: {prev.logged_at} — your numbers are pre-loaded
          </div>
        )}

        {adjust && (
          <div
            className={`mt-5 border-l-[3px] pl-3.5 py-2 ${
              adjust.tone === "stop" ? "border-stop" : "border-hold"
            }`}
          >
            <div
              className={`label !text-[9px] ${
                adjust.tone === "stop" ? "!text-stop" : "!text-hold"
              }`}
            >
              {adjust.title}
            </div>
            <div className="text-[13px] text-ink leading-snug mt-1">{adjust.note}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-7">
          <Field label="Knee start (0–10)">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={log.kneeStart}
              onChange={(e) => setField("kneeStart", +e.target.value)}
              className={`${inputClass} stat-num !text-[22px] text-center`}
            />
          </Field>
          <Field label="Bike warm-up (min)">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={log.bikeMin}
              onChange={(e) => setField("bikeMin", +e.target.value)}
              className={`${inputClass} stat-num !text-[22px] text-center`}
            />
          </Field>
        </div>

        {/* Asked before the work, while the answer is still known. Optional —
            nothing here blocks starting. */}
        <div className="mt-5 border border-line p-3.5">
          <SectionLabel>Before you start</SectionLabel>
          <div className="label !text-[9px] mt-2 mb-2">Fuel beforehand</div>
          <ChipGroup
            cols={3}
            options={FUEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={log.preFuel?.status ?? null}
            onChange={(v) =>
              setField("preFuel", { ...log.preFuel, status: (v as FuelStatus) ?? null })
            }
          />
          {log.preFuel?.status && log.preFuel.status !== "nothing" && (
            <>
              <div className="label !text-[9px] mt-3 mb-2">How long before</div>
              <ChipGroup
                cols={4}
                options={FUEL_TIMING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={log.preFuel?.timing ?? null}
                onChange={(v) =>
                  setField("preFuel", { ...log.preFuel, status: log.preFuel?.status ?? null, timing: (v as FuelTiming) ?? null })
                }
              />
            </>
          )}

        </div>

        <div className="mt-5 border border-line p-3.5">
          <div className="flex items-center justify-between">
            <SectionLabel>PT compliance</SectionLabel>
            <button
              onClick={() => setShowPt((s) => !s)}
              className="label !text-[9px] hover:text-muted cursor-pointer mb-2"
            >
              {showPt ? "hide" : "protocol"}
            </button>
          </div>
          {(
            [
              { field: "ptDone", label: "PT / mobility warm-up — optional (Spear — 18 min, after bike)" },
              { field: "exerciseTherapyDone", label: "Exercise Therapy done separately (AM / midday)" },
            ] as const
          ).map(({ field, label }) => (
            <label key={field} className="flex items-start gap-2.5 text-[13px] text-ink mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={log[field]}
                onChange={(e) => setField(field, e.target.checked)}
                className="mt-0.5 accent-[#d8ff3e]"
              />
              {label}
            </label>
          ))}
          {showPt && (
            <div className="mt-2 pt-2 border-t border-line space-y-2">
              <div>
                <div className="label !text-[9px] mb-1">PT circuit</div>
                {PT_CIRCUIT.map((p) => (
                  <div key={p.name} className="text-xs text-muted">
                    {p.name} — {p.sets}×{p.reps}
                  </div>
                ))}
              </div>
              <div>
                <div className="label !text-[9px] mb-1">Exercise therapy</div>
                {EXERCISE_THERAPY.map((p) => (
                  <div key={p.name} className="text-xs text-muted">
                    {p.name} — {p.duration}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Button size="lg" className="mt-6" onClick={begin}>
          Begin →
        </Button>
      </div>
    );
  }

  // ── EXERCISE ──
  if (stage.name === "exercise") {
    const idx = stage.idx;
    const ex: Exercise = session.exercises[idx];
    const isInfoOnly = ex.id === "g1_note";
    const isAssisted = ex.loadType === "assistance";
    const weighted = ex.weighted !== false;
    const prevTop = prev
      ? Object.entries(prev.data.sets)
          .filter(([k]) => k.startsWith(ex.id + "_s"))
          .map(([, e]) => e)
      : [];
    const lastLine = prevTop.length
      ? prevTop
          .map((e) =>
            ex.timed
              ? e.duration
              : isAssisted
                ? `${e.reps ?? "?"}${e.assistWeight ? ` @${e.assistWeight} assist` : ""}`
                : `${e.reps ?? "?"}${e.weight ? `×${e.weight}` : ""}`,
          )
          .filter(Boolean)
          .join(" · ")
      : null;
    const allTimeMax = weighted ? exerciseMax(logs, ex.id) : 0;

    // Voice logging fills the first not-yet-completed set of this exercise.
    voiceFillRef.current = (text: string) => {
      const { reps, weight } = parseSetSpeech(text);
      if (!reps && !weight) return;
      for (let i = 0; i < ex.sets; i++) {
        const key = `${ex.id}_s${i}`;
        if (!doneSets[key]) {
          const cur = log.sets[key] ?? {};
          setEntry(key, {
            ...cur,
            ...(reps ? { reps } : {}),
            ...(weight && weighted ? { weight } : {}),
          });
          break;
        }
      }
    };

    return (
      <div className="px-5 pb-8 fade-up" key={ex.id}>
        {/* Progress header */}
        <div className="pt-6 flex justify-between items-center">
          <button onClick={onClose} className="label hover:text-muted cursor-pointer">
            ← Exit
          </button>
          <div className="flex items-center gap-3">
            {speechSupported() && (
              <button
                onClick={toggleVoice}
                aria-label={voiceOn ? "Turn off voice cues" : "Turn on voice cues"}
                className={`display text-[11px] tracking-[0.08em] border px-2 py-1 cursor-pointer transition-colors ${
                  voiceOn
                    ? "border-accent text-accent"
                    : "border-line-strong text-faint hover:text-muted"
                }`}
              >
                {voiceOn ? "◉ Voice" : "○ Voice"}
              </button>
            )}
            <span className="stat-num text-[15px] text-muted">
              {idx + 1}
              <span className="text-faint">/{session.exercises.length}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-1 mt-3">
          {session.exercises.map((e, i) => (
            <span
              key={e.id}
              className={`flex-1 h-[4px] ${
                i < idx ? "bg-accent" : i === idx ? "bg-accent/50" : "bg-surface-2"
              }`}
            />
          ))}
        </div>

        {/* Exercise poster */}
        <h2 className="display-i text-[38px] text-ink mt-6 leading-[0.95]">{ex.name}</h2>
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          <span className="label !text-muted">
            {ex.sets} × {ex.reps.toUpperCase()}
          </span>
          <TargetEditor ex={ex} />
        </div>
        {lastLine && (
          <div className="mt-3 border border-line-strong inline-flex items-center gap-2 px-2.5 py-1.5">
            <span className="label !text-[9px]">Last</span>
            <span className="num text-[13px] text-ink">{lastLine}</span>
          </div>
        )}
        {ex.note && (
          <div className="mt-3">
            <button
              onClick={() => setShowNote((s) => !s)}
              className="label !text-accent cursor-pointer"
            >
              {showNote ? "− Coach note" : "+ Coach note"}
            </button>
            {showNote && (
              <div className="text-[13px] text-muted leading-relaxed mt-2 border-l-[3px] border-accent pl-3">
                {ex.note}
              </div>
            )}
          </div>
        )}

        {/* Sets */}
        {!isInfoOnly && (
          <div className="mt-6 space-y-3">
            {logVoice.supported && (
              <div>
                <button
                  onClick={logVoice.recording ? logVoice.stop : logVoice.start}
                  disabled={logVoice.busy}
                  className={`display text-[11px] tracking-[0.08em] border px-3 py-1.5 cursor-pointer transition-colors ${
                    logVoice.recording
                      ? "border-stop text-stop"
                      : "border-line-strong text-muted hover:text-accent hover:border-accent"
                  }`}
                >
                  {logVoice.busy
                    ? "Logging…"
                    : logVoice.recording
                      ? "◉ Stop — then it fills"
                      : "◉ Talk to log a set"}
                </button>
                {logVoice.error && (
                  <span className="text-[11px] text-stop ml-2">{logVoice.error}</span>
                )}
              </div>
            )}
            {Array.from({ length: ex.sets }).map((_, i) => {
              const key = `${ex.id}_s${i}`;
              const entry = log.sets[key] ?? {};
              const done = !!doneSets[key];
              return (
                <div key={key} className={`flex items-end gap-3 ${done ? "opacity-60" : ""}`}>
                  <span className="label !text-[10px] w-7 pb-3 shrink-0">S{i + 1}</span>
                  {ex.timed ? (
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="45 sec"
                        value={entry.duration ?? ""}
                        onChange={(e) => setEntry(key, { ...entry, duration: e.target.value })}
                        className={`${inputClass} stat-num !text-[20px] text-center`}
                      />
                      <div className="label !text-[9px] text-center mt-1">Duration</div>
                    </div>
                  ) : (
                    <Stepper
                      value={entry.reps ?? ""}
                      onChange={(v) => setEntry(key, { ...entry, reps: v })}
                      step={1}
                      label="Reps"
                    />
                  )}
                  {isAssisted && (
                    <Stepper
                      value={entry.assistWeight ?? ""}
                      onChange={(v) => setEntry(key, { ...entry, assistWeight: v })}
                      step={5}
                      label="Assist lbs"
                    />
                  )}
                  {weighted && (
                    <Stepper
                      value={entry.weight ?? ""}
                      onChange={(v) => setEntry(key, { ...entry, weight: v })}
                      step={5}
                      label="Lbs"
                    />
                  )}
                  <button
                    onClick={() => completeSet(key, i === ex.sets - 1)}
                    aria-label={`set ${i + 1} done`}
                    className={`display w-12 h-[46px] mb-[17px] text-[18px] shrink-0 cursor-pointer transition-colors ${
                      done
                        ? "bg-accent text-accent-ink tick"
                        : "border border-line-strong text-faint hover:border-accent hover:text-accent"
                    }`}
                  >
                    ✓
                  </button>
                </div>
              );
            })}
            {weighted && allTimeMax > 0 && (
              <div className="label !text-[9px]">All-time top set: {allTimeMax} lbs</div>
            )}
          </div>
        )}
        {isInfoOnly && ex.note && !showNote && (
          <div className="text-[13px] text-muted leading-relaxed mt-5 border-l-[3px] border-hold pl-3">
            {ex.note}
          </div>
        )}

        {/* Nav */}
        <div className="flex gap-2.5 mt-8">
          <Button variant="secondary" size="md" className="flex-1" onClick={() => goTo(idx - 1)}>
            ← {idx === 0 ? "Intro" : "Prev"}
          </Button>
          <Button size="md" className="flex-[2]" onClick={() => goTo(idx + 1)}>
            {idx === session.exercises.length - 1 ? "Finish →" : "Next →"}
          </Button>
        </div>

        {restEndsAt && (
          <RestTimer endsAt={restEndsAt} onDismiss={() => setRestEndsAt(null)} voice={voiceOn} />
        )}
      </div>
    );
  }

  // ── FINISH ──
  if (stage.name === "finish") {
    return (
      <div className="px-5 pb-8 fade-up">
        <div className="pt-6">
          <button
            onClick={() => goTo(session.exercises.length - 1)}
            className="label hover:text-muted cursor-pointer"
          >
            ← Back
          </button>
        </div>
        <h2 className="display-i text-[44px] text-ink mt-5">
          Bring it
          <br />
          home
        </h2>

        <div className="mt-6 border border-line p-3.5">
          <SectionLabel>
            Cooldown · {log.cooldownCount}/{session.cooldown.length}
          </SectionLabel>
          {session.cooldown.map((item, i) => (
            <label key={i} className="flex items-start gap-2.5 text-[13px] text-ink mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={log.cooldownCount > i}
                onChange={(e) => setField("cooldownCount", e.target.checked ? i + 1 : i)}
                className="mt-0.5 accent-[#d8ff3e]"
              />
              {item}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Field label="Knee end (0–10)">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={log.kneeEnd}
              onChange={(e) => setField("kneeEnd", +e.target.value)}
              className={`${inputClass} stat-num !text-[22px] text-center`}
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={log.date}
              onChange={(e) => setField("date", e.target.value)}
              className={`${inputClass} num`}
            />
          </Field>
        </div>

        {/* How hard it actually was. Load says what she moved; this says what it
            cost — and it's what decides whether a lift progresses next time. */}
        <div className="mt-4 border border-line p-3.5">
          <SectionLabel>How it went</SectionLabel>
          <div className="label !text-[9px] mb-2">Session effort</div>
          <div className="grid grid-cols-3 gap-1.5">
            {RPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setField("sessionRPE", log.sessionRPE === o.value ? null : o.value)}
                className={`border px-1 py-2 cursor-pointer transition-colors ${
                  log.sessionRPE === o.value
                    ? "bg-accent text-accent-ink border-accent"
                    : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                <span className="stat-num text-[16px] block leading-none">{o.value}</span>
                <span className="label !text-[8px] !text-inherit block mt-1">{o.label}</span>
              </button>
            ))}
          </div>

          <div className="label !text-[9px] mt-4 mb-2">Last hard set — reps left in the tank</div>
          <div className="grid grid-cols-3 gap-1.5">
            {RIR_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setField("lastSetRIR", log.lastSetRIR === o.value ? null : o.value)}
                className={`border px-1 py-2 cursor-pointer transition-colors ${
                  log.lastSetRIR === o.value
                    ? "bg-accent text-accent-ink border-accent"
                    : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                <span className="display text-[13px] block leading-none">{o.label}</span>
              </button>
            ))}
          </div>

          <div className="label !text-[9px] mt-4 mb-2">Time on the floor</div>
          <div className="flex items-center gap-2 flex-wrap">
            {[30, 45, 60, 75].map((m) => (
              <button
                key={m}
                onClick={() => setField("durationMin", m)}
                className={`display text-[12px] tracking-[0.06em] border px-2.5 py-1.5 cursor-pointer transition-colors ${
                  log.durationMin === m
                    ? "bg-accent text-accent-ink border-accent"
                    : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {m === 75 ? "75+" : m} min
              </button>
            ))}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="min"
              value={log.durationMin ?? ""}
              onChange={(e) =>
                setField("durationMin", e.target.value ? Number(e.target.value) : undefined)
              }
              className={`${inputClass} num !py-1.5 !px-2.5 !text-[13px] w-20`}
            />
          </div>
        </div>

        <Field label="Session notes" className="mt-4">
          <textarea
            rows={3}
            value={log.notes}
            onChange={(e) => setField("notes", e.target.value)}
            placeholder="Knee response, form, fatigue..."
            className={`${inputClass} resize-y`}
          />
        </Field>

        {/* Recovery — moved off the Today screen to its natural moment. Optional;
            what you set here goes to your coach. */}
        <div className="mt-4 border border-line p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <SectionLabel>Recovery</SectionLabel>
            <span className="label !text-[8px] !text-accent-dim">Coach reads this</span>
          </div>
          <div className="label !text-[9px] mb-2">Food after this session</div>
          <ChipGroup
            cols={3}
            options={FUEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={postFuel}
            onChange={(v) => setPostFuel((v as FuelStatus) ?? null)}
          />
          <div className="label !text-[9px] mt-3 mb-2">Protein floor yesterday</div>
          <ChipGroup
            cols={4}
            options={[
              { value: "yes", label: "Yes" },
              { value: "close", label: "Close" },
              { value: "no", label: "No" },
              { value: "unknown", label: "Not sure" },
            ]}
            value={proteinFloor}
            onChange={(v) => setProteinFloor((v as typeof proteinFloor) ?? null)}
          />
        </div>

        {error && <div className="text-xs text-stop mt-3">{error}</div>}
        <Button size="lg" className="mt-5" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save session →"}
        </Button>
      </div>
    );
  }

  // ── SAVED ──
  const row = stage.row;
  const data = row.data as SessionLogData;
  const vol = sessionVolume(data);
  const prevVol = prev ? sessionVolume(prev.data) : 0;
  const prs = session.exercises
    .filter((ex) => ex.weighted !== false)
    .map((ex) => {
      const top = Math.max(
        0,
        ...Object.entries(data.sets)
          .filter(([k]) => k.startsWith(ex.id + "_s"))
          .map(([, e]) => Number(e.weight) || 0),
      );
      const prevMax = exerciseMax(logs, ex.id, row.id);
      return top > 0 && top > prevMax ? { name: ex.name, top, prevMax } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div className="px-5 pb-8 fade-up">
      <div className="pt-6 flex justify-between items-baseline">
        <span className="display text-[15px] tracking-[0.08em] text-accent">LOGGED</span>
        <span className="label">{data.date}</span>
      </div>
      <h2 className="display-i text-[52px] text-ink mt-4">
        Session
        <br />
        done.
      </h2>

      <div className="grid grid-cols-2 gap-px bg-line border border-line mt-6">
        <div className="bg-surface p-3">
          <div className="stat-num text-[24px] text-ink">
            {vol >= 1000 ? `${Math.round(vol / 100) / 10}K` : vol}
          </div>
          <div className="label mt-1.5">Volume lbs</div>
          {prevVol > 0 && (
            <div className="mt-1">
              <Delta value={Math.round(((vol - prevVol) / prevVol) * 100)} unit="%" />
            </div>
          )}
        </div>
        <div className="bg-surface p-3">
          <div className={`stat-num text-[24px] ${prs.length ? "text-accent" : "text-ink"}`}>
            {prs.length}
          </div>
          <div className="label mt-1.5">New PRs</div>
        </div>
      </div>

      {prs.length > 0 && (
        <div className="mt-4 border border-accent/50 p-3.5">
          <div className="label !text-accent mb-2">Personal records</div>
          {prs.map((pr) => (
            <div key={pr.name} className="flex justify-between items-baseline mb-1">
              <span className="text-[13px] text-ink font-semibold">{pr.name}</span>
              <span className="num text-[13px] text-accent">
                {pr.prevMax > 0 ? `${pr.prevMax} → ` : ""}
                {pr.top} lbs
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted mt-4">
        Knee {data.kneeStart}→{data.kneeEnd}
        {data.ptDone ? " · PT done" : ""} · cooldown{" "}
        {data.cooldownCount}/{data.cooldownTotal}
      </div>

      <div className="flex gap-2.5 mt-6">
        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={() => navigator.clipboard?.writeText(formatLogAsText(row))}
        >
          Copy
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={() =>
            askCoach(
              `Here's the session I just logged:\n\n${formatLogAsText(row)}\n\nHow did this look?`,
            )
          }
        >
          Ask coach
        </Button>
        <Button size="md" className="flex-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
