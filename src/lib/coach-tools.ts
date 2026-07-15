import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { daysAgoISO } from "@/lib/day";
import { formatLogAsText } from "@/lib/format";
import { SESSIONS, SESSION_ORDER, WEEKLY_SCHEDULE, runTraffic, type SessionKey } from "@/lib/program";
import { catalogOf, findExerciseIn } from "@/lib/program-resolve";
import { applyProgramEdit, getResolvedProgram } from "@/lib/program-server";
import { supabase } from "@/lib/supabase";
import { isRunLog, isSessionLog, type LogRow } from "@/lib/types";

// The coach's hands.
//
// Everything here answers a question the coach ASKED, rather than being pushed
// at it up front. That is the whole point: a fixed 14-day digest can only
// support questions someone anticipated, so the coach ends up reciting the
// digest. With these, it can go look — arbitrary windows, full history, real
// baselines — and reason about what it finds.
//
// Nothing here returns a conclusion. Tools return observations and arithmetic;
// judgment is the model's job. That division is deliberate — a stored
// conclusion ("ankle improving") is stale the moment it's written, while a
// series re-derived on demand never is.

const MAX_TOOL_CHARS = 12000;

function truncate(text: string, label: string): string {
  if (text.length <= MAX_TOOL_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_CHARS)}\n\n[…${label} truncated. Narrow the window or add a filter to see more.]`;
}

const median = (ns: number[]): number => {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const mean = (ns: number[]): number =>
  ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;

// Dates resolve in the athlete's timezone, not the server's — see lib/day.ts.

// Cosmetic, sync, base-template only — used for the "Pulling your X history…"
// status line. A coach-added exercise simply misses and falls back to generic
// wording, which is fine for a label but never acceptable for tool logic. Tool
// logic always goes through getResolvedProgram().
function baseExerciseName(exerciseId: string): string | null {
  for (const sk of SESSION_ORDER) {
    const ex = SESSIONS[sk].exercises.find((e) => e.id === exerciseId);
    if (ex) return ex.name;
  }
  return null;
}

// ─── query_logs ───────────────────────────────────────────────────────────────

const queryLogs = betaTool({
  name: "query_logs",
  description:
    "Read her actual training logs over any window you choose — not just the recent past. Call this whenever the answer depends on what she actually did: how a session went, whether she trained this week, what she noted at the time, how a block of training unfolded. Returns full log detail including per-set reps and weights, pain ratings, and her own notes. Prefer a narrow window plus a filter over a broad sweep.",
  inputSchema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["session", "run", "xtrain"],
        description:
          "Filter by log type: 'session' = a strength workout, 'run' = a run, 'xtrain' = cross-training (bike, swim, yoga, walk). Omit for all types.",
      },
      from: {
        type: "string",
        description: "Start date, inclusive, as YYYY-MM-DD. Omit for no lower bound.",
      },
      to: {
        type: "string",
        description: "End date, inclusive, as YYYY-MM-DD. Omit for no upper bound.",
      },
      session_key: {
        type: "string",
        enum: ["L1", "U1", "L2", "U2", "C1", "G1"],
        description:
          "Only return strength sessions of this type. L1 = Lower Strength, U1 = Upper Strength, L2 = Lower Hypertrophy, U2 = Upper Hypertrophy, C1 = Core + Stability, G1 = optional Glute Focus.",
      },
      limit: {
        type: "integer",
        description: "Maximum logs to return, newest first. Defaults to 20.",
      },
    },
    additionalProperties: false,
  },
  run: async (args) => {
    const db = supabase();
    let q = db
      .from("hrl_logs")
      .select("*")
      .order("logged_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(args.limit ?? 20, 60));

    if (args.kind) q = q.eq("kind", args.kind);
    if (args.from) q = q.gte("logged_at", args.from);
    if (args.to) q = q.lte("logged_at", args.to);
    if (args.session_key) q = q.eq("session_key", args.session_key);

    const { data, error } = await q;
    if (error) return `Error reading logs: ${error.message}`;

    const rows = (data ?? []) as LogRow[];
    if (!rows.length) return "No logs match that query.";

    const body = rows.map((r) => formatLogAsText(r)).join("\n\n");
    return truncate(`${rows.length} log(s), newest first:\n\n${body}`, "logs");
  },
});

// ─── get_exercise_progression ─────────────────────────────────────────────────

const getExerciseProgression = betaTool({
  name: "get_exercise_progression",
  description:
    "Get the full logged history of one lift — every session, every set, all the way back — alongside its prescribed target and any current override. Call this before making a progression call (add weight, hold, back off) so you are reading the real curve rather than the last two data points. If the exercise_id is wrong you get the valid list back.",
  inputSchema: {
    type: "object",
    properties: {
      exercise_id: {
        type: "string",
        description:
          "The program's exercise id, e.g. 'l1_leg_press', 'u1_bench', 'u1_pullup', 'l1_rdl'. Call get_program if you need to look one up.",
      },
    },
    required: ["exercise_id"],
    additionalProperties: false,
  },
  run: async ({ exercise_id }) => {
    const program = await getResolvedProgram();
    const found = findExerciseIn(program, exercise_id);
    if (!found) {
      const list = catalogOf(program)
        .map((e) => `${e.id} — ${e.name} (${e.sessionKey})`)
        .join("\n");
      return `No exercise with id "${exercise_id}". Valid ids:\n\n${list}`;
    }
    const { ex, sessionKey } = found;

    const db = supabase();
    const { data, error } = await db
      .from("hrl_logs")
      .select("*")
      .eq("kind", "session")
      .order("logged_at", { ascending: true });
    if (error) return `Error reading logs: ${error.message}`;

    const rows = (data ?? []) as LogRow[];
    const lines: string[] = [];
    for (const row of rows) {
      if (!isSessionLog(row)) continue;
      const sets: string[] = [];
      for (let i = 0; i < ex.sets; i += 1) {
        const s = row.data.sets[`${ex.id}_s${i}`];
        if (!s) continue;
        if (ex.timed && s.duration) sets.push(`${s.duration}${s.weight ? ` × ${s.weight}lb` : ""}`);
        else if (s.reps || s.weight) sets.push(`${s.reps ?? "?"}×${s.weight ?? "BW"}`);
      }
      if (sets.length) lines.push(`${row.logged_at}: ${sets.join(" | ")}`);
    }

    const { data: ovr } = await db
      .from("hrl_program_overrides")
      .select("target, note")
      .eq("exercise_id", exercise_id)
      .maybeSingle();

    const header = [
      `${ex.name} (${sessionKey}) — id: ${ex.id}`,
      `Prescribed: ${ex.sets} × ${ex.reps} @ ${ex.target}`,
      ovr?.target ? `CURRENT OVERRIDE (this is the active target): ${ovr.target}${ovr.note ? ` — ${ovr.note}` : ""}` : null,
      ex.note ? `Program note: ${ex.note}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (!lines.length) return `${header}\n\nNo sets logged for this exercise yet.`;

    return truncate(
      `${header}\n\nLogged history (oldest first, format reps×lbs per set):\n${lines.join("\n")}`,
      "history",
    );
  },
});

