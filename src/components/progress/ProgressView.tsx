"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import {
  loggedExercises,
  progression,
  runSeries,
  weeklyVolume,
  xtrainMinutes,
} from "@/lib/analytics";
import { computeInsights } from "@/lib/insights";
import type { HealthRow } from "@/lib/types";
import { Button, Card, Dots, EmptyState, SectionLabel, inputClass } from "@/components/ui";
import { BarChart, LineChart } from "@/components/progress/charts";
import { useApp } from "@/components/AppShell";
import ShareWeek from "@/components/ShareWeek";

function WeekReview() {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = (refresh = false) => {
    setLoading(true);
    api<{ content: string }>(`/api/review${refresh ? "?refresh=1" : ""}`)
      .then((r) => setContent(r.content))
      .catch(() => setContent(null))
      .finally(() => setLoading(false));
  };

  return (
    <div className="border-l-[3px] border-accent pl-3.5 py-1 mb-5">
      <div className="flex items-center justify-between">
        <div className="label">Coach · week in review</div>
        {content && !loading && (
          <button onClick={() => load(true)} className="label !text-[9px] hover:text-muted cursor-pointer">
            refresh
          </button>
        )}
      </div>
      {loading ? (
        <div className="mt-2"><Dots /></div>
      ) : content ? (
        <div className="text-[14px] leading-relaxed text-muted mt-1.5 whitespace-pre-wrap">{content}</div>
      ) : (
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => load()}>
          Read this week's review
        </Button>
      )}
    </div>
  );
}

export default function ProgressView() {
  const { logs } = useApp();

  const [health, setHealth] = useState<HealthRow[]>([]);
  useEffect(() => {
    api<HealthRow[]>("/api/health").then(setHealth).catch(() => {});
  }, []);
  const insights = useMemo(() => computeInsights(logs, health), [logs, health]);

  const exercises = useMemo(() => loggedExercises(logs), [logs]);
  const [exerciseId, setExerciseId] = useState<string>("");
  const activeExercise = exerciseId || exercises[0]?.id || "";

  const lift = useMemo(
    () => (activeExercise ? progression(logs, activeExercise) : []),
    [logs, activeExercise],
  );
  const volume = useMemo(() => weeklyVolume(logs), [logs]);
  const runs = useMemo(() => runSeries(logs), [logs]);
  const xtrain = useMemo(() => xtrainMinutes(logs), [logs]);

  const nothingYet =
    !exercises.length && !volume.length && !runs.length && !xtrain.length;

  return (
    <div className="px-4 pb-6 fade-up">
      <div className="py-5">
        <h1 className="display-i text-[40px] text-ink">Progress</h1>
        <div className="text-xs text-muted mt-0.5">
          Derived from everything you log — no extra tracking.
        </div>
      </div>

      {insights.length > 0 && (
        <div className="mb-5">
          <SectionLabel>What your data is saying</SectionLabel>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div
                key={i}
                className={`border-l-[3px] pl-3.5 py-1.5 ${
                  ins.tone === "watch"
                    ? "border-hold"
                    : ins.tone === "good"
                      ? "border-go"
                      : "border-accent"
                }`}
              >
                <div className="display text-[13px] tracking-[0.04em] text-ink">{ins.title}</div>
                <div className="text-[12.5px] text-muted mt-1 leading-snug">{ins.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!nothingYet && <WeekReview />}

      {!nothingYet && (
        <div className="mb-5">
          <ShareWeek />
        </div>
      )}

      {nothingYet ? (
        <EmptyState
          title="Nothing to chart yet"
          hint="Log a session or two and this view comes alive."
        />
      ) : (
        <div className="space-y-3">
          {/* Lift progression */}
          <Card className="p-3.5">
            <SectionLabel>Lift progression — top set</SectionLabel>
            {exercises.length ? (
              <>
                <select
                  value={activeExercise}
                  onChange={(e) => setExerciseId(e.target.value)}
                  className={`${inputClass} mb-3`}
                >
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
                {lift.length ? (
                  <LineChart
                    unit="lbs"
                    series={[
                      {
                        label: "Top set",
                        color: "var(--accent)",
                        points: lift.map((p) => ({ x: p.date, y: p.value })),
                      },
                    ]}
                  />
                ) : (
                  <div className="text-xs text-faint py-4">No weighted sets for this lift yet.</div>
                )}
              </>
            ) : (
              <div className="text-xs text-faint py-4">
                Log weights on a strength session to unlock this chart.
              </div>
            )}
          </Card>

          {/* Weekly volume */}
          <Card className="p-3.5">
            <SectionLabel>Weekly volume</SectionLabel>
            {volume.length ? (
              <BarChart
                unit="lbs lifted per week (reps × weight)"
                data={volume.map((p) => ({ x: p.week, y: p.value }))}
              />
            ) : (
              <div className="text-xs text-faint py-4">No volume data yet.</div>
            )}
          </Card>

          {/* Joint response vs run load */}
          <Card className="p-3.5">
            <SectionLabel>Next-AM joint response · runs</SectionLabel>
            {runs.length ? (
              <LineChart
                yMin={0}
                series={[
                  {
                    label: "Left knee (0–10)",
                    color: "var(--red)",
                    points: runs.map((r) => ({ x: r.date, y: r.amKnee })),
                  },
                  {
                    label: "Right ankle (0–10)",
                    color: "var(--yellow)",
                    points: runs.map((r) => ({ x: r.date, y: r.amAnkle })),
                  },
                  {
                    label: "Distance (mi)",
                    color: "var(--green)",
                    points: runs.map((r) => ({ x: r.date, y: r.dist })),
                  },
                ]}
              />
            ) : (
              <div className="text-xs text-faint py-4">
                Log runs (with next-AM scores) to see the traffic-light trend.
              </div>
            )}
          </Card>

          {/* Cross-training */}
          <Card className="p-3.5">
            <SectionLabel>Cross-training minutes</SectionLabel>
            {xtrain.length ? (
              <BarChart
                unit="minutes per week"
                data={xtrain.map((p) => ({ x: p.week, y: p.value }))}
              />
            ) : (
              <div className="text-xs text-faint py-4">Zone 2, swims, and walks land here.</div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
