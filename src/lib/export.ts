import type { SessionKey } from "@/lib/program";
import { getResolvedProgram } from "@/lib/program-server";
import { supabase } from "@/lib/supabase";
import { isRunLog, isSessionLog, isXtrainLog, type LogRow } from "@/lib/types";

// Getting her data back out.
//
// Her training doesn't live in the app — it lives in Postgres, and the PWA is
// just a window onto it. But there was an import path and no export, so there
// was no copy she actually held. If that project were paused, deleted, or her
// access lapsed, years of logs would be somewhere she couldn't reach. Data she
// can't get out isn't really hers.
//
// Two formats, because they answer different fears:
//   json — everything, exactly as stored, and re-importable through
//          /api/logs/import. This is the backup.
//   csv  — one row per set, openable in Numbers or Sheets. This is the one she
//          can actually read, sort, and plot without any of this code existing.

export type ExportBundle = {
  exported_at: string;
  schema: string;
  note: string;
  counts: Record<string, number>;
  logs: LogRow[];
  health: unknown[];
  checkins: unknown[];
  recovery: unknown[];
  cycle: unknown[];
  profile: unknown[];
  program_overrides: unknown[];
  phases: unknown[];
  decisions: unknown[];
};

/** Everything of hers, exactly as stored. */
export async function buildExportJSON(): Promise<ExportBundle> {
  const db = supabase();
  const [logs, health, checkins, recovery, cycle, profile, overrides, phases, decisions] =
    await Promise.all([
      db.from("hrl_logs").select("*").order("logged_at", { ascending: true }),
      db.from("hrl_health").select("*").order("date", { ascending: true }),
      db.from("hrl_checkins").select("*").order("date", { ascending: true }),
      db.from("hrl_recovery").select("*").order("date", { ascending: true }),
      db.from("hrl_cycle").select("*").order("date", { ascending: true }),
      db.from("hrl_profile").select("*").order("created_at", { ascending: true }),
      db.from("hrl_program_overrides").select("*"),
      db.from("hrl_phases").select("*").order("phase_number", { ascending: true }),
      db.from("hrl_decisions").select("*").order("created_at", { ascending: true }),
    ]);

  const rows = (logs.data ?? []) as LogRow[];

  return {
    exported_at: new Date().toISOString(),
    schema: "volt-export-1",
    note:
      "Complete export of your training data. `logs` is the record of everything you did. " +
      "To restore into a fresh instance, POST { logs: <this file>.logs.map(l => l.data) } to /api/logs/import. " +
      "Every timestamp is as stored; dates are calendar dates in your own timezone.",
    counts: {
      logs: rows.length,
      health: (health.data ?? []).length,
      checkins: (checkins.data ?? []).length,
      recovery: (recovery.data ?? []).length,
      cycle: (cycle.data ?? []).length,
      profile: (profile.data ?? []).length,
      program_overrides: (overrides.data ?? []).length,
      phases: (phases.data ?? []).length,
      decisions: (decisions.data ?? []).length,
    },
    logs: rows,
    health: health.data ?? [],
    checkins: checkins.data ?? [],
    recovery: recovery.data ?? [],
    cycle: cycle.data ?? [],
    profile: profile.data ?? [],
    program_overrides: overrides.data ?? [],
    phases: phases.data ?? [],
    // The coach's reasoning is part of her record too — what it decided, why,
    // and how it turned out.
    decisions: decisions.data ?? [],
  };
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

const COLUMNS = [
  "date",
  "type",
  "session",
  "exercise",
  "set",
  "reps",
  "weight_lb",
  "duration",
  "distance_mi",
  "run_time",
  "knee_during",
  "ankle_during",
  "knee_next_am",
  "ankle_next_am",
  "modality",
  "intensity",
  "notes",
] as const;

type Row = Partial<Record<(typeof COLUMNS)[number], string | number>>;

/** RFC4180: quote everything with a comma, quote, or newline; double inner quotes. */
function cell(v: string | number | undefined): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * One row per set of strength work, one per run, one per cross-training session.
 * Columns are the union across types, so it's sparse — but it's a single file
 * that sorts, filters and pivots in any spreadsheet, which beats three files
 * she has to join by hand.
 */
export async function buildExportCSV(): Promise<string> {
  const db = supabase();
  const [logsRes, program] = await Promise.all([
    db.from("hrl_logs").select("*").order("logged_at", { ascending: true }),
    // Resolved, so exercises the coach added or swapped in are named properly
    // rather than showing up as bare ids.
    getResolvedProgram(),
  ]);

  const rows: Row[] = [];

  for (const log of (logsRes.data ?? []) as LogRow[]) {
    if (isSessionLog(log)) {
      const key = log.data.sessionKey as SessionKey;
      const session = program[key];
      const exercises = session?.exercises ?? [];
      let wroteAny = false;

      for (const ex of exercises) {
        for (let i = 0; i < ex.sets; i += 1) {
          const s = log.data.sets[`${ex.id}_s${i}`];
          if (!s || (!s.reps && !s.weight && !s.duration)) continue;
          wroteAny = true;
          rows.push({
            date: log.logged_at,
            type: "strength",
            session: key,
            exercise: ex.name,
            set: i + 1,
            reps: s.reps ?? "",
            weight_lb: s.weight ?? "",
            duration: s.duration ?? "",
          });
        }
      }

      // A session with notes but no logged sets would otherwise vanish from the
      // export entirely.
      if (!wroteAny) {
        rows.push({ date: log.logged_at, type: "strength", session: key, notes: log.data.notes ?? "" });
      } else if (log.data.notes) {
        rows.push({ date: log.logged_at, type: "strength", session: key, notes: log.data.notes });
      }
    } else if (isRunLog(log)) {
      const d = log.data;
      rows.push({
        date: log.logged_at,
        type: "run",
        distance_mi: d.run_dist ?? "",
        run_time: d.run_time ?? "",
        knee_during: d.run_knee_end ?? "",
        ankle_during: d.run_ankle ?? "",
        knee_next_am: d.run_am_knee ?? "",
        ankle_next_am: d.run_am_ankle ?? "",
        notes: d.run_notes ?? "",
      });
    } else if (isXtrainLog(log)) {
      const d = log.data;
      rows.push({
        date: log.logged_at,
        type: "cross-training",
        modality: d.modality ?? "",
        duration: d.duration ?? "",
        intensity: d.intensity ?? "",
        notes: d.notes ?? "",
      });
    }
  }

  const header = COLUMNS.join(",");
  const body = rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
