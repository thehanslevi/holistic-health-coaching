"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { SESSIONS, WEEKLY_SCHEDULE, runTraffic, type SessionKey } from "@/lib/program";
import {
  isRunLog,
  isSessionLog,
  isXtrainLog,
  type Checkin,
  type LogRow,
} from "@/lib/types";
import { Button, TrafficLight, type Light } from "@/components/ui";
import { useApp } from "@/components/AppShell";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(s + "T12:00:00");
const todayStr = fmt(new Date());

type DayMark = { session: boolean; run: Light | null; xtrain: boolean };

export default function CalendarOverlay({ onClose }: { onClose: () => void }) {
  const { logs, goTrain } = useApp();
  const now = new Date();
  const [viewY, setViewY] = useState(now.getFullYear());
  const [viewM, setViewM] = useState(now.getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [checkins, setCheckins] = useState<Record<string, Checkin>>({});

  useEffect(() => {
    api<Checkin[]>("/api/checkins")
      .then((rows) => {
        const map: Record<string, Checkin> = {};
        for (const c of rows) map[c.date] = c;
        setCheckins(map);
      })
      .catch(() => {});
  }, []);

  // Markers per date from the shared logs cache
  const marks = useMemo(() => {
    const m: Record<string, DayMark> = {};
    for (const row of logs) {
      const d = row.logged_at;
      const cur = m[d] ?? { session: false, run: null, xtrain: false };
      if (isSessionLog(row)) cur.session = true;
      else if (isRunLog(row)) cur.run = runTraffic(row.data.run_am_knee, row.data.run_am_ankle).light;
      else if (isXtrainLog(row)) cur.xtrain = true;
      m[d] = cur;
    }
    return m;
  }, [logs]);

  const dotColor = (l: Light) =>
    l === "green" ? "bg-go" : l === "yellow" ? "bg-hold" : "bg-stop";

  // ── Month grid ──
  const first = new Date(viewY, viewM, 1);
  const startWd = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startWd).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shiftMonth = (dir: 1 | -1) => {
    const d = new Date(viewY, viewM + dir, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  };

  const backAction = (
    <button
      onClick={onClose}
      aria-label="Close calendar"
      className="w-9 h-9 border border-line-strong text-muted hover:text-accent hover:border-accent flex items-center justify-center cursor-pointer shrink-0"
    >
      ✕
    </button>
  );

  const openLogger = (intent: Parameters<typeof goTrain>[0]) => {
    goTrain(intent);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg overflow-y-auto">
      <div className="max-w-[520px] mx-auto px-5 pb-12">
        {selected === null ? (
          <>
            <div className="flex items-center gap-3 pt-6 pb-4">
              {backAction}
              <h1 className="display text-[22px] text-ink flex-1">Calendar</h1>
            </div>

            {/* Month switcher */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="display text-[20px] text-muted hover:text-accent px-3 py-1 cursor-pointer"
              >
                ‹
              </button>
              <div className="display text-[18px] text-ink tracking-[0.04em]">
                {MONTHS[viewM]} {viewY}
              </div>
              <button
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="display text-[20px] text-muted hover:text-accent px-3 py-1 cursor-pointer"
              >
                ›
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 mb-1">
              {DOW.map((d, i) => (
                <div key={i} className="label !text-[9px] text-center py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-px bg-line border border-line">
              {cells.map((day, i) => {
                if (day === null) return <div key={i} className="bg-surface aspect-square" />;
                const ds = `${viewY}-${String(viewM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const mark = marks[ds];
                const isToday = ds === todayStr;
                const chk = checkins[ds];
                return (
                  <button
                    key={i}
                    onClick={() => setSelected(ds)}
                    className={`bg-surface aspect-square flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-surface-2 transition-colors ${
                      isToday ? "ring-1 ring-inset ring-accent" : ""
                    }`}
                  >
                    <span
                      className={`num text-[13px] ${isToday ? "text-accent" : "text-muted"}`}
                    >
                      {day}
                    </span>
                    <span className="flex gap-0.5 h-1.5 items-center">
                      {mark?.session && <span className="w-1.5 h-1.5 bg-accent" />}
                      {mark?.run && <span className={`w-1.5 h-1.5 ${dotColor(mark.run)}`} />}
                      {mark?.xtrain && <span className="w-1.5 h-1.5 bg-line-strong" />}
                      {!mark && chk && (
                        <span className={`w-1.5 h-1.5 ${dotColor(chk.readiness)} opacity-40`} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-3 flex-wrap">
              <span className="flex items-center gap-1.5 label !text-[9px]">
                <span className="w-1.5 h-1.5 bg-accent" /> Session
              </span>
              <span className="flex items-center gap-1.5 label !text-[9px]">
                <span className="w-1.5 h-1.5 bg-go" /> Run
              </span>
              <span className="flex items-center gap-1.5 label !text-[9px]">
                <span className="w-1.5 h-1.5 bg-line-strong" /> Cross
              </span>
            </div>
          </>
        ) : (
          <DayDetail
            date={selected}
            logs={logs}
            checkin={checkins[selected] ?? null}
            onBack={() => setSelected(null)}
            onClose={onClose}
            onShiftDay={(dir) => {
              const d = parse(selected);
              d.setDate(d.getDate() + dir);
              setSelected(fmt(d));
            }}
            onLog={openLogger}
          />
        )}
      </div>
    </div>
  );
}

function DayDetail({
  date,
  logs,
  checkin,
  onBack,
  onClose,
  onShiftDay,
  onLog,
}: {
  date: string;
  logs: LogRow[];
  checkin: Checkin | null;
  onBack: () => void;
  onClose: () => void;
  onShiftDay: (dir: 1 | -1) => void;
  onLog: (intent: { type: "session"; sessionKey: string; date: string } | { type: "run"; date: string } | { type: "xtrain"; date: string }) => void;
}) {
  const d = parse(date);
  const weekday = (d.getDay() + 6) % 7;
  const schedule = WEEKLY_SCHEDULE[weekday];
  const dayLogs = logs.filter((l) => l.logged_at === date);
  const isToday = date === todayStr;

  const headline = (row: LogRow): { title: string; sub: string; light?: Light } => {
    if (isSessionLog(row)) {
      const s = SESSIONS[row.data.sessionKey as SessionKey];
      return {
        title: s?.label ?? row.data.sessionKey,
        sub: `knee ${row.data.kneeStart}→${row.data.kneeEnd}`,
      };
    }
    if (isRunLog(row)) {
      const t = runTraffic(row.data.run_am_knee, row.data.run_am_ankle);
      return { title: `Run · ${row.data.run_dist || "?"} mi`, sub: row.data.run_time || "", light: t.light };
    }
    if (isXtrainLog(row))
      return { title: row.data.modality, sub: row.data.duration ? `${row.data.duration} min` : "" };
    return { title: row.kind, sub: "" };
  };

  return (
    <>
      <div className="flex items-center gap-3 pt-6 pb-4">
        <button
          onClick={onBack}
          aria-label="Back to month"
          className="w-9 h-9 border border-line-strong text-muted hover:text-accent hover:border-accent flex items-center justify-center cursor-pointer shrink-0"
        >
          ←
        </button>
        <div className="flex-1 flex items-center justify-center gap-4">
          <button
            onClick={() => onShiftDay(-1)}
            aria-label="Previous day"
            className="display text-[20px] text-muted hover:text-accent cursor-pointer"
          >
            ‹
          </button>
          <div className="text-center">
            <div className="display text-[18px] text-ink">
              {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}
            </div>
            {isToday && <div className="label !text-accent !text-[9px]">Today</div>}
          </div>
          <button
            onClick={() => onShiftDay(1)}
            aria-label="Next day"
            className="display text-[20px] text-muted hover:text-accent cursor-pointer"
          >
            ›
          </button>
        </div>
        <div className="w-9 shrink-0" />
      </div>

      {/* Scheduled */}
      <div className="border border-line p-3.5 mb-3">
        <div className="label mb-1.5">Scheduled · {schedule.day}</div>
        <div className="flex items-center gap-2.5">
          {schedule.sessionKey && (
            <span className="display bg-accent text-accent-ink text-[13px] tracking-[0.06em] px-2 py-0.5">
              {schedule.sessionKey}
            </span>
          )}
          <span className="text-[14px] text-ink font-semibold">{schedule.label}</span>
        </div>
        {checkin && (
          <div className="mt-2.5">
            <TrafficLight light={checkin.readiness} label={`readiness ${checkin.readiness}`} />
          </div>
        )}
      </div>

      {/* Logged */}
      <div className="label mb-2">Logged · {dayLogs.length}</div>
      {dayLogs.length === 0 ? (
        <div className="text-xs text-faint border border-dashed border-line p-4 text-center mb-4">
          Nothing logged this day.
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {dayLogs.map((row) => {
            const h = headline(row);
            return (
              <div
                key={row.id}
                className="border border-line p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">{h.title}</div>
                  {h.sub && <div className="text-[11px] text-muted num mt-0.5">{h.sub}</div>}
                </div>
                {h.light && <TrafficLight light={h.light} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Backfill actions */}
      <div className="label mb-2">{isToday ? "Log" : "Log for this day"}</div>
      <div className="space-y-2">
        {schedule.sessionKey && (
          <Button
            size="md"
            className="w-full"
            onClick={() => onLog({ type: "session", sessionKey: schedule.sessionKey!, date })}
          >
            Start {schedule.sessionKey} session →
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="md" onClick={() => onLog({ type: "run", date })}>
            Log run
          </Button>
          <Button variant="secondary" size="md" onClick={() => onLog({ type: "xtrain", date })}>
            Log cross
          </Button>
        </div>
      </div>

      <button
        onClick={onClose}
        className="label mt-6 hover:text-muted cursor-pointer block mx-auto"
      >
        Close calendar
      </button>
    </>
  );
}
