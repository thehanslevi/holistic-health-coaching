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

const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: "Menstrual",
  follicular: "Follicular",
  ovulatory: "Ovulatory",
  luteal: "Luteal",
  unknown: "Cycle",
};

export function deriveCycleState(
  days: CycleDay[],
  today = new Date().toISOString().slice(0, 10),
): CycleState {
  const starts = periodStarts(days).filter((s) => s <= today);
  const bleedingToday = days.some((d) => d.date === today && d.is_period);

  if (starts.length === 0) {
    return {
      lastStart: null,
      cycleDay: null,
      phase: bleedingToday ? "menstrual" : "unknown",
      approximate: !bleedingToday,
      avgLength: null,
      bleedingToday,
      label: bleedingToday ? "Menstrual" : "Cycle — no data yet",
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
      label: `Menstrual · day ${cycleDay}`,
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
  const label =
    phase === "unknown"
      ? `~day ${cycleDay} · period may be near`
      : `${PHASE_LABEL[phase]} · ~day ${cycleDay}`;

  return { lastStart, cycleDay, phase, approximate, avgLength, bleedingToday, label };
}

/** One-line coach-facing summary of the current cycle state. */
export function cycleContextLine(s: CycleState): string | null {
  if (!s.lastStart && !s.bleedingToday) return null;
  const parts: string[] = [];
  if (s.bleedingToday) {
    parts.push(`Menstruating now (cycle day ${s.cycleDay ?? "?"})`);
  } else {
    parts.push(
      `Estimated ${s.phase} phase, ~cycle day ${s.cycleDay} (APPROXIMATE — cycle is irregular)`,
    );
  }
  if (s.lastStart) parts.push(`last period started ${s.lastStart}`);
  if (s.avgLength) parts.push(`recent avg cycle ~${s.avgLength} days`);
  return parts.join("; ") + ".";
}
