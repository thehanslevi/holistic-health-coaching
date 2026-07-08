import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const NUM_FIELDS = ["sleep_hours", "steps", "resting_hr", "hrv", "active_energy"] as const;
type NumField = (typeof NUM_FIELDS)[number];

export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const { data, error } = await supabase()
      .from("hrl_health")
      .select("*")
      .order("date", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}

// Sleep can arrive in hours (aggregated) or minutes; nobody sleeps >24h, so a
// value above that must be minutes.
function normalizeSleep(v: number): number {
  return v > 24 ? v / 60 : v;
}

// Map a Health Auto Export metric name (any casing/spacing/version) to our column.
function mapMetricName(name: string): NumField | null {
  const k = name.toLowerCase().replace(/[\s_]+/g, "");
  if (k === "stepcount" || k === "steps") return "steps";
  if (k === "restingheartrate") return "resting_hr";
  if (k.startsWith("heartratevariability") || k === "hrv") return "hrv";
  if (k === "activeenergy" || k === "activeenergyburned") return "active_energy";
  return null;
}

type DayAgg = {
  steps?: number;
  resting_hr?: number;
  hrv?: number;
  active_energy?: number;
  sleep_hours?: number;
  _rhr?: { sum: number; n: number };
  _hrv?: { sum: number; n: number };
};

function dayKey(date: unknown): string | null {
  if (typeof date !== "string" || date.length < 10) return null;
  return date.slice(0, 10);
}

// Parse Health Auto Export's nested { data: { metrics: [...] } } payload into a
// per-date aggregate. Handles multi-day payloads (HAE can backfill) and
// multiple samples per day.
function parseHaeMetrics(metrics: unknown[]): Map<string, DayAgg> {
  const byDate = new Map<string, DayAgg>();
  const get = (d: string) => {
    let a = byDate.get(d);
    if (!a) byDate.set(d, (a = {}));
    return a;
  };

  for (const m of metrics) {
    const metric = m as { name?: string; units?: string; data?: unknown[] };
    if (!metric?.name || !Array.isArray(metric.data)) continue;
    const isSleep = metric.name.toLowerCase().replace(/[\s_]+/g, "") === "sleepanalysis";
    const field = mapMetricName(metric.name);
    if (!isSleep && !field) continue;
    const unitsKJ = (metric.units ?? "").toLowerCase().includes("kj");

    for (const p of metric.data) {
      const point = p as Record<string, unknown>;
      const d = dayKey(point.date);
      if (!d) continue;
      const agg = get(d);

      if (isSleep) {
        const raw = Number(point.totalSleep ?? point.asleep ?? point.inBed);
        if (!Number.isNaN(raw) && raw > 0) agg.sleep_hours = normalizeSleep(raw);
        continue;
      }
      let qty = Number(point.qty);
      if (Number.isNaN(qty)) continue;
      if (field === "active_energy") {
        if (unitsKJ) qty = qty / 4.184;
        agg.active_energy = (agg.active_energy ?? 0) + qty; // sum over the day
      } else if (field === "steps") {
        agg.steps = (agg.steps ?? 0) + qty; // sum over the day
      } else if (field === "resting_hr") {
        agg._rhr = { sum: (agg._rhr?.sum ?? 0) + qty, n: (agg._rhr?.n ?? 0) + 1 };
      } else if (field === "hrv") {
        agg._hrv = { sum: (agg._hrv?.sum ?? 0) + qty, n: (agg._hrv?.n ?? 0) + 1 };
      }
    }
  }

  // Finalize averages for point-in-time metrics.
  for (const agg of byDate.values()) {
    if (agg._rhr) agg.resting_hr = Math.round(agg._rhr.sum / agg._rhr.n);
    if (agg._hrv) agg.hrv = Math.round((agg._hrv.sum / agg._hrv.n) * 10) / 10;
    delete agg._rhr;
    delete agg._hrv;
  }
  return byDate;
}

function rowFromAgg(date: string, agg: DayAgg, source: string) {
  const row: Record<string, unknown> = { date, source, updated_at: new Date().toISOString() };
  for (const f of NUM_FIELDS) {
    const v = agg[f];
    if (v != null && !Number.isNaN(v)) row[f] = Math.round(v * 100) / 100;
  }
  return row;
}

// Upsert Apple Health metrics. Accepts EITHER:
//  1. Health Auto Export's nested payload: { data: { metrics: [...] } }  (preferred)
//  2. A flat single-day body: { date?, sleep_hours, steps, resting_hr, hrv, active_energy }
// Only fields present are written, so partial pushes are safe.
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const db = supabase();

    // Health Auto Export nested format.
    const metrics = body?.data?.metrics;
    if (Array.isArray(metrics)) {
      const byDate = parseHaeMetrics(metrics);
      const rows = [...byDate.entries()]
        .map(([date, agg]) => rowFromAgg(date, agg, "health-auto-export"))
        .filter((r) => NUM_FIELDS.some((f) => r[f] != null));
      if (!rows.length) {
        return NextResponse.json({ ok: true, upserted: 0, note: "no mapped metrics in payload" });
      }
      const { error } = await db.from("hrl_health").upsert(rows, { onConflict: "date" });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, upserted: rows.length, dates: rows.map((r) => r.date) });
    }

    // Flat single-day fallback (legacy Shortcut style).
    const date = (body?.date as string) || new Date().toISOString().slice(0, 10);
    const row: Record<string, unknown> = {
      date,
      source: body?.source || "shortcut",
      updated_at: new Date().toISOString(),
    };
    for (const f of NUM_FIELDS) {
      if (body?.[f] !== undefined && body[f] !== null && body[f] !== "") {
        let n = Number(body[f]);
        if (!Number.isNaN(n)) {
          if (f === "sleep_hours") n = normalizeSleep(n);
          row[f] = Math.round(n * 100) / 100;
        }
      }
    }
    const { data, error } = await db
      .from("hrl_health")
      .upsert(row, { onConflict: "date" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
