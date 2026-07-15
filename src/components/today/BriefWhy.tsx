"use client";

import { useState } from "react";

// "Why did it say that?"
//
// She got a brief claiming her HRV had "dropped hard overnight" when it hadn't.
// Working out why took raw SQL across three tables, cross-referenced against the
// numbers the coach happened to quote — because nothing recorded what it saw.
// She asked the right question: how do I debug this?
//
// This is the answer. A coach that can't show its work has to be taken on faith,
// and faith is exactly what she's trying to stop extending to this thing. When
// it's right, this is dead weight nobody opens. When it's wrong, it's the
// difference between "the app is broken" and "it read Tuesday's numbers".

export type BriefInputs = {
  generated_at: string;
  model: string;
  context: string;
  lookups: { name: string; input: unknown }[];
};

// The tool names are internal; say what it actually did.
const READS: Record<string, string> = {
  query_logs: "read your training logs",
  get_exercise_progression: "pulled a lift's full history",
  get_run_history: "checked your runs and how your joints answered",
  get_health_series: "checked a health metric against your own baseline",
  get_program: "checked your program",
  record_decision: "wrote down a decision to follow up on",
  close_decision: "closed out an earlier decision",
  get_decision_history: "reviewed what it's decided before",
};

function describe(l: { name: string; input: unknown }): string {
  const base = READS[l.name] ?? l.name;
  const arg = (l.input ?? {}) as Record<string, unknown>;
  const detail =
    typeof arg.metric === "string"
      ? arg.metric
      : typeof arg.exercise_id === "string"
        ? arg.exercise_id
        : typeof arg.session_key === "string"
          ? arg.session_key
          : typeof arg.kind === "string"
            ? arg.kind
            : null;
  return detail ? `${base} · ${detail}` : base;
}

export default function BriefWhy({ inputs }: { inputs: BriefInputs | null }) {
  const [open, setOpen] = useState(false);
  if (!inputs) return null;

  const when = new Date(inputs.generated_at);
  const stamp = when.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="label !text-[9px] !text-faint hover:!text-muted cursor-pointer"
      >
        {open ? "hide why" : "why did it say that?"}
      </button>

      {open && (
        <div className="mt-2 border border-line bg-surface p-3 space-y-3">
          <div>
            <div className="label !text-[9px] mb-1">Written</div>
            {/* The stale-brief bug was invisible precisely because nobody could
                see that "this morning's" brief was written last night. */}
            <div className="text-[11px] text-muted num">
              {stamp} · {inputs.model}
            </div>
          </div>

          <div>
            <div className="label !text-[9px] mb-1">What it looked up</div>
            {inputs.lookups.length ? (
              <ul className="space-y-0.5">
                {inputs.lookups.map((l, i) => (
                  <li key={i} className="text-[11px] text-muted leading-snug">
                    · {describe(l)}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[11px] text-faint">
                Nothing — it wrote this from the summary alone.
              </div>
            )}
          </div>

          <div>
            <div className="label !text-[9px] mb-1">What it was told</div>
            <pre className="text-[10px] text-faint leading-snug whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
              {inputs.context}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
