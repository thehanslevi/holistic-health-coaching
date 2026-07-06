import { SESSIONS, runTraffic, type SessionKey } from "@/lib/program";
import {
  isRunLog,
  isSessionLog,
  isXtrainLog,
  type LogRow,
  type SessionLogData,
} from "@/lib/types";

function formatSessionLog(data: SessionLogData): string {
  const session = SESSIONS[data.sessionKey as SessionKey];
  const sessionLabel = session
    ? `${session.label}: ${session.subtitle}`
    : data.sessionKey;
  const lines = [
    `SESSION LOG — ${sessionLabel}`,
    `Date: ${data.date}`,
    `Knee: ${data.kneeStart}/10 → ${data.kneeEnd}/10`,
    `Bike warm-up: ${data.bikeMin} min`,
    `PT Circuit: ${data.ptDone ? "Done" : "Not logged"}`,
    `Exercise Therapy: ${data.exerciseTherapyDone ? "Done" : "Not logged"}`,
    "---",
  ];
  if (session) {
    session.exercises.forEach((ex) => {
      const setStrs = Array.from({ length: ex.sets }, (_, i) => {
        const s = data.sets[`${ex.id}_s${i}`] || {};
        if (ex.timed) {
          return s.duration
            ? `Set ${i + 1}: ${s.duration}${ex.weighted && s.weight ? ` × ${s.weight} lbs` : ""}`
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

export function formatLogAsText(row: LogRow): string {
  if (isXtrainLog(row)) {
    const d = row.data;
    return [
      `CROSS-TRAINING LOG — ${d.modality}`,
      `Date: ${d.date}`,
      d.duration ? `Duration: ${d.duration} min` : null,
      d.intensity ? `Intensity: ${d.intensity}` : null,
      d.notes ? `Notes: ${d.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (isRunLog(row)) {
    const d = row.data;
    const traffic = runTraffic(d.run_am_knee, d.run_am_ankle);
    return [
      "RUN LOG",
      `Date: ${d.run_date}`,
      `Distance: ${d.run_dist} miles | Time: ${d.run_time}`,
      `During — Left knee: ${d.run_knee_end}/10 | Right ankle: ${d.run_ankle}/10`,
      `Next AM — Left knee: ${d.run_am_knee}/10 | Right ankle: ${d.run_am_ankle}/10`,
      `Status: ${traffic.label}`,
      d.run_notes ? `Notes: ${d.run_notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (isSessionLog(row)) return formatSessionLog(row.data);
  return JSON.stringify(row.data);
}
