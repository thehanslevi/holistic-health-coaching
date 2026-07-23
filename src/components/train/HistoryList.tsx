"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import { lastSessionLog, sessionVolume } from "@/lib/analytics";
import { formatLogAsText } from "@/lib/format";
import { SESSIONS, runTraffic, type SessionKey } from "@/lib/program";
import {
  isRunLog,
  isSessionLog,
  isXtrainLog,
  type LogRow,
  type SessionLogData,
  type RunLogData,
  type XtrainLogData,
} from "@/lib/types";
import { Button, Card, Chip, Delta, Dots, EmptyState, TrafficLight, inputClass } from "@/components/ui";
import type { ProgramSessions } from "@/lib/program-resolve";
import { useApp } from "@/components/AppShell";

const V1_STORAGE_KEY = "hrl_workout_logs_v2";

function painTone(v: number): "go" | "hold" | "stop" {
  return v <= 0 ? "go" : v <= 2 ? "hold" : "stop";
}

// ─── Editing a past log ───────────────────────────────────────────────────────
// A focused inline editor: fix a date, a weight, a distance, without re-logging
// the whole thing. Saves through PATCH /api/logs/[id] and updates the cache.

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

function LogEditor({
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

function LogCard({ row }: { row: LogRow }) {
  const { askCoach, removeLog, logs, sessions } = useApp();

  // Volume delta vs the previous session of the same kind
  const volDelta = (() => {
    if (!isSessionLog(row)) return null;
    const vol = sessionVolume(row.data);
    if (!vol) return null;
    const older = logs.filter(
      (l) => l.created_at < row.created_at || (l.created_at === row.created_at && l.id !== row.id),
    );
    const prevSession = lastSessionLog(older, row.data.sessionKey);
    const prevVol = prevSession ? sessionVolume(prevSession.data) : 0;
    return { vol, deltaPct: prevVol ? Math.round(((vol - prevVol) / prevVol) * 100) : 0 };
  })();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const headline = isSessionLog(row)
    ? (SESSIONS[row.data.sessionKey as SessionKey]?.label ?? row.data.sessionKey)
    : isRunLog(row)
      ? `Run · ${row.data.run_dist || "?"} mi`
      : isXtrainLog(row)
        ? row.data.modality
        : row.kind;

  const copy = () => {
    navigator.clipboard?.writeText(formatLogAsText(row)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const del = async () => {
    setDeleting(true);
    try {
      await api(`/api/logs/${row.id}`, { method: "DELETE" });
      removeLog(row.id);
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Card className="mb-2 overflow-hidden">
      <div
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between gap-2 p-3.5 cursor-pointer"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink truncate">{headline}</div>
          <div className="text-[11px] text-muted num mt-0.5">{row.logged_at}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {volDelta && volDelta.deltaPct !== 0 && <Delta value={volDelta.deltaPct} unit="%" />}
          {isSessionLog(row) && (
            <Chip tone={painTone(row.data.kneeEnd)}>
              knee {row.data.kneeStart}→{row.data.kneeEnd}
            </Chip>
          )}
          {isRunLog(row) && (
            <TrafficLight
              light={runTraffic(row.data.run_am_knee, row.data.run_am_ankle).light}
            />
          )}
          {isXtrainLog(row) && row.data.duration && (
            <Chip>{row.data.duration} min</Chip>
          )}
          <span className="text-faint text-xs">{expanded ? "▴" : "▾"}</span>
        </div>
      </div>

      {expanded && !editing && (
        <div className="px-3.5 pb-3.5 border-t border-line pt-3">
          <pre className="text-[11px] leading-relaxed text-muted whitespace-pre-wrap num mb-3">
            {formatLogAsText(row)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="secondary" onClick={copy}>
              {copied ? "Copied ✓" : "Copy"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                askCoach(
                  `Looking at this log:\n\n${formatLogAsText(row)}\n\nWhat do you see?`,
                )
              }
            >
              Ask coach
            </Button>
            <div className="flex-1" />
            {confirmDelete ? (
              <Button size="sm" variant="danger" onClick={del} disabled={deleting}>
                {deleting ? "…" : "Really delete?"}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

      {expanded && editing && (
        <LogEditor row={row} sessions={sessions} onDone={() => setEditing(false)} />
      )}
    </Card>
  );
}

function ImportBanner() {
  const { refreshLogs } = useApp();
  const [v1Count, setV1Count] = useState(0);
  const [state, setState] = useState<"idle" | "importing" | "done" | "error">("idle");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(V1_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) setV1Count(parsed.length);
      }
    } catch {
      /* unreadable v1 data — ignore */
    }
  }, []);

  if (!v1Count || state === "done") return null;

  const runImport = async () => {
    setState("importing");
    try {
      const raw = localStorage.getItem(V1_STORAGE_KEY);
      const logs = raw ? JSON.parse(raw) : [];
      await api("/api/logs/import", { method: "POST", body: JSON.stringify({ logs }) });
      localStorage.removeItem(V1_STORAGE_KEY);
      await refreshLogs();
      setState("done");
    } catch {
      setState("error");
    }
  };

  return (
    <Card className="p-3.5 mb-3 border-accent/30">
      <div className="text-[13px] font-semibold text-accent mb-1">
        {v1Count} logs from the old tracker found on this device
      </div>
      <div className="text-xs text-muted mb-3">
        Import them once and they live in the cloud with everything else.
      </div>
      {state === "error" && (
        <div className="text-xs text-stop mb-2">Import failed — is Supabase configured?</div>
      )}
      <Button size="sm" onClick={runImport} disabled={state === "importing"}>
        {state === "importing" ? "Importing…" : "Import now"}
      </Button>
    </Card>
  );
}

export default function HistoryList() {
  const { logs, logsLoading } = useApp();
  return (
    <div>
      <ImportBanner />
      {logsLoading ? (
        <div className="py-10 text-center">
          <Dots />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState title="No sessions logged yet" hint="Your history builds here as you train." />
      ) : (
        logs.map((row) => <LogCard key={row.id} row={row} />)
      )}
    </div>
  );
}
