"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { lastSessionLog, sessionVolume } from "@/lib/analytics";
import { formatLogAsText } from "@/lib/format";
import { SESSIONS, runTraffic, type SessionKey } from "@/lib/program";
import { isRunLog, isSessionLog, isXtrainLog, type LogRow } from "@/lib/types";
import { Button, Card, Chip, Delta, Dots, EmptyState, TrafficLight } from "@/components/ui";
import { useApp } from "@/components/AppShell";

const V1_STORAGE_KEY = "hrl_workout_logs_v2";

function painTone(v: number): "go" | "hold" | "stop" {
  return v <= 0 ? "go" : v <= 2 ? "hold" : "stop";
}

function LogCard({ row }: { row: LogRow }) {
  const { askCoach, removeLog, logs } = useApp();

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

      {expanded && (
        <div className="px-3.5 pb-3.5 border-t border-line pt-3">
          <pre className="text-[11px] leading-relaxed text-muted whitespace-pre-wrap num mb-3">
            {formatLogAsText(row)}
          </pre>
          <div className="flex gap-2">
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
