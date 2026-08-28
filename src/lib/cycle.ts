// Menstrual cycle phase derivation. Apple Health stores period/flow days as
// events, not a phase label — phase is derived here from the most recent
// period start plus a learned average cycle length. Pure + client-safe.
//
// The athlete's cycle is irregular, so a bleeding day is always treated as
// ground truth (menstrual), and any *estimated* phase between periods is
// flagged approximate rather than asserted precisely.

export type CycleDay = { date: string; is_period: boolean; flow: string | null };

export type CyclePhase = "menstrual" | "follicular" | "ovulatory" | "luteal" | "unknown";

export type CycleState = {
  lastStart: string | null;
  cycleDay: number | null;
  phase: CyclePhase;
  approximate: boolean;
  avgLength: number | null;
  bleedingToday: boolean;
  label: string; // e.g. "Luteal · ~day 22" or "Menstrual · day 2"
  /** Date of the most recent cycle data point, so the estimate can be judged on
   *  its OWN freshness — not on whether some other pipeline (health) is current. */
  dataThrough: string | null;
};

const DAY = 86400000;
const MENSTRUAL_DAYS = 5; // typical bleed length used only as a coarse fallback

function toDate(d: string): number {
  return new Date(d + "T12:00:00").getTime();
}

function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b) - toDate(a)) / DAY);
}

/** Period-start dates: a bleeding day with no bleeding day in the prior ~3 days. */
function periodStarts(days: CycleDay[]): string[] {
  const bleed = days
    .filter((d) => d.is_period)
    .map((d) => d.date)
    .sort();
  const starts: string[] = [];
  for (let i = 0; i < bleed.length; i++) {
    if (i === 0 || daysBetween(bleed[i - 1], bleed[i]) > 3) starts.push(bleed[i]);
  }
  return starts;
}


export function deriveCycleState(
  days: CycleDay[],
  today = new Date().toISOString().slice(0, 10),
): CycleState {
  const starts = periodStarts(days).filter((s) => s <= today);
  const bleedingToday = days.some((d) => d.date === today && d.is_period);
  const dataThrough = days.reduce<string | null>((m, d) => (m == null || d.date > m ? d.date : m), null);

  if (starts.length === 0) {
    return {
      lastStart: null,
      cycleDay: null,
      phase: bleedingToday ? "menstrual" : "unknown",
      approximate: !bleedingToday,
      avgLength: null,
      bleedingToday,
      label: bleedingToday ? "Menstrual" : "Cycle — no data yet",
      dataThrough,
    };
  }

  const lastStart = starts[starts.length - 1];
  const cycleDay = daysBetween(lastStart, today) + 1;

  // Learn average cycle length from her own history (gaps between starts).
  let avgLength: number | null = null;
  if (starts.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < starts.length; i++) gaps.push(daysBetween(starts[i - 1], starts[i]));
    const recent = gaps.slice(-6);
    avgLength = Math.round(recent.reduce((s, g) => s + g, 0) / recent.length);
  }

  // Bleeding today is ground truth. Otherwise estimate, always approximate.
  if (bleedingToday) {
    return {
      lastStart,
      cycleDay,
      phase: "menstrual",
      approximate: false,
      avgLength,
      bleedingToday,
      label: `Period · day ${cycleDay}`,
      dataThrough,
    };
  }

  const len = avgLength ?? 28;
  const ovulation = Math.max(10, len - 14); // luteal phase is ~14 days
  let phase: CyclePhase;
  if (cycleDay <= MENSTRUAL_DAYS) phase = "menstrual";
  else if (cycleDay < ovulation - 1) phase = "follicular";
  else if (cycleDay <= ovulation + 1) phase = "ovulatory";
  else if (cycleDay <= len + 3) phase = "luteal";
  else phase = "unknown"; // overdue — past the expected length

  const approximate = true; // irregular cycle: never assert an estimated phase
  // De-emphasize the (weak) phase name in the UI; show where she is in the cycle.
  const label =
    phase === "unknown" ? `Cycle · ~day ${cycleDay} · period may be near` : `Cycle · ~day ${cycleDay}`;

  return { lastStart, cycleDay, phase, approximate, avgLength, bleedingToday, label, dataThrough };
}

/**
 * Short UI chip, e.g. "luteal ~d23" or "period d2". Surfaces the textbook phase
 * name (the chosen model) as one modest factor among sleep/HRV/RHR, never a
 * headline. Returns null when there's no cycle data to show.
 */
export function cycleChip(s: CycleState): string | null {
  if (s.bleedingToday && s.cycleDay != null) return `period d${s.cycleDay}`;
  if (s.phase === "unknown" || s.cycleDay == null) return s.bleedingToday ? "period" : null;
  return `${s.phase} ~d${s.cycleDay}`;
}

/**
 * One plain line of what the current phase means for training TODAY — the "so
 * what" the bare chip can't carry. Shown once under the factor row (chip stays
 * uniform beside sleep/HRV/RHR), so the phase is factored in without becoming a
 * headline. Always flagged as an estimate; how she feels overrides it. Returns
 * null on a bleeding day (the period signal strip already covers that) and when
 * there's no usable phase.
 */
export function cyclePractical(s: CycleState): string | null {
  if (s.bleedingToday) return null;
  if (s.phase === "unknown" || s.cycleDay == null) return null;
  const byPhase: Record<Exclude<CyclePhase, "unknown">, string> = {
    menstrual: "Early in your cycle. Ease in, train normal if you feel good.",
    follicular: "Good window to push or go for a PR.",
    ovulatory: "Strength often peaks. Good day for a hard effort.",
    luteal: "Fuel a bit more and skip max attempts. You may feel it more.",
  };
  return `${byPhase[s.phase]} Estimate; how you feel wins.`;
}

/**
 * One-line coach-facing cycle summary, textbook follicular/luteal model. Fed to
 * the coach every day there's cycle data so the phase can inform the week's
 * emphasis — but always flagged as an estimate on an irregular cycle, with how
 * she feels overriding it for the day.
 */
export function cycleContextLine(s: CycleState): string | null {
  if (s.bleedingToday) {
    return `Menstruating (period day ${s.cycleDay ?? "?"}). Energy is often lowest the first day or two: lighter is fine if she's low, otherwise train as normal.`;
  }
  if (s.phase === "unknown" || s.cycleDay == null) return null;
  const byPhase: Record<Exclude<CyclePhase, "unknown">, string> = {
    menstrual: `Likely early in the cycle (~day ${s.cycleDay}).`,
    follicular: `Likely follicular (~day ${s.cycleDay}). Recovery and strength tolerance are good, a window to push intensity or attempt a PR.`,
    ovulatory: `Likely around ovulation (~day ${s.cycleDay}). Strength often peaks; good for a hard effort.`,
    luteal: `Likely luteal (~day ${s.cycleDay}). Perceived exertion runs higher and recovery is a little slower: favor volume and technique over maxes, and skip max attempts in late luteal.`,
  };
  return `${byPhase[s.phase]} Phase is an estimate on an irregular cycle; how she feels overrides it for the day.`;
}
