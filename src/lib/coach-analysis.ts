import {
  computeConsistency,
  loggedExercises,
  progression,
  ptCompliance,
  runSeries,
} from "@/lib/analytics";
import { runTraffic } from "@/lib/program";
import { isSessionLog, type HealthRow, type LogRow } from "@/lib/types";

// Pre-computes the findings a coach's eye catches — trends, mismatches, flags —
// so the model can INTERPRET and PRESCRIBE instead of reading the log back. This
// is the difference between a recap and real coaching insight.

const LOWER_IDS = new Set([
  "l1_leg_press",
  "l1_leg_ext",
  "l1_rdl",
  "l1_leg_curl",
  "l2_rdl",
  "l2_rev_lunge",
  "l2_leg_curl",
  "l2_glute_brdg",
]);

const avg = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * A structured findings packet for the coach to interpret. Not shown to the
 * athlete — it's the analytical substrate behind the brief and weekly review.
 */
export function buildCoachAnalysis(logs: LogRow[], health: HealthRow[]): string {
  const thisWeek = mondayOf(new Date().toISOString().slice(0, 10));
  const out: string[] = [
    "COMPUTED ANALYSIS — findings from her own data. Interpret and prioritize these; do NOT read them back to her. She already knows her numbers. Your job is what they mean and what to do.",
  ];

  // ── Strength trends per lift ──
  const exs = loggedExercises(logs);
  const strengthLines: string[] = [];
  let lowerClimbing = false;
  let lowerClimbDetail = "";
  for (const ex of exs) {
    const pts = progression(logs, ex.id);
    if (!pts.length) continue;
    const recent = pts.slice(-4);
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;
    const dir =
      last > first
        ? `${first}→${last} lb (up ${last - first})`
        : last < first
          ? `${first}→${last} lb (down ${first - last})`
          : `flat at ${last} lb`;
    strengthLines.push(`${ex.name}: ${dir} over last ${recent.length} logged`);
    const exId = ex.id;
    if (LOWER_IDS.has(exId) && recent.length >= 2 && last > first) {
      lowerClimbing = true;
      if (!lowerClimbDetail) lowerClimbDetail = `${ex.name} ${first}→${last}`;
    }
  }
  if (strengthLines.length) {
    out.push("", "STRENGTH:");
    strengthLines.slice(0, 8).forEach((s) => out.push(`- ${s}`));
  }

  // ── Runs + joint response ──
  const runs = runSeries(logs).slice(-4);
  let anyFlag = false;
  if (runs.length) {
    out.push("", "RUN + JOINTS:");
    for (const r of runs) {
      const t = runTraffic(r.amKnee, r.amAnkle);
      if (r.amKnee >= 3 || r.amAnkle >= 3) anyFlag = true;
      out.push(
        `- ${r.date}: ${r.dist || "?"} mi, next-AM knee ${r.amKnee}/ankle ${r.amAnkle} (${t.light})`,
      );
    }
  }

  // ── The key mismatch: strength outpacing joint readiness for running ──
  if (lowerClimbing && anyFlag) {
    out.push(
      "",
      `MISMATCH FLAG: lower-body strength is climbing (${lowerClimbDetail}) while her knee/ankle still flags after runs. Her lifting is progressing faster than her tendon/joint tolerance for running. This is likely the most important thing this week: the muscle is ready, the joint is not. Do not let run volume chase the strength.`,
    );
  }

  // ── Adherence + the muscle-protection lens ──
  const sessionsThisWeek = logs.filter(
    (l) => isSessionLog(l) && mondayOf(l.logged_at) === thisWeek,
  ).length;
  const c = computeConsistency(logs);
  out.push("", "ADHERENCE:");
  out.push(
    `- ${sessionsThisWeek} strength sessions this week (target ~4-5). Current streak ${c.streak} days, best ${c.bestStreak}.`,
  );
  const pt = ptCompliance(logs).find((p) => p.week === thisWeek);
  if (pt) out.push(`- PT circuit done in ${pt.value}% of this week's sessions.`);
  if (sessionsThisWeek > 0 && sessionsThisWeek < 3) {
    out.push(
      "- MUSCLE-PROTECTION FLAG: under 3 lifting sessions this week is below the muscle-protection threshold given her medical context. This matters more than any single lift number.",
    );
  }

  // ── Recovery trends ──
  const sleep = health.filter((h) => h.sleep_hours != null).map((h) => h.sleep_hours as number);
  const hrv = health.filter((h) => h.hrv != null).map((h) => h.hrv as number);
  const rhr = health.filter((h) => h.resting_hr != null).map((h) => h.resting_hr as number);
  const rec: string[] = [];
  if (sleep.length >= 3) rec.push(`sleep averaging ${avg(sleep.slice(0, 7)).toFixed(1)}h`);
  if (hrv.length >= 3) rec.push(`HRV around ${Math.round(avg(hrv.slice(0, 7)))} ms`);
  if (rhr.length >= 6) {
    const recent = Math.round(avg(rhr.slice(0, 7)));
    const prior = Math.round(avg(rhr.slice(7, 14)));
    const arrow = recent > prior + 1 ? " (trending up — watch recovery)" : recent < prior - 1 ? " (trending down — recovering well)" : "";
    rec.push(`resting HR ~${recent}${arrow}`);
  }
  if (rec.length) {
    out.push("", "RECOVERY:");
    out.push(`- ${rec.join(", ")}.`);
  }

  return out.join("\n");
}
