import { isRunLog, type HealthRow, type LogRow } from "@/lib/types";

// Retrospective pattern observations mined from her own history. Each insight
// only fires when there's enough data to be honest about it (sample-size guards),
// and everything stays in the energy / performance / recovery frame — never
// aesthetics, never restriction.

export type Insight = { title: string; text: string; tone: "neutral" | "good" | "watch" };

const avg = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

export function computeInsights(logs: LogRow[], health: HealthRow[]): Insight[] {
  const out: Insight[] = [];

  // 1. Resting HR trend — last 7 days vs the 7 before (early fatigue signal).
  const rhr = health
    .filter((h) => h.resting_hr != null)
    .map((h) => ({ date: h.date, v: h.resting_hr as number }))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (rhr.length >= 9) {
    const recent = rhr.slice(0, 7).map((x) => x.v);
    const prior = rhr.slice(7, 14).map((x) => x.v);
    if (prior.length >= 4) {
      const d = Math.round(avg(recent) - avg(prior));
      if (d >= 2) {
        out.push({
          title: "Resting HR is creeping up",
          text: `Your resting heart rate is up about ${d} bpm this week (${Math.round(avg(recent))} vs ${Math.round(avg(prior))}). That's often an early under-recovery sign — a cue to protect sleep and keep easy days easy.`,
          tone: "watch",
        });
      } else if (d <= -2) {
        out.push({
          title: "Resting HR is settling",
          text: `Your resting heart rate is down about ${Math.abs(d)} bpm this week (${Math.round(avg(recent))} vs ${Math.round(avg(prior))}) — a good sign your recovery is catching up.`,
          tone: "good",
        });
      }
    }
  }

  // 2. HRV ↔ sleep — does more sleep show up in recovery?
  const paired = health
    .filter((h) => h.hrv != null && h.sleep_hours != null)
    .map((h) => ({ hrv: h.hrv as number, sleep: h.sleep_hours as number }));
  if (paired.length >= 7) {
    const good = paired.filter((p) => p.sleep >= 7).map((p) => p.hrv);
    const short = paired.filter((p) => p.sleep < 6.5).map((p) => p.hrv);
    if (good.length >= 3 && short.length >= 3) {
      const gd = Math.round(avg(good));
      const sd = Math.round(avg(short));
      if (gd - sd >= 3) {
        out.push({
          title: "Sleep shows up in your HRV",
          text: `After nights of 7h+, your HRV averages ${gd} ms — versus ${sd} on nights under 6.5h. Sleep is doing measurable work on your recovery.`,
          tone: "good",
        });
      }
    }
  }

  // 3. Sleep ↔ next-morning joint response on runs.
  const sleepByDate = new Map(
    health.filter((h) => h.sleep_hours != null).map((h) => [h.date, h.sleep_hours as number]),
  );
  const scored: { sleep: number; pain: number }[] = [];
  for (const r of logs) {
    if (!isRunLog(r)) continue;
    const amKnee = Number(r.data.run_am_knee) || 0;
    const amAnkle = Number(r.data.run_am_ankle) || 0;
    if (amKnee === 0 && amAnkle === 0) continue;
    const s = sleepByDate.get(r.logged_at);
    if (s == null) continue;
    scored.push({ sleep: s, pain: Math.max(amKnee, amAnkle) });
  }
  if (scored.length >= 4) {
    const low = scored.filter((x) => x.sleep < 6.5).map((x) => x.pain);
    const ok = scored.filter((x) => x.sleep >= 6.5).map((x) => x.pain);
    if (low.length >= 2 && ok.length >= 2) {
      const ld = avg(low);
      const od = avg(ok);
      if (ld - od >= 1) {
        out.push({
          title: "Short sleep, louder joints",
          text: `On runs after under 6.5h sleep, your next-morning knee/ankle scores average ${ld.toFixed(1)} — versus ${od.toFixed(1)} on better-slept nights. Sleep looks like a lever on your joint response, not just your energy.`,
          tone: "watch",
        });
      }
    }
  }

  return out;
}
