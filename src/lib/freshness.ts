// Workstream #4 — freshness as one shared rule instead of per-surface patches.
//
// Every data-derived fact in the app (health, cycle, baselines) has an "as of"
// date and should degrade gracefully when it goes stale. This centralizes the
// two error-prone parts: computing the age in LOCAL calendar days (never
// toISOString(), which rolls to tomorrow in the evening and caused a real
// counting bug), and the stale threshold. Pure + client/server safe.

/** Local YYYY-MM-DD for a Date, from local parts (not UTC). */
export function localTodayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

const parseLocal = (iso: string): number => new Date(`${iso}T12:00:00`).getTime();

/** Whole calendar days between `dateISO` and `today` (today − date). Null if unparseable. */
export function ageInDays(dateISO: string | null | undefined, today: string = localTodayISO()): number | null {
  if (!dateISO) return null;
  const a = parseLocal(today);
  const b = parseLocal(dateISO);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

export type Freshness = {
  /** Age of the reading in days, or null when there's no date. */
  ageDays: number | null;
  /** True once the reading is at/over the stale threshold (or missing entirely). */
  stale: boolean;
};

/**
 * How fresh a dated reading is against a staleness window. Missing data is
 * treated as stale — we never have a fresh fact without a date behind it.
 */
export function freshness(
  dateISO: string | null | undefined,
  staleAfterDays: number,
  today: string = localTodayISO(),
): Freshness {
  const ageDays = ageInDays(dateISO, today);
  return { ageDays, stale: ageDays == null || ageDays >= staleAfterDays };
}
