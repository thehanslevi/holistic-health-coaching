"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, ApiError, clearPasscode, getPasscode, setPasscode } from "@/lib/client";
import type { LogRow, Phase, ProgramOverride } from "@/lib/types";
import { Button, inputClass } from "@/components/ui";
import TodayView from "@/components/today/TodayView";
import TrainView from "@/components/train/TrainView";
import ProgressView from "@/components/progress/ProgressView";
import CoachView from "@/components/coach/CoachView";

// ─── App context: tab routing, cross-view actions, shared logs cache ──────────

type Tab = "today" | "train" | "progress" | "coach";

type AppContextValue = {
  tab: Tab;
  setTab: (t: Tab) => void;
  // "Ask coach" from a log card: stashes a draft, jumps to Coach
  coachDraft: string | null;
  askCoach: (draft: string) => void;
  consumeCoachDraft: () => string | null;
  // Trigger for Train: jump straight into a logger from Today's quick actions
  trainIntent: TrainIntent | null;
  goTrain: (intent: TrainIntent) => void;
  consumeTrainIntent: () => TrainIntent | null;
  logs: LogRow[];
  logsLoading: boolean;
  refreshLogs: () => Promise<void>;
  addLog: (log: LogRow) => void;
  removeLog: (id: string) => void;
  // Program overrides — the living plan
  overrides: Record<string, ProgramOverride>;
  setOverride: (exerciseId: string, target: string | null, note?: string | null) => Promise<void>;
  removeOverride: (exerciseId: string) => Promise<void>;
  refreshOverrides: () => Promise<void>;
  // Active training phase (program-as-data)
  activePhase: Phase | null;
  refreshPhase: () => Promise<void>;
  lock: () => void;
};

export type TrainIntent =
  | { type: "session"; sessionKey: string; date?: string }
  | { type: "run"; date?: string }
  | { type: "xtrain"; date?: string };

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppShell");
  return ctx;
}

// ─── Passcode gate ────────────────────────────────────────────────────────────

function PasscodeGate({ onUnlock }: { onUnlock: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    if (!code.trim() || checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/checkins?probe=1", {
        headers: { Authorization: `Bearer ${code.trim()}` },
      });
      if (res.status === 401) {
        setError("Wrong passcode.");
        return;
      }
      if (!res.ok) {
        setError(`Server error (${res.status}). Check the setup.`);
        return;
      }
      onUnlock(code.trim());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="w-full max-w-xs text-center fade-up">
        <div className="display-i text-5xl text-ink">HRL</div>
        <div className="label mt-2 mb-8">Train · Recover · Coach</div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Passcode"
          className={`${inputClass} text-center num text-lg tracking-[0.3em]`}
        />
        {error && <div className="text-xs text-stop mt-3">{error}</div>}
        <Button size="lg" className="mt-4" onClick={submit} disabled={checking || !code.trim()}>
          {checking ? "Checking…" : "Unlock"}
        </Button>
      </div>
    </div>
  );
}

// ─── Bottom navigation ────────────────────────────────────────────────────────

const NAV: { tab: Tab; label: string }[] = [
  { tab: "today", label: "Today" },
  { tab: "train", label: "Train" },
  { tab: "progress", label: "Progress" },
  { tab: "coach", label: "Coach" },
];

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[520px] mx-auto flex">
        {NAV.map((item) => (
          <button
            key={item.tab}
            onClick={() => setTab(item.tab)}
            className={`display flex-1 py-3.5 text-[13px] tracking-[0.12em] cursor-pointer transition-colors border-t-2 ${
              tab === item.tab
                ? "text-accent border-accent"
                : "text-faint border-transparent hover:text-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AppShell() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null); // null = not hydrated yet
  const [tab, setTab] = useState<Tab>("today");
  const [coachDraft, setCoachDraft] = useState<string | null>(null);
  const [trainIntent, setTrainIntent] = useState<TrainIntent | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, ProgramOverride>>({});
  const [activePhase, setActivePhase] = useState<Phase | null>(null);

  useEffect(() => {
    setUnlocked(!!getPasscode());
  }, []);

  const refreshLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const rows = await api<LogRow[]>("/api/logs");
      setLogs(rows);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearPasscode();
        setUnlocked(false);
      }
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const refreshOverrides = useCallback(async () => {
    try {
      const rows = await api<ProgramOverride[]>("/api/program");
      setOverrides(Object.fromEntries(rows.map((o) => [o.exercise_id, o])));
    } catch {
      /* overrides are optional; ignore */
    }
  }, []);

  const refreshPhase = useCallback(async () => {
    try {
      const { active } = await api<{ active: Phase | null }>("/api/phases");
      setActivePhase(active);
    } catch {
      /* phase is optional; Today/Train fall back to program.ts constants */
    }
  }, []);

  useEffect(() => {
    if (unlocked) {
      refreshLogs();
      refreshOverrides();
      refreshPhase();
    }
  }, [unlocked, refreshLogs, refreshOverrides, refreshPhase]);

  const value = useMemo<AppContextValue>(
    () => ({
      tab,
      setTab,
      coachDraft,
      askCoach: (draft) => {
        setCoachDraft(draft);
        setTab("coach");
      },
      consumeCoachDraft: () => {
        const d = coachDraft;
        setCoachDraft(null);
        return d;
      },
      trainIntent,
      goTrain: (intent) => {
        setTrainIntent(intent);
        setTab("train");
      },
      consumeTrainIntent: () => {
        const i = trainIntent;
        setTrainIntent(null);
        return i;
      },
      logs,
      logsLoading,
      refreshLogs,
      addLog: (log) => setLogs((prev) => [log, ...prev]),
      removeLog: (id) => setLogs((prev) => prev.filter((l) => l.id !== id)),
      overrides,
      setOverride: async (exerciseId, target, note) => {
        const saved = await api<ProgramOverride>("/api/program", {
          method: "POST",
          body: JSON.stringify({ exercise_id: exerciseId, target, note }),
        });
        setOverrides((prev) => ({ ...prev, [exerciseId]: saved }));
      },
      removeOverride: async (exerciseId) => {
        await api(`/api/program/${exerciseId}`, { method: "DELETE" });
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[exerciseId];
          return next;
        });
      },
      refreshOverrides,
      activePhase,
      refreshPhase,
      lock: () => {
        clearPasscode();
        setUnlocked(false);
      },
    }),
    [tab, coachDraft, trainIntent, logs, logsLoading, refreshLogs, refreshOverrides, overrides, activePhase, refreshPhase],
  );

  if (unlocked === null) return null;

  if (!unlocked) {
    return (
      <PasscodeGate
        onUnlock={(code) => {
          setPasscode(code);
          setUnlocked(true);
        }}
      />
    );
  }

  return (
    <AppContext.Provider value={value}>
      <div className="max-w-[520px] mx-auto min-h-dvh pb-20">
        <div className={tab === "today" ? "" : "hidden"}>
          <TodayView />
        </div>
        <div className={tab === "train" ? "" : "hidden"}>
          <TrainView />
        </div>
        <div className={tab === "progress" ? "" : "hidden"}>
          <ProgressView />
        </div>
        <div className={tab === "coach" ? "" : "hidden"}>
          <CoachView />
        </div>
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </AppContext.Provider>
  );
}
