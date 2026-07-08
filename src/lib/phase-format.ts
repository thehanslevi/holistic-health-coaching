import { PHASE_DATES } from "@/lib/program";
import type { Phase } from "@/lib/types";

// Pure, client-safe phase display helpers (no server imports).

/** "Phase 3: Hybrid Athlete — …" — the display string that replaces the PHASE constant. */
export function phaseLabel(p: Phase): string {
  return `Phase ${p.phase_number}: ${p.name}`;
}

/** Human date range, e.g. "May 22, 2026 – present". */
export function phaseDateRange(p: Phase): string {
  if (p.id === "seed") return PHASE_DATES;
  const fmt = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(p.started_on)} – ${p.ended_on ? fmt(p.ended_on) : "present"}`;
}

/** 1-based training week within the phase. */
export function phaseWeek(p: Phase, now = new Date()): number {
  const start = new Date(p.started_on + "T00:00:00");
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return Math.max(1, Math.floor(days / 7) + 1);
}
