"use client";

import { useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import {
  isRunLog,
  isSessionLog,
  isXtrainLog,
  type LogRow,
  type RunLogData,
  type SessionLogData,
  type XtrainLogData,
} from "@/lib/types";
import { Button, inputClass } from "@/components/ui";
import type { ProgramSessions } from "@/lib/program-resolve";
import { useApp } from "@/components/AppShell";

// ─── Editing a past log ───────────────────────────────────────────────────────
// A focused inline editor: fix a date, a weight, a distance, or add the next-
// morning ankle score to a run logged the night before — without re-logging the
// whole thing. Saves through PATCH /api/logs/[id] and updates the shared cache.
// Shared by the Train history list and the Calendar day view.

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label block mb-1">{label}</span>
      {children}
    </label>
  );
}

const editInput = `${inputClass} !h-9 !text-[13px]`;

function useLogSave(id: string) {
  const { updateLog } = useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (data: object, loggedAt: string, onDone: () => void) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api<LogRow>(`/api/logs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ data, logged_at: loggedAt }),
      });
      updateLog(updated);
      onDone();
    } catch {
      setError("Couldn't save — try again.");
      setSaving(false);
    }
  };
  return { save, saving, error };
}

function EditActions({
  onSave,
  onDone,
  saving,
  error,
}: {
  onSave: () => void;
  onDone: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <>
      {error && <div className="text-[12px] text-stop">{error}</div>}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </>
  );
}

export function LogEditor({
  row,
  sessions,
  onDone,
}: {
  row: LogRow;
  sessions: ProgramSessions;
  onDone: () => void;
}) {
  if (isSessionLog(row)) return <SessionEditor row={row} sessions={sessions} onDone={onDone} />;
  if (isRunLog(row)) return <RunEditor row={row} onDone={onDone} />;
  if (isXtrainLog(row)) return <XtrainEditor row={row} onDone={onDone} />;
  return null;
}

function SessionEditor({
  row,
  sessions,
  onDone,
}: {
  row: LogRow & { data: SessionLogData };
  sessions: ProgramSessions;
  onDone: () => void;
}) {
  const { save, saving, error } = useLogSave(row.id);
  const [date, setDate] = useState(row.logged_at);
  const [data, setData] = useState<SessionLogData>(() => structuredClone(row.data));

  const nameOf = (exId: string) => {
    for (const s of Object.values(sessions)) {
      const ex = s.exercises.find((e) => e.id === exId);
      if (ex) return ex.name;
    }
    return exId;
  };
  const groups = useMemo(() => {
    const g: Record<string, { n: string; key: string }[]> = {};
    for (const key of Object.keys(data.sets)) {
      const m = key.match(/^(.*)_s(\d+)$/);
      const exId = m ? m[1] : key;
      (g[exId] ??= []).push({ n: m ? m[2] : "?", key });
    }
    for (const k in g) g[k].sort((a, b) => Number(a.n) - Number(b.n));
    return g;
  }, [data.sets]);

  const setNum = (field: "kneeStart" | "kneeEnd", v: string) =>
    setData((p) => ({ ...p, [field]: Number(v) }));
  const setSetField = (key: string, field: "weight" | "reps" | "duration", v: string) =>
    setData((p) => ({ ...p, sets: { ...p.sets, [key]: { ...p.sets[key], [field]: v } } }));

  return (
    <div className="px-3.5 pb-3.5 border-t border-line pt-3 space-y-3">
      <Field label="Date">
        <input type="date" className={editInput} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Knee start">
          <input type="number" min={0} max={10} className={editInput} value={data.kneeStart} onChange={(e) => setNum("kneeStart", e.target.value)} />
        </Field>
        <Field label="Knee end">
          <input type="number" min={0} max={10} className={editInput} value={data.kneeEnd} onChange={(e) => setNum("kneeEnd", e.target.value)} />
        </Field>
      </div>
      {Object.entries(groups).map(([exId, sets]) => (
        <div key={exId} className="border-t border-line pt-2">
          <div className="text-[12px] font-semibold text-ink mb-1.5">{nameOf(exId)}</div>
          <div className="space-y-1.5">
            {sets.map(({ n, key }) => {
              const entry = data.sets[key];
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="label w-10 shrink-0">Set {Number(n) + 1}</span>
                  {entry.duration !== undefined ? (
                    <input className={`${editInput} flex-1`} placeholder="duration" value={entry.duration ?? ""} onChange={(e) => setSetField(key, "duration", e.target.value)} />
                  ) : (
                    <>
                      <input className={`${editInput} flex-1`} inputMode="decimal" placeholder="lbs" value={entry.weight ?? ""} onChange={(e) => setSetField(key, "weight", e.target.value)} />
                      <input className={`${editInput} flex-1`} inputMode="numeric" placeholder="reps" value={entry.reps ?? ""} onChange={(e) => setSetField(key, "reps", e.target.value)} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <Field label="Notes">
        <textarea className={`${inputClass} !text-[13px] min-h-[60px]`} value={data.notes} onChange={(e) => setData((p) => ({ ...p, notes: e.target.value }))} />
      </Field>
      <EditActions onSave={() => save({ ...data, date }, date, onDone)} onDone={onDone} saving={saving} error={error} />
    </div>
  );
}

function RunEditor({ row, onDone }: { row: LogRow & { data: RunLogData }; onDone: () => void }) {
  const { save, saving, error } = useLogSave(row.id);
  const [date, setDate] = useState(row.logged_at);
  const [d, setD] = useState(() => structuredClone(row.data));
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  const num = (label: string, k: keyof typeof d) => (
    <Field label={label}>
      <input className={editInput} inputMode="decimal" value={String(d[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );
  return (
    <div className="px-3.5 pb-3.5 border-t border-line pt-3 space-y-3">
      <Field label="Date">
        <input type="date" className={editInput} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {num("Distance (mi)", "run_dist")}
        {num("Time", "run_time")}
        {num("Knee after", "run_knee_end")}
        {num("Ankle after", "run_ankle")}
        {num("Next-AM knee", "run_am_knee")}
        {num("Next-AM ankle", "run_am_ankle")}
      </div>
      <Field label="Notes">
        <textarea className={`${inputClass} !text-[13px] min-h-[60px]`} value={d.run_notes} onChange={(e) => set("run_notes", e.target.value)} />
      </Field>
      <EditActions onSave={() => save({ ...d, date, run_date: date }, date, onDone)} onDone={onDone} saving={saving} error={error} />
    </div>
  );
}

function XtrainEditor({ row, onDone }: { row: LogRow & { data: XtrainLogData }; onDone: () => void }) {
  const { save, saving, error } = useLogSave(row.id);
  const [date, setDate] = useState(row.logged_at);
  const [d, setD] = useState(() => structuredClone(row.data));
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  return (
    <div className="px-3.5 pb-3.5 border-t border-line pt-3 space-y-3">
      <Field label="Date">
        <input type="date" className={editInput} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Modality">
          <input className={editInput} value={d.modality} onChange={(e) => set("modality", e.target.value)} />
        </Field>
        <Field label="Duration (min)">
          <input className={editInput} inputMode="numeric" value={d.duration} onChange={(e) => set("duration", e.target.value)} />
        </Field>
        <Field label="Intensity">
          <input className={editInput} value={d.intensity} onChange={(e) => set("intensity", e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className={`${inputClass} !text-[13px] min-h-[60px]`} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <EditActions onSave={() => save({ ...d, date }, date, onDone)} onDone={onDone} saving={saving} error={error} />
    </div>
  );
}
