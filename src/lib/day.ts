// What day is it for the athlete?
//
// There was no single answer to that, and the app quietly disagreed with itself.
// Her phone computes dates with local getters (Eastern, correct). The server
// computes them with `new Date()` and `toISOString()` — and Vercel runs in UTC.
// So every evening after 8pm Eastern the server rolled over to tomorrow while
// her phone hadn't: at 8:24pm on Tuesday 14 July the server called it Wednesday
// the 15th, and put the start of the week on Tuesday the 14th instead of Monday
// the 13th. Her weekly review looked at the wrong week and came back empty.
//
// Everything server-side that needs "now" resolves it here, in her timezone.
//
// Calendar dates (YYYY-MM-DD) are anchored at NOON UTC before any arithmetic.
// Noon is far enough from both midnights that no offset can push the date across
// a day boundary, so day-of-week and day-shifting stay correct regardless of
// where the code runs.

const TZ = process.env.ATHLETE_TZ ?? "America/New_York";

/** Today's calendar date in the athlete's timezone, as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Safe anchor for arithmetic on a calendar date. */
function at(dateISO: string): Date {
  return new Date(`${dateISO}T12:00:00Z`);
}

/** Weekday of a calendar date, MON=0 … SUN=6. */
export function weekdayIndex(dateISO: string = todayISO()): number {
  return (at(dateISO).getUTCDay() + 6) % 7;
}

/** Is this calendar date a Sunday (Shabbat / planned rest)? */
export function isSunday(dateISO: string = todayISO()): boolean {
  return at(dateISO).getUTCDay() === 0;
}

/** The Monday of the week containing this calendar date. */
export function mondayOf(dateISO: string = todayISO()): string {
  const d = at(dateISO);
  d.setUTCDate(d.getUTCDate() - weekdayIndex(dateISO));
  return d.toISOString().slice(0, 10);
}

/** N days before a calendar date (defaults to N days before today). */
export function daysAgoISO(n: number, from: string = todayISO()): string {
  const d = at(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** N days after a calendar date. */
export function daysAfterISO(n: number, from: string = todayISO()): string {
  return daysAgoISO(-n, from);
}
