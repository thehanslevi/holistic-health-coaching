"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { formatLogAsText } from "@/lib/format";
import { XTRAIN_MODALITIES, todayISO } from "@/lib/program";
import type { LogRow, XtrainLogData } from "@/lib/types";
import { Button, Field, ScreenHeader, inputClass } from "@/components/ui";
import SavedSummary from "@/components/train/SavedSummary";
import { useApp } from "@/components/AppShell";

export default function XtrainLogger({
  initialDate,
  onClose,
}: {
  initialDate?: string;
  onClose: () => void;
}) {
  const { addLog, askCoach } = useApp();
  const [data, setData] = useState<XtrainLogData>({
    type: "xtrain",
    modality: XTRAIN_MODALITIES[0],
    date: initialDate ?? todayISO(),
    duration: "",
    intensity: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRow, setSavedRow] = useState<LogRow | null>(null);

  const set = <K extends keyof XtrainLogData>(k: K, v: XtrainLogData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const row = await api<LogRow>("/api/logs", {
        method: "POST",
        body: JSON.stringify({ logged_at: data.date, kind: "xtrain", data }),
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
    return (
      <div className="px-4">
        <ScreenHeader title="Cross-training saved" onBack={onClose} />
        <SavedSummary
          title={`${data.modality} logged`}
          text={formatLogAsText(savedRow)}
          onDone={onClose}
          onAskCoach={(text) => askCoach(`Just logged this:\n\n${text}`)}
        />
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 fade-up">
      <ScreenHeader
        title="Cross-training"
        subtitle="Zone 2, swim, sauna, dance, yoga, walks"
        onBack={onClose}
      />
      <Field label="Activity" className="mb-3">
        <select
          value={data.modality}
          onChange={(e) => set("modality", e.target.value)}
          className={inputClass}
        >
          {XTRAIN_MODALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date" className="mb-3">
        <input type="date" value={data.date} onChange={(e) => set("date", e.target.value)}
          className={`${inputClass} num`} />
      </Field>
      <Field label="Duration (min)" className="mb-3">
        <input type="number" inputMode="decimal" step="any" placeholder="e.g. 30" value={data.duration}
          onChange={(e) => set("duration", e.target.value)} className={`${inputClass} num`} />
      </Field>
      <Field label="Intensity / how it felt (optional)" className="mb-3">
        <input type="text" placeholder="easy, moderate, restorative..." value={data.intensity}
          onChange={(e) => set("intensity", e.target.value)} className={inputClass} />
      </Field>
      <Field label="Notes (optional)" className="mb-4">
        <textarea rows={3} placeholder="anything worth remembering" value={data.notes}
          onChange={(e) => set("notes", e.target.value)} className={`${inputClass} resize-y`} />
      </Field>
      {error && <div className="text-xs text-stop mb-3">{error}</div>}
      <Button size="lg" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
