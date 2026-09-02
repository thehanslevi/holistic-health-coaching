import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { RunLogData } from "@/lib/types";

// Watch/HealthKit workouts from the native shell. Idempotent on HealthKit UUID.
//
// Runs log themselves: a `running` workout becomes a run log (distance, time,
// date) with the ankle fields empty — so the next-morning check still asks,
// which is the one thing she should have to type. Everything else (strength,
// walks, rides) is stored as "detected" for a confirm surface: the logger can't
// know which rotation session a strength workout was, and a walk isn't a run.

type Incoming = {
  uuid: string;
  type: string;
  local_date?: string;
  start: string;
  end: string;
  duration_s: number;
  distance_mi?: number;
  avg_hr?: number;
  energy_kcal?: number;
};

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Fallback only — the shell sends local_date. New York is her home zone.
function localDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const list = (Array.isArray(body?.workouts) ? body.workouts : []) as Incoming[];
    if (!list.length) return NextResponse.json({ ok: true, seen: 0, logged: 0 });

    const db = supabase();
    const uuids = list.map((w) => w.uuid).filter(Boolean);
    const { data: existing } = await db.from("hrl_workouts").select("uuid").in("uuid", uuids);
    const known = new Set((existing ?? []).map((r) => r.uuid as string));

    let logged = 0;
    let inserted = 0;
    for (const w of list) {
      if (!w.uuid || known.has(w.uuid) || !w.start || !w.end) continue;
      const date = w.local_date && /^\d{4}-\d{2}-\d{2}$/.test(w.local_date) ? w.local_date : localDateOf(w.start);
      let logId: string | null = null;
      let status: "detected" | "logged" = "detected";

      if (w.type === "running" && (w.distance_mi ?? 0) > 0.25) {
        // Don't double-log a run she already typed in for that day.
        const { data: dup } = await db
          .from("hrl_logs")
          .select("id")
          .eq("kind", "run")
          .eq("logged_at", date)
          .limit(1);
        if (!dup?.length) {
          const data: RunLogData = {
            type: "run",
            date,
            run_date: date,
            run_dist: String(w.distance_mi),
            run_time: mmss(w.duration_s),
            run_knee_end: "",
            run_ankle: "",
            run_am_knee: "",
            run_am_ankle: "",
            run_notes: `From Apple Watch${w.avg_hr ? ` · avg HR ${w.avg_hr}` : ""}`,
            run_type: null,
          };
          const { data: row } = await db
            .from("hrl_logs")
            .insert({ logged_at: date, kind: "run", session_key: null, data })
            .select("id")
            .single();
          if (row?.id) {
            logId = row.id as string;
            status = "logged";
            logged++;
          }
        }
      }

      const { error } = await db.from("hrl_workouts").insert({
        uuid: w.uuid,
        type: w.type,
        started_at: w.start,
        ended_at: w.end,
        duration_s: Math.round(w.duration_s || 0),
        distance_mi: w.distance_mi ?? null,
        avg_hr: w.avg_hr ?? null,
        energy_kcal: w.energy_kcal ?? null,
        status,
        log_id: logId,
        raw: w,
      });
      if (!error) inserted++;
    }
    return NextResponse.json({ ok: true, seen: list.length, new: inserted, logged });
  } catch (e) {
    return errorResponse(e);
  }
}
