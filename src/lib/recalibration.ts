import type { SupabaseClient } from "@supabase/supabase-js";
import { freshness, localTodayISO } from "@/lib/freshness";
import { SESSION_ORDER } from "@/lib/program";
import { getResolvedProgram } from "@/lib/program-server";
import { isSessionLog, type LogRow, type ProfileEntry } from "@/lib/types";

// Workstream #5 — the routine recalibration ritual.
//
// Once a month the app forces the codified state current with a human in the
// loop, so nothing rots silently. It bundles the three ways facts drift from
// reality into ONE "confirm what's changed" review:
//   1. baselines — lifts your logging has earned a change on (#1's proposals)
//   2. profile   — living facts you haven't confirmed in a while (#2)
//   3. drift     — program targets that disagree with what you're actually
//                  lifting, beyond what #1 already flagged (#3)
// Each item resolves to a living-data write (apply an override, confirm/resolve
// a profile entry). Nothing changes without her tap.

const PROFILE_STALE_DAYS = 45; // an active fact unconfirmed this long is worth re-checking
const DRIFT_LOOKBACK_DAYS = 56;
const DRIFT_MIN_SESSIONS = 3; // same evidence bar as baselines — no one-off blips

export type DriftItem = {
  exercise_id: string;
  exercise_name: string;
  session_key: string;
  target: string;
  target_load: number;
  logged_load: number;
  direction: "above" | "below";
  sessions: number;
};

export type StaleProfileItem = {
  id: string;
  kind: string;
  text: string;
  age_days: number;
};

export type BaselineItem = {
  id: string;
  exercise_id: string;
  exercise_name: string | null;
  current_target: string | null;
  proposed_target: string;
  rationale: string | null;
};

export type Recalibration = {
  generated_at: string;
  baselines: BaselineItem[];
  stale_profile: StaleProfileItem[];
  drift: DriftItem[];
  /** Total items needing a look — 0 means nothing has drifted; a clean month. */
  count: number;
};

/** First number in a target string: "255 3×8-10" → 255, "Bodyweight" → null. */
function leadingNumber(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function median(nums: number[]): number {
  const xs = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * Program targets that disagree with the logs. Deliberately excludes anything
 * already carried as a pending baseline proposal (`skipIds`) so the ritual never
 * lists the same lift twice, and assistance lifts (lower = harder there, so
 * "above/below" would read backwards — those are handled by baselines).
 */
export async function computeDrift(
  db: SupabaseClient,
  skipIds: Set<string>,
): Promise<DriftItem[]> {
  const since = new Date();
  since.setDate(since.getDate() - DRIFT_LOOKBACK_DAYS);

  const [program, logsRes] = await Promise.all([
    getResolvedProgram(),
    db
      .from("hrl_logs")
      .select("*")
      .eq("kind", "session")
      .gte("logged_at", since.toISOString().slice(0, 10))
      .order("logged_at", { ascending: false })
      .limit(80),
  ]);
  const logs = (logsRes.data ?? []) as LogRow[];

  const out: DriftItem[] = [];
  for (const sk of SESSION_ORDER) {
    for (const ex of program[sk].exercises) {
      if (ex.weighted === false || ex.loadType === "assistance") continue;
      if (skipIds.has(ex.id)) continue;
      const targetLoad = leadingNumber(ex.target);
      if (targetLoad == null || targetLoad <= 0) continue;

      // Top set weight per session for this lift.
      const perSession: number[] = [];
      for (const row of logs) {
        if (!isSessionLog(row)) continue;
        let top = 0;
        for (const [key, entry] of Object.entries(row.data.sets)) {
          if (!key.startsWith(ex.id + "_s")) continue;
          const w = Number(entry.weight) || 0;
          if (w > top) top = w;
        }
        if (top > 0) perSession.push(top);
      }
      if (perSession.length < DRIFT_MIN_SESSIONS) continue;

      const logged = median(perSession.slice(0, 5));
      const tolerance = Math.max(5, targetLoad * 0.05);
      if (Math.abs(logged - targetLoad) < tolerance) continue;

      out.push({
        exercise_id: ex.id,
        exercise_name: ex.name,
        session_key: sk,
        target: ex.target,
        target_load: targetLoad,
        logged_load: logged,
        direction: logged > targetLoad ? "above" : "below",
        sessions: perSession.length,
      });
    }
  }
  return out;
}

/** Assemble the monthly checklist from live data. Pure read; writes nothing. */
export async function buildRecalibration(db: SupabaseClient): Promise<Recalibration> {
  const today = localTodayISO();

  const [proposalsRes, profileRes] = await Promise.all([
    db
      .from("hrl_proposals")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    db
      .from("hrl_profile")
      .select("*")
      .eq("status", "active")
      .order("updated_at", { ascending: true }),
  ]);

  const baselines = (proposalsRes.data ?? []).map((p) => ({
    id: p.id as string,
    exercise_id: p.exercise_id as string,
    exercise_name: (p.exercise_name as string | null) ?? null,
    current_target: (p.current_target as string | null) ?? null,
    proposed_target: p.proposed_target as string,
    rationale: (p.rationale as string | null) ?? null,
  }));

  const stale_profile: StaleProfileItem[] = [];
  for (const e of (profileRes.data ?? []) as ProfileEntry[]) {
    const { ageDays } = freshness(e.updated_at.slice(0, 10), PROFILE_STALE_DAYS, today);
    if (ageDays != null && ageDays >= PROFILE_STALE_DAYS) {
      stale_profile.push({ id: e.id, kind: e.kind, text: e.text, age_days: ageDays });
    }
  }

  const skip = new Set(baselines.map((b) => b.exercise_id));
  const drift = await computeDrift(db, skip);

  return {
    generated_at: today,
    baselines,
    stale_profile,
    drift,
    count: baselines.length + stale_profile.length + drift.length,
  };
}
