import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const NUM_FIELDS = ["sleep_hours", "steps", "resting_hr", "hrv", "active_energy"] as const;
type NumField = (typeof NUM_FIELDS)[number];

// steps / resting_hr / active_energy are integer columns; sleep_hours and hrv
// keep decimals. Round each to what its column accepts so a decimal (e.g.
// Active Energy 516.94 kcal) can't blow up the insert.
const INT_FIELDS = new Set<NumField>(["steps", "resting_hr", "active_energy"]);
function roundField(f: NumField, v: number): number {
  return INT_FIELDS.has(f) ? Math.round(v) : Math.round(v * 100) / 100;
}

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

// ─── Cycle tracking (menstruation) ────────────────────────────────────────────
// HAE's cycle format is undocumented, so this is deliberately tolerant: it looks
// for cycle data in either data.cycleTracking[] or a menstruation metric, pulls a
// date + flow from whatever field names are present, and stores the raw entry so
// the exact shape can be confirmed from a real sync.

type CycleUpsert = {
  date: string;
  is_period: boolean;
  flow: string | null;
  raw: unknown;
  source: string;
};

function pickDate(e: Record<string, unknown>): string | null {
  for (const k of ["date", "startDate", "start", "dateComponents", "day"]) {
    const v = e[k];
    if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  }
  return null;
}

function pickFlow(e: Record<string, unknown>): string | null {
  for (const k of ["value", "flow", "menstrualFlow", "flowLevel", "menstrual_flow", "qty"]) {
    const v = e[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return null;
}

// A logged flow other than "none"/0 is a bleeding day. Apple's "unspecified"
// still means a period day.
function isBleed(flow: string | null): boolean {
  if (flow == null) return false;
  const f = flow.toLowerCase();
  return f !== "none" && f !== "0" && f !== "0.0" && f !== "false";
}

function parseCycle(data: Record<string, unknown>): CycleUpsert[] {
  const out = new Map<string, CycleUpsert>();
  const add = (date: string, flow: string | null, period: boolean, raw: unknown) => {
    out.set(date, { date, is_period: period, flow, raw, source: "health-auto-export" });
  };

  // The cycleTracking array mixes record types — menstrual flow, contraceptive,
  // sexual activity, ovulation tests, cervical mucus, basal temp. Only menstrual
  // flow is a period day; everything else must be ignored.
  const isMenstrualName = (name: string) => /menstru|period|flow/.test(name);
  const isOtherCycleName = (name: string) =>
    /contracept|intrauterine|iud|sexual|cervical|ovulation|basal|temperature|symptom|spotting/.test(
      name,
    );

  // 1. Dedicated cycleTracking array.
  const ct = data.cycleTracking;
  if (Array.isArray(ct)) {
    for (const e of ct) {
      if (!e || typeof e !== "object") continue;
      const entry = e as Record<string, unknown>;
      const name = String(entry.name ?? "").toLowerCase().replace(/[\s_]+/g, "");
      if (isOtherCycleName(name)) continue;
      if (name && !isMenstrualName(name)) continue;
      const date = pickDate(entry);
      if (!date) continue;
      const flow = pickFlow(entry);
      if (!isBleed(flow)) continue; // skip "None"/non-bleeding logs
      add(date, flow, true, entry);
    }
  }

  // 2. Menstruation exposed as a metric.
  const metrics = data.metrics;
  if (Array.isArray(metrics)) {
    for (const m of metrics) {
      const metric = m as { name?: string; data?: unknown[] };
      const norm = (metric?.name ?? "").toLowerCase().replace(/[\s_]+/g, "");
      if (!isMenstrualName(norm) || isOtherCycleName(norm)) continue;
      if (!Array.isArray(metric.data)) continue;
      for (const p of metric.data) {
        const point = p as Record<string, unknown>;
        const date = pickDate(point);
        if (!date) continue;
        const flow = pickFlow(point);
        if (!isBleed(flow)) continue;
        add(date, flow, true, point);
      }
    }
  }

  return [...out.values()];
}

function rowFromAgg(date: string, agg: DayAgg, source: string) {
  const row: Record<string, unknown> = { date, source, updated_at: new Date().toISOString() };
  for (const f of NUM_FIELDS) {
    const v = agg[f];
    if (v != null && !Number.isNaN(v)) row[f] = roundField(f, v);
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

    // Health Auto Export nested format: parse metrics (→ hrl_health) and cycle
    // tracking (→ hrl_cycle) from the same payload.
    const hae = body?.data;
    if (hae && typeof hae === "object") {
      let healthCount = 0;
      let healthDates: string[] = [];
      if (Array.isArray(hae.metrics)) {
        const byDate = parseHaeMetrics(hae.metrics);
        const rows = [...byDate.entries()]
          .map(([date, agg]) => rowFromAgg(date, agg, "health-auto-export"))
          .filter((r) => NUM_FIELDS.some((f) => r[f] != null));
        if (rows.length) {
          const { error } = await db.from("hrl_health").upsert(rows, { onConflict: "date" });
          if (error) throw new Error(error.message);
          healthCount = rows.length;
          healthDates = rows.map((r) => r.date as string);
        }
      }

      const cycleRows = parseCycle(hae as Record<string, unknown>);
      if (cycleRows.length) {
        const { error } = await db
          .from("hrl_cycle")
          .upsert(
            cycleRows.map((r) => ({ ...r, raw: r.raw as object, updated_at: new Date().toISOString() })),
            { onConflict: "date" },
          );
        if (error) throw new Error(error.message);
      }

      if (Array.isArray(hae.metrics) || Array.isArray(hae.cycleTracking)) {
        return NextResponse.json({
          ok: true,
          health: { upserted: healthCount, dates: healthDates },
          cycle: { upserted: cycleRows.length, period_days: cycleRows.filter((r) => r.is_period).length },
        });
      }
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
          row[f] = roundField(f, n);
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
