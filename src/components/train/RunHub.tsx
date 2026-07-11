"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { formatLogAsText } from "@/lib/format";
import {
  RUN_COOLDOWN_STEPS,
  RUN_DURABILITY,
  RUN_WARMUP,
  runTraffic,
  todayISO,
} from "@/lib/program";
import type { LogRow, RunLogData } from "@/lib/types";
import {
  Button,
  Card,
  CheckRow,
  Field,
  ScreenHeader,
  Segmented,
  inputClass,
} from "@/components/ui";
import SavedSummary from "@/components/train/SavedSummary";
import { useApp } from "@/components/AppShell";

type RunTab = "warmup" | "log" | "cooldown" | "durability";

const RUN_FIELDS: { id: keyof RunLogData; label: string; type: string; placeholder?: string }[] = [
  { id: "run_date", label: "Date", type: "date" },
  { id: "run_dist", label: "Distance (miles)", type: "number", placeholder: "e.g. 1.0" },
  { id: "run_time", label: "Time (min:sec)", type: "text", placeholder: "e.g. 10:00" },
  { id: "run_knee_end", label: "Left knee during (0–10)", type: "number", placeholder: "0" },
  { id: "run_ankle", label: "Right ankle during (0–10)", type: "number", placeholder: "0" },
  { id: "run_am_knee", label: "Left knee next AM (0–10)", type: "number", placeholder: "0" },
  { id: "run_am_ankle", label: "Right ankle next AM (0–10)", type: "number", placeholder: "0" },
  { id: "run_notes", label: "Notes (gait, surface, etc.)", type: "text", placeholder: "optional" },
];

function Converter() {
  const [km, setKm] = useState("");
  const [mi, setMi] = useState("");
  const onKm = (v: string) => {
    setKm(v);
    setMi(v === "" || isNaN(Number(v)) ? "" : (Number(v) * 0.621371).toFixed(2));
  };
  const onMi = (v: string) => {
    setMi(v);
    setKm(v === "" || isNaN(Number(v)) ? "" : (Number(v) / 0.621371).toFixed(2));
  };
  return (
    <Card className="p-3 mb-3">
      <div className="text-[11px] font-semibold text-muted mb-2">km ↔ mi converter</div>
      <div className="flex items-center gap-2">
        <input type="number" inputMode="decimal" placeholder="km" value={km}
          onChange={(e) => onKm(e.target.value)} className={`${inputClass} num`} />
        <span className="text-faint text-sm">↔</span>
        <input type="number" inputMode="decimal" placeholder="mi" value={mi}
          onChange={(e) => onMi(e.target.value)} className={`${inputClass} num`} />
      </div>
      <div className="text-[10px] text-faint mt-1.5">
        Treadmill in km? Convert here, then log miles below.
      </div>
    </Card>
  );
}

