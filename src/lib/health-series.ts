// Turning raw Apple Health readings into something the coach can trust.
//
// The trap this exists to close: Apple Health keeps re-syncing the CURRENT day
// for hours. Sleep only consolidates over the morning, so an 8am read of "last
// night" is routinely a partial block — and the coach once told her she'd slept
// "three hours" off a number that was 8.2h by lunchtime. Same-day HRV and
// resting HR wobble the same way as samples land.
//
// So today is never treated as a settled reading: it's split out, kept out of
// the baseline, and returned with a loud provisional flag. Pure and
// dependency-free so the failure condition can be tested directly.

export type HealthReading = { date: string; value: number };

const round = (n: number) => Math.round(n * 10) / 10;
const mean = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);
function median(ns: number[]): number {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * @param rows newest-first readings for one metric (today may or may not be present)
 * @param today calendar date, YYYY-MM-DD, in the athlete's timezone
 */
export function formatHealthSeries(
  metric: string,
  rows: HealthReading[],
  today: string,
  windowDays: number,
): string {
  if (!rows.length) return `No ${metric} readings in the last ${windowDays} days.`;

  const todayRow = rows[0]?.date === today ? rows[0] : null;
  const settled = todayRow ? rows.slice(1) : rows;

  if (!settled.length) {
    return `${metric}: the only reading in this window is TODAY (${today}, ${round(
      rows[0].value,
    )}), which is PROVISIONAL and still syncing — not a usable number yet. No settled history to compare against.`;
  }

  const values = settled.map((r) => r.value);
  const recent = values.slice(0, 7);

  const provisionalNote =
    metric === "sleep_hours"
      ? "last night's sleep is often only partly recorded this early"
      : "same-day readings settle over the day";

  const stats = [
    `${metric} over the last ${windowDays} days — ${settled.length} settled readings (today excluded).`,
    `Baseline (median): ${round(median(values))}`,
    `Last 7 settled readings mean: ${round(mean(recent))}`,
    `Range — mean: ${round(mean(values))} | min: ${round(Math.min(...values))} | max: ${round(
      Math.max(...values),
    )}`,
    `Most recent COMPLETE reading: ${round(settled[0].value)} on ${settled[0].date}`,
    todayRow
      ? `Today (${today}): ${round(
          todayRow.value,
        )} — ⚠️ PROVISIONAL, still syncing and will likely be revised (${provisionalNote}). Do NOT quote this as a fact or build a recommendation on it; judge recovery from the settled readings and her readiness check-in.`
      : `No reading for today yet.`,
  ].join("\n");

  const series = settled.map((r) => `${r.date}: ${round(r.value)}`).join("\n");
  return `${stats}\n\nSettled daily readings (newest first):\n${series}`;
}
