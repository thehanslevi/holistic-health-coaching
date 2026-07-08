import { PHASE } from "@/lib/program";
import { supabase } from "@/lib/supabase";
import type { Phase } from "@/lib/types";

// Server-only phase access. program.ts remains the base template (sessions,
// exercises, coach notes); a phase carries the metadata that used to be
// hardcoded (PHASE, PHASE_DATES) plus the working-target overrides.
// Pure display helpers live in lib/phase-format.ts (client-safe).

// Fallback phase synthesized from program.ts, used before any row exists.
function fallbackPhase(): Phase {
  const m = PHASE.match(/^Phase\s+(\d+):\s*(.+)$/i);
  return {
    id: "seed",
    phase_number: m ? Number(m[1]) : 1,
    name: m ? m[2] : PHASE,
    focus: null,
    started_on: "2026-05-22",
    ended_on: null,
    status: "active",
    created_at: new Date().toISOString(),
  };
}

export async function getActivePhase(): Promise<Phase> {
  const { data } = await supabase()
    .from("hrl_phases")
    .select("*")
    .eq("status", "active")
    .maybeSingle();
  return (data as Phase | null) ?? fallbackPhase();
}