export default function RunHub({
  initialDate,
  onClose,
}: {
  initialDate?: string;
  onClose: () => void;
}) {
  const { addLog, askCoach } = useApp();
  const [tab, setTab] = useState<RunTab>("warmup");
  const [warmupDone, setWarmupDone] = useState<Record<number, boolean>>({});
  const [cooldownDone, setCooldownDone] = useState<Record<number, boolean>>({});
  const [showStiff, setShowStiff] = useState(false);
  const [fields, setFields] = useState<RunLogData>({
    type: "run",
    date: initialDate ?? todayISO(),
    run_date: initialDate ?? todayISO(),
    run_dist: "",
    run_time: "",
    run_knee_end: "",
    run_ankle: "",
    run_am_knee: "",
    run_am_ankle: "",
    run_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRow, setSavedRow] = useState<LogRow | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = { ...fields, date: fields.run_date };
      const row = await api<LogRow>("/api/logs", {
        method: "POST",
        body: JSON.stringify({ logged_at: fields.run_date, kind: "run", data }),
      });
      addLog(row);
      setSavedRow(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (savedRow) {
    const traffic = runTraffic(fields.run_am_knee, fields.run_am_ankle);
    return (
      <div className="px-4">
        <ScreenHeader title="Run saved" onBack={onClose} />
        <SavedSummary
          title="Run logged"
          text={formatLogAsText(savedRow)}
          light={traffic.light}
          advice={traffic.advice}
          onDone={onClose}
          onAskCoach={(text) =>
            askCoach(`Here's the run I just logged:\n\n${text}\n\nWhat's the call for the next run?`)
          }
        />
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 fade-up">
      <ScreenHeader
        title="Run"
        subtitle="1 mile cleared · traffic light governs progression"
        onBack={onClose}
      />

      <div className="mb-4">
        <Segmented<RunTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "warmup", label: "Warm-up" },
            { value: "log", label: "Log" },
            { value: "cooldown", label: "Cooldown" },
            { value: "durability", label: "Durability" },
          ]}
        />
      </div>

      {tab === "warmup" && (
        <div>
          <div className="text-xs text-muted mb-3">8–10 min · complete before every run.</div>
          {RUN_WARMUP.steps.map((s) => (
            <CheckRow
              key={s.step}
              index={s.step}
              checked={!!warmupDone[s.step]}
              onToggle={() => setWarmupDone((p) => ({ ...p, [s.step]: !p[s.step] }))}
              title={s.name}
              dose={s.dose}
              note={s.note}
            />
          ))}
          <button
            onClick={() => setShowStiff((s) => !s)}
            className="w-full mt-1 p-3 bg-hold/10 border border-hold/25 text-hold text-[13px] font-semibold cursor-pointer"
          >
            {showStiff ? "Hide" : "Ankle feels stiff? Tap here"}
          </button>
          {showStiff && (
            <Card className="p-3.5 mt-2">
              <div className="text-xs text-hold mb-2 font-medium">
                Add only if needed — light and preparatory, not long holds.
              </div>
              {RUN_WARMUP.ifStiff.map((s) => (
                <div key={s.name} className="text-xs text-muted mb-1.5">
                  <span className="font-semibold text-ink">{s.name}</span> — {s.dose}. {s.note}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === "log" && (
        <div>
          <Converter />
          <div className="p-3 bg-hold/10 border border-hold/25 text-hold text-xs mb-3">
            Log AM responses the morning AFTER the run. Next-morning readings drive the traffic light.
          </div>
          {RUN_FIELDS.map((f) => (
            <Field key={f.id} label={f.label} className="mb-3">
              <input
                type={f.type}
                inputMode={f.type === "number" ? "decimal" : undefined}
                placeholder={f.placeholder}
                step={f.type === "number" ? "any" : undefined}
                value={fields[f.id] as string}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.id]: e.target.value }))}
                className={`${inputClass} num`}
              />
            </Field>
          ))}
          {error && <div className="text-xs text-stop mb-3">{error}</div>}
          <Button size="lg" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save run"}
          </Button>
        </div>
      )}

      {tab === "cooldown" && (
        <div>
          <div className="text-xs text-muted mb-3">
            5–10 min · not optional while the ankle is the rate-limiter. Ice right ankle 10 min if any tenderness.
          </div>
          {RUN_COOLDOWN_STEPS.map((s) => (
            <CheckRow
              key={s.step}
              index={s.step}
              checked={!!cooldownDone[s.step]}
              onToggle={() => setCooldownDone((p) => ({ ...p, [s.step]: !p[s.step] }))}
              title={s.name}
              dose={s.dose}
              note={s.note}
            />
          ))}
        </div>
      )}

      {tab === "durability" && (
        <div>
          <div className="text-xs text-muted mb-3">Do after lifting or on a non-run day — twice weekly.</div>
          {RUN_DURABILITY.map((s) => (
            <Card key={s.name} className="p-3.5 mb-2">
              <div className="text-sm font-semibold text-ink">
                {s.name} <span className="font-normal text-muted">— {s.dose}</span>
              </div>
              <div className="text-xs text-muted mt-0.5">{s.note}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