// ─── get_run_history ──────────────────────────────────────────────────────────

const getRunHistory = betaTool({
  name: "get_run_history",
  description:
    "Get her full run history with the next-morning joint response for each one — distance, time, knee and ankle during the run, knee and ankle the following morning. This is the core dataset for any run-volume decision: it shows how the ankle has actually responded to each distance over time, so you can judge tolerance from the trend rather than from the last run alone.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Maximum runs to return, most recent first. Omit for the full history.",
      },
    },
    additionalProperties: false,
  },
  run: async ({ limit }) => {
    const db = supabase();
    const { data, error } = await db
      .from("hrl_logs")
      .select("*")
      .eq("kind", "run")
      .order("logged_at", { ascending: false })
      .limit(Math.min(limit ?? 100, 100));
    if (error) return `Error reading runs: ${error.message}`;

    const runs = ((data ?? []) as LogRow[]).filter(isRunLog).reverse();
    if (!runs.length) return "No runs logged.";

    const lines = runs.map((r) => {
      const d = r.data;
      const t = runTraffic(d.run_am_knee, d.run_am_ankle);
      const amKnee = String(d.run_am_knee).trim() || "not yet rated";
      const amAnkle = String(d.run_am_ankle).trim() || "not yet rated";
      return [
        `${r.logged_at}: ${d.run_dist || "?"} mi in ${d.run_time || "?"}`,
        `  during — knee ${d.run_knee_end || "?"}/10, ankle ${d.run_ankle || "?"}/10`,
        `  next AM — knee ${amKnee}/10, ankle ${amAnkle}/10 → ${t.light}`,
        d.run_notes ? `  note: ${d.run_notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    });

    return truncate(
      `${runs.length} run(s), oldest first. Traffic light: green = both signals ≤2, yellow = 3, red = ≥4.\n\n${lines.join("\n")}`,
      "run history",
    );
  },
});

// ─── get_health_series ────────────────────────────────────────────────────────

const getHealthSeries = betaTool({
  name: "get_health_series",
  description:
    "Get an Apple Health metric over a window, with its baseline computed from that same window (median, recent mean, range). Use this instead of assuming a baseline: a reading only means something relative to her own recent norm, and that norm moves. Call it whenever readiness, recovery, or session intensity is in question.",
  inputSchema: {
    type: "object",
    properties: {
      metric: {
        type: "string",
        enum: ["hrv", "sleep_hours", "resting_hr", "steps", "active_energy"],
        description: "Which metric to pull.",
      },
      days: {
        type: "integer",
        description:
          "How many days back to look. Defaults to 60, which is usually the right window for a stable baseline. Use a shorter window only when you specifically want recent behavior.",
      },
    },
    required: ["metric"],
    additionalProperties: false,
  },
  run: async ({ metric, days }) => {
    const window = Math.min(days ?? 60, 365);
    const db = supabase();
    const { data, error } = await db
      .from("hrl_health")
      .select(`date, ${metric}`)
      .gte("date", daysAgoISO(window))
      .order("date", { ascending: false });
    if (error) return `Error reading health data: ${error.message}`;

    const rows = ((data ?? []) as unknown as Record<string, string | number | null>[])
      .filter((r) => r[metric] != null)
      .map((r) => ({ date: String(r.date), value: Number(r[metric]) }));

    if (!rows.length) return `No ${metric} readings in the last ${window} days.`;

    const values = rows.map((r) => r.value);
    const recent = values.slice(0, 7);
    const round = (n: number) => Math.round(n * 10) / 10;

    const stats = [
      `${metric} over the last ${window} days — ${rows.length} readings.`,
      `Baseline (median of window): ${round(median(values))}`,
      `Last 7 readings mean: ${round(mean(recent))}`,
      `Window mean: ${round(mean(values))} | min: ${round(Math.min(...values))} | max: ${round(Math.max(...values))}`,
      `Most recent: ${round(rows[0].value)} on ${rows[0].date}`,
    ].join("\n");

    const series = rows.map((r) => `${r.date}: ${round(r.value)}`).join("\n");
    return truncate(`${stats}\n\nDaily readings (newest first):\n${series}`, "series");
  },
});

// ─── get_program ──────────────────────────────────────────────────────────────

const getProgram = betaTool({
  name: "get_program",
  description:
    "Read the prescribed program: the weekly schedule, or the full spec for one session (every exercise with sets, reps, target load, and the coaching note behind it), merged with any current override. Overrides are the active target and beat the base program. Call this when you need to know what she is supposed to be doing, or to look up an exercise_id.",
  inputSchema: {
    type: "object",
    properties: {
      session_key: {
        type: "string",
        enum: ["L1", "U1", "L2", "U2", "C1", "G1"],
        description:
          "Which session to detail. Omit to get the weekly schedule and a compact index of every exercise id.",
      },
    },
    additionalProperties: false,
  },
  run: async ({ session_key }) => {
    // Resolved, so this reflects any exercise the coach has already swapped in
    // or dropped — not the code template.
    const program = await getResolvedProgram();

    if (!session_key) {
      const schedule = WEEKLY_SCHEDULE.map((d) => `${d.day}: ${d.label}`).join("\n");
      const index = catalogOf(program)
        .map((e) => `  ${e.id} — ${e.name} (${e.sessionKey})`)
        .join("\n");
      return truncate(
        `WEEKLY SCHEDULE\n${schedule}\n\nEXERCISE INDEX (pass an id to get_exercise_progression or edit_program)\n${index}`,
        "program",
      );
    }

    const s = program[session_key as SessionKey];
    const lines = [`${session_key} — ${s.label}: ${s.subtitle}`, ""];
    for (const ex of s.exercises) {
      lines.push(`${ex.name} (id: ${ex.id})`);
      lines.push(`  Prescribed: ${ex.sets} × ${ex.reps} @ ${ex.target}`);
      if (ex.note) lines.push(`  Note: ${ex.note}`);
      lines.push("");
    }
    lines.push(`Cooldown: ${s.cooldown.join("; ")}`);
    return truncate(lines.join("\n"), "session spec");
  },
});

/**
 * Failure wording for the write tools.
 *
 * This is load-bearing. A bare "Could not record the change: ..." reads as a
 * soft aside, and the model opened its reply with "Done — hammer curls are out"
 * before mentioning at the bottom that nothing saved. Claiming a change landed
 * when it didn't is the worst failure this feature has: she'd walk into the gym
 * expecting a program she doesn't have. State it flatly and up front so it
 * cannot be mistaken for a partial success.
 */
function failed(error: string): string {
  return `FAILED — HER PROGRAM WAS NOT CHANGED. Nothing was saved; the program is exactly as it was. Do not tell her the change was made. Tell her it failed and that you'll need to try again. Reason: ${error}`;
}

// ─── Changing the program ─────────────────────────────────────────────────────
//
// The coach may edit unprompted — her explicit call. A real coach doesn't ask
// permission to swap an exercise; they do it and tell you why. What makes that
// safe is not a gate beforehand but visibility after: every edit records a
// rationale, shows up in her Program screen, and undoes in one tap.

const editProgram = betaTool({
  name: "edit_program",
  description:
    "Change which exercises are in a session — add one, drop one, or replace one with another. Use this when she asks, and use it on your own judgment when a change is genuinely warranted (a lift is redundant, something is aggravating a joint, a gap is blocking one of her priorities). Read the session with get_program first so you are editing what is actually there. Say what you changed and why in your reply — never make a change silently. Prefer replace over drop when the movement pattern still has a job to do. This is a real edit to the workout she will do tomorrow, so make one deliberate change at a time rather than restructuring a session in a single turn.",
  inputSchema: {
    type: "object",
    properties: {
      op: {
        type: "string",
        enum: ["add", "drop", "replace"],
        description:
          "'add' puts a new exercise in; 'drop' removes one; 'replace' swaps one out for another, keeping its slot.",
      },
      session_key: {
        type: "string",
        enum: ["L1", "U1", "L2", "U2", "C1", "G1"],
        description: "Which session to edit.",
      },
      exercise_id: {
        type: "string",
        description:
          "For 'drop' and 'replace': the id of the existing exercise being acted on. Ignored for 'add'.",
      },
      after_exercise_id: {
        type: "string",
        description:
          "For 'add' only: insert directly after this exercise. Omit to append at the end. Order matters — put heavy compounds before accessories.",
      },
      name: {
        type: "string",
        description: "For 'add' and 'replace': the new exercise's name, as she'd say it. e.g. 'Chest-Supported Row'.",
      },
      sets: { type: "integer", description: "For 'add' and 'replace': number of sets." },
      reps: {
        type: "string",
        description: "For 'add' and 'replace': rep prescription as text. e.g. '8-10 reps', '12 each side'.",
      },
      target: {
        type: "string",
        description:
          "For 'add' and 'replace': starting load or target. e.g. '60 lbs', 'Bodyweight', 'Light band'.",
      },
      note: {
        type: "string",
        description:
          "For 'add' and 'replace': the coaching note — how to do it and what it's for. This is what she reads mid-set, so make it useful and concrete.",
      },
      weighted: {
        type: "boolean",
        description:
          "For 'add' and 'replace': false for bodyweight/band work with no load field. Defaults to true.",
      },
      timed: {
        type: "boolean",
        description:
          "For 'add' and 'replace': true if measured in time rather than reps (planks, balance holds). Defaults to false.",
      },
      rationale: {
        type: "string",
        description:
          "Why this change, grounded in her data, her priorities, or what she just told you. She sees this verbatim in her Program screen next to the change. Required.",
      },
    },
    required: ["op", "session_key", "rationale"],
    additionalProperties: false,
  },
  run: async (args) => {
    const { op, session_key, exercise_id, after_exercise_id, rationale } = args;
    const key = session_key as SessionKey;

    if (op === "drop") {
      if (!exercise_id) return "drop needs an exercise_id. Call get_program to see what's in that session.";
      const r = await applyProgramEdit({ op: "drop", session_key: key, exercise_id }, rationale);
      return r.ok ? `${r.summary}. She can see this and undo it in her Program screen.` : failed(r.error);
    }

    // add / replace both need a full exercise spec
    const missing = (["name", "sets", "reps", "target"] as const).filter((f) => args[f] == null);
    if (missing.length) return `${op} needs: ${missing.join(", ")}.`;

    const exercise = {
      name: args.name as string,
      sets: args.sets as number,
      reps: args.reps as string,
      target: args.target as string,
      note: args.note,
      weighted: args.weighted,
      timed: args.timed,
    };

    if (op === "add") {
      const r = await applyProgramEdit(
        { op: "add", session_key: key, exercise, after_exercise_id },
        rationale,
      );
      return r.ok ? `${r.summary}. She can see this and undo it in her Program screen.` : failed(r.error);
    }

    if (!exercise_id) return "replace needs the exercise_id of the lift being replaced.";
    const r = await applyProgramEdit(
      { op: "replace", session_key: key, exercise_id, exercise },
      rationale,
    );
    return r.ok ? `${r.summary}. She can see this and undo it in her Program screen.` : r.error;
  },
});

const setExerciseTarget = betaTool({
  name: "set_exercise_target",
  description:
    "Change the working target (load, reps) for an exercise that already exists — the everyday progression call. Use this to move a weight up, back one off, or pin a hold. Check get_exercise_progression first so you are reading the real curve, not the last session. This does not change which exercises are in the program; use edit_program for that. Pass an empty target to clear the override and go back to the program's prescribed number.",
  inputSchema: {
    type: "object",
    properties: {
      exercise_id: { type: "string", description: "The exercise's id, e.g. 'l1_leg_press'." },
      target: {
        type: "string",
        description:
          "The new working target as she'd read it. e.g. '220 lbs', '4x8 at 75'. Empty string clears the override and reverts to the program default.",
      },
      note: {
        type: "string",
        description:
          "Short reason shown next to the target in her logger. e.g. 'Hold here until 4x8 is clean at 1-2 RIR.'",
      },
    },
    required: ["exercise_id", "target"],
    additionalProperties: false,
  },
  run: async ({ exercise_id, target, note }) => {
    const program = await getResolvedProgram();
    const found = findExerciseIn(program, exercise_id);
    if (!found) {
      const list = catalogOf(program).map((e) => `${e.id} (${e.name})`).join(", ");
      return `No exercise "${exercise_id}". Valid ids: ${list}`;
    }

    const db = supabase();
    if (!target.trim()) {
      const { error } = await db.from("hrl_program_overrides").delete().eq("exercise_id", exercise_id);
      return error
        ? failed(`Could not clear the target: ${error.message}`)
        : `Cleared the override on ${found.ex.name} — back to the program default.`;
    }

    const { error } = await db.from("hrl_program_overrides").upsert(
      {
        exercise_id,
        target,
        note: note ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "exercise_id" },
    );
    return error
      ? failed(`Could not set the target: ${error.message}`)
      : `${found.ex.name} is now targeting ${target}. It'll show in her logger next session.`;
  },
});

// ─── The decision journal ─────────────────────────────────────────────────────
//
// The coach's own reasoning, append-only. This is the piece that turns a
// chatbot with a database into something with continuity of intent: it can pick
// up a thread it started three weeks ago, check whether its own call actually
// worked, and say so.

const recordDecision = betaTool({
  name: "record_decision",
  description:
    "Write down a coaching decision you just made, so you can pick the thread back up later and check whether it worked. Call this whenever you tell her to hold, change, add, or drop something that spans more than today — a run distance to sit at, a lift to stop chasing, a weekly session target. Do NOT use this for facts about her (those are hers to maintain) or for anything you can recompute from her data. Write the decision in her terms, not yours. Entries are permanent and cannot be edited, so say it once and say it plainly.",
  inputSchema: {
    type: "object",
    properties: {
      decision: {
        type: "string",
        description:
          "What you decided, stated plainly and concretely. e.g. 'Hold runs at 1.5 miles — no distance increase yet.'",
      },
      rationale: {
        type: "string",
        description:
          "Why, grounded in what was actually true when you decided it. Cite the real numbers you looked at. e.g. 'Ankle came back at 3 the morning after 1.25 mi. Only two runs logged, so tolerance at this distance is unproven.'",
      },
      review_trigger: {
        type: "string",
        description:
          "What would justify revisiting this — a condition, not a date, wherever possible. e.g. 'Two consecutive runs at 1.5 mi with next-AM ankle at or below 1.' Omit only if it genuinely revisits on judgment.",
      },
    },
    required: ["decision", "rationale"],
    additionalProperties: false,
  },
  run: async ({ decision, rationale, review_trigger }) => {
    const db = supabase();
    const { data, error } = await db
      .from("hrl_decisions")
      .insert({ decision, rationale, review_trigger: review_trigger ?? null })
      .select("id, created_at")
      .single();
    if (error) return `Could not record the decision: ${error.message}`;
    return `Recorded on ${String(data.created_at).slice(0, 10)} (id ${data.id}). It will be in front of you every session until you close it.`;
  },
});

const closeDecision = betaTool({
  name: "close_decision",
  description:
    "Close an open decision once its review trigger has been met or it no longer applies, recording how it actually turned out. Check the evidence before you close — pull the logs or the run history and say what really happened, whether it worked or not. An honest 'this didn't hold' is worth more than a tidy one. Closing does not erase anything; the original decision and rationale stay on the record.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The decision's id, as shown in your open decisions.",
      },
      outcome: {
        type: "string",
        description:
          "What actually happened, with the numbers. e.g. 'Worked — three runs at 1.5 mi, next-AM ankle 1, 1, 2. Tolerance established, moving to 1.75.' Or: 'Didn't hold — she only ran once in three weeks, so this was never tested.'",
      },
    },
    required: ["id", "outcome"],
    additionalProperties: false,
  },
  run: async ({ id, outcome }) => {
    const db = supabase();
    const { data, error } = await db
      .from("hrl_decisions")
      .update({ status: "closed", outcome, closed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "open")
      .select("decision")
      .maybeSingle();
    if (error) return `Could not close that decision: ${error.message}`;
    if (!data) return `No open decision with id "${id}". Check your open decisions — it may already be closed.`;
    return `Closed: "${data.decision}". Outcome recorded.`;
  },
});

const getDecisionHistory = betaTool({
  name: "get_decision_history",
  description:
    "Read decisions you closed in the past, with how each one turned out. Your OPEN decisions are already in front of you every session — you do not need this for those. Use it to see whether an approach has been tried before and what came of it, so you neither repeat a failed call nor re-litigate a settled one.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Maximum closed decisions to return, most recently closed first. Defaults to 15.",
      },
    },
    additionalProperties: false,
  },
  run: async ({ limit }) => {
    const db = supabase();
    const { data, error } = await db
      .from("hrl_decisions")
      .select("created_at, closed_at, decision, rationale, outcome")
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(Math.min(limit ?? 15, 50));
    if (error) return `Could not read decision history: ${error.message}`;

    const rows = (data ?? []) as {
      created_at: string;
      closed_at: string | null;
      decision: string;
      rationale: string;
      outcome: string | null;
    }[];
    if (!rows.length) return "No closed decisions yet.";

    return truncate(
      rows
        .map((r) =>
          [
            `${r.created_at.slice(0, 10)} → ${r.closed_at?.slice(0, 10) ?? "?"}: ${r.decision}`,
            `  why: ${r.rationale}`,
            `  outcome: ${r.outcome ?? "not recorded"}`,
          ].join("\n"),
        )
        .join("\n\n"),
      "decision history",
    );
  },
});

