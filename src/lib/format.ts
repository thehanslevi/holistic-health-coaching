import { SESSIONS, runTraffic, type SessionKey } from "@/lib/program";
import type { ProgramSessions } from "@/lib/program-resolve";
import {
  isRunLog,
  isSessionLog,
  isXtrainLog,
  type LogRow,
  type PreFuel,
  type SessionLogData,
} from "@/lib/types";

// `sessions` defaults to the code template so existing callers are unaffected.
// Pass the RESOLVED program wherever it's available — otherwise sets she logged
// against a coach-added exercise render as nothing at all, because the template
// has no such exercise to iterate.
const FUEL_LABEL: Record<string, string> = {
  protein_carbs: "protein + carbs",
  protein: "protein only",
  carbs: "carbs only",
  nothing: "nothing",
  unsure: "not sure",
};
const TIMING_LABEL: Record<string, string> = {
  "0-30min": "under 30 min before",
  "30-60min": "30–60 min before",
  "60-120min": "1–2 hr before",
  "2h+": "2+ hr before",
};

/** "protein + carbs, 1–2 hr before" — or nothing at all when unrecorded. */
function fuelLine(f: PreFuel | undefined): string | null {
  if (!f?.status) return null;
  const s = FUEL_LABEL[f.status] ?? f.status;
  const t = f.timing ? TIMING_LABEL[f.timing] : null;
  return t ? `${s}, ${t}` : s;
}

function formatSessionLog(data: SessionLogData, sessions: ProgramSessions = SESSIONS): string {
  const session = sessions[data.sessionKey as SessionKey];
  const sessionLabel = session
    ? `${session.label}: ${session.subtitle}`
    : data.sessionKey;
  const rirLabel = (v: number) =>
    v < 0 ? "failed / form broke" : v === 0 ? "0 — nothing left" : `${v}`;
  const fuel = fuelLine(data.preFuel);
  const lines = [
    `SESSION LOG — ${sessionLabel}`,
    `Date: ${data.date}`,
    data.facility ? `Facility: ${data.facility}` : null,
    data.machineNote ? `Machine: ${data.machineNote}` : null,
    data.durationMin != null ? `Duration: ${data.durationMin} min` : null,
    fuel ? `Pre-training fuel: ${fuel}` : null,
    `Knee: ${data.kneeStart}/10 → ${data.kneeEnd}/10`,
    `Bike warm-up: ${data.bikeMin} min`,
    data.sessionRPE != null ? `Session RPE: ${data.sessionRPE}/10` : null,
    data.lastSetRIR != null ? `Last hard set — reps in reserve: ${rirLabel(data.lastSetRIR)}` : null,
    `PT Circuit: ${data.ptDone ? "Done" : "Not logged"}`,
    `Exercise Therapy: ${data.exerciseTherapyDone ? "Done" : "Not logged"}`,
    "---",
  ].filter(Boolean) as string[];
  if (session) {
    session.exercises.forEach((ex) => {
      const setStrs = Array.from({ length: ex.sets }, (_, i) => {
        const s = data.sets[`${ex.id}_s${i}`] || {};
        if (ex.timed) {
          return s.duration
            ? `Set ${i + 1}: ${s.duration}${ex.weighted && s.weight ? ` × ${s.weight} lbs` : ""}`
            : null;
        }
        // Assistance is spelled out, never as "× N lbs" — the machine is taking
        // weight off her, and a reader who mistakes the two reads progress
        // backwards.
        if (ex.loadType === "assistance") {
          return s.reps || s.assistWeight
            ? `Set ${i + 1}: ${s.reps ?? "?"} reps${
                s.assistWeight ? ` × ${s.assistWeight} lb assistance` : " (assistance not logged)"
              }`
            : null;
        }
        return s.reps || s.weight
          ? `Set ${i + 1}: ${s.reps ?? "?"}${ex.weighted !== false ? ` reps × ${s.weight ?? "?"} lbs` : " reps"}`
          : null;
      }).filter(Boolean);
      if (setStrs.length) lines.push(`${ex.name}: ${setStrs.join(" | ")}`);
    });
  }
  lines.push("---");
  if (data.cooldownCount)
    lines.push(`Cooldown: ${data.cooldownCount}/${data.cooldownTotal} done`);
  if (data.notes) lines.push(`Notes: ${data.notes}`);
  return lines.join("\n");
}

export function formatLogAsText(row: LogRow, sessions: ProgramSessions = SESSIONS): string {
  if (isXtrainLog(row)) {
    const d = row.data;
    return [
      `CROSS-TRAINING LOG — ${d.modality}`,
      `Date: ${d.date}`,
      d.duration ? `Duration: ${d.duration} min` : null,
      d.intensity ? `Intensity: ${d.intensity}` : null,
      fuelLine(d.preFuel) ? `Pre-training fuel: ${fuelLine(d.preFuel)}` : null,
      d.notes ? `Notes: ${d.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (isRunLog(row)) {
    const d = row.data;
    const traffic = runTraffic(d.run_am_knee, d.run_am_ankle);
    const fuel = fuelLine(d.preFuel);
    const surface = [d.run_surface, d.run_terrain].filter(Boolean).join(", ");
    return [
      "RUN LOG",
      `Date: ${d.run_date}`,
      d.run_type ? `Run type: ${d.run_type}` : null,
      `Distance: ${d.run_dist} miles | Time: ${d.run_time}`,
      surface ? `Surface: ${surface}` : null,
      fuel ? `Pre-run fuel: ${fuel}` : null,
      `During — Left knee: ${d.run_knee_end}/10 | Right ankle: ${d.run_ankle}/10`,
      d.run_gait_change != null
        ? `Gait change mid-run: ${d.run_gait_change ? "YES" : "no"}`
        : null,
      `Next AM — Left knee: ${d.run_am_knee}/10 | Right ankle: ${d.run_am_ankle}/10`,
      d.run_am_stiffness ? `Next-AM ankle stiffness: ${d.run_am_stiffness}` : null,
      d.run_protocol_done != null
        ? `Post-run protocol: ${d.run_protocol_done ? "done" : "not done"}`
        : null,
      `Status: ${traffic.label}`,
      d.run_notes ? `Notes: ${d.run_notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (isSessionLog(row)) return formatSessionLog(row.data, sessions);
  return JSON.stringify(row.data);
}