// Order is fixed and module-level: tools render ahead of the system prompt in
// the cache prefix, so any reshuffle here invalidates the cached prompt.
const READ_TOOLS = [queryLogs, getExerciseProgression, getRunHistory, getHealthSeries, getProgram];
const WRITE_TOOLS = [editProgram, setExerciseTarget];
const JOURNAL_TOOLS = [recordDecision, closeDecision, getDecisionHistory];

/** Chat. She's present, sees the reasoning, and can answer back. Everything on. */
export const COACH_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS, ...JOURNAL_TOOLS];

/**
 * The unattended surfaces — the 8am brief and the weekly review. These run on a
 * cron with nobody in the room.
 *
 * Reads and the decision journal, but deliberately NO program writes. She okayed
 * the coach editing her program unprompted, and it does — in conversation, where
 * she can see why and push back in the same breath. A cron job silently
 * restructuring her training while she sleeps is a different thing, and not what
 * she agreed to. If the brief thinks a change is warranted it can say so and she
 * can say go.
 */
export const COACH_UNATTENDED_TOOLS = [...READ_TOOLS, ...JOURNAL_TOOLS];

/** What to show her while the coach is off looking something up. */
export function toolStatusLabel(name: string, input: unknown): string {
  const arg = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "query_logs":
      return arg.kind === "run"
        ? "Reading your runs…"
        : arg.session_key
          ? `Reading your ${String(arg.session_key)} sessions…`
          : "Reading your logs…";
    case "get_exercise_progression": {
      const id = typeof arg.exercise_id === "string" ? arg.exercise_id : "";
      const name = id ? baseExerciseName(id) : null;
      return name ? `Pulling your ${name} history…` : "Pulling lift history…";
    }
    case "get_run_history":
      return "Checking how your ankle responded to past runs…";
    case "get_health_series":
      return `Checking your ${String(arg.metric ?? "recovery")} against baseline…`;
    case "get_program":
      return "Checking your program…";
    case "edit_program": {
      const op = String(arg.op ?? "");
      const sk = String(arg.session_key ?? "your program");
      if (op === "drop") return `Removing an exercise from ${sk}…`;
      if (op === "add") return `Adding ${String(arg.name ?? "an exercise")} to ${sk}…`;
      if (op === "replace") return `Swapping in ${String(arg.name ?? "a new exercise")} in ${sk}…`;
      return `Updating ${sk}…`;
    }
    case "set_exercise_target": {
      const id = typeof arg.exercise_id === "string" ? arg.exercise_id : "";
      const name = id ? baseExerciseName(id) : null;
      return name ? `Updating your ${name} target…` : "Updating a target…";
    }
    case "record_decision":
      return "Noting this down to follow up on…";
    case "close_decision":
      return "Closing the loop on an earlier call…";
    case "get_decision_history":
      return "Checking what we've tried before…";
    default:
      return "Looking something up…";
  }
}
