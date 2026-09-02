// Deterministic lint for the morning brief — the checks a human reader would
// make in two seconds, run before the brief is saved. The model-side rules in
// brief.ts say "never"; this is what makes "never" enforceable. Every violation
// names the class of bug so the same class can't ship twice unnoticed.
//
// Pure: takes the text and the context it was written from, returns violations.
// Used inline (brief.ts regenerates once on failure) and by the eval harness.

export type Violation = { rule: string; detail: string };

const FILLER = [
  "stop short",
  "don't grind",
  "do not grind",
  "stay strong",
  "trust the process",
  "keep it clean",
  "protect the ankle",
  "show up",
  "you've got this",
  "you got this",
  "listen to your body",
  "consistency is key",
  "one day at a time",
];

// Time-pressure hedges only. A cardio dose ("Zone 2, 30–40 min") is a real
// prescription and stays legal; "skip X if you run out of time" is not.
const LOGISTICS = [
  /run(s)? out of time/i,
  /if time is (short|tight)/i,
  /short on time/i,
  /if you('re| are) (pressed|rushed)/i,
  /\b(skip|drop|cut|trim)\b[^.]{0,60}\b(if|when)\b[^.]{0,30}\b(time|minutes|late|rushed)\b/i,
];

const WEEKDAYS = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

/** Loads named in the NEXT STRENGTH SESSION block ("@ 95 lbs" → 95). */
function prescribedLoads(context: string): Set<number> {
  const block = context.split("NEXT STRENGTH SESSION")[1] ?? "";
  const out = new Set<number>();
  for (const m of block.matchAll(/@\s*(\d+(?:\.\d+)?)/g)) out.add(Number(m[1]));
  return out;
}

/** Loads the brief asserts ("@ 95", "at 95", "95 lb"). */
function assertedLoads(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?:@|\bat)\s*(\d{2,3})(?:\s*(?:lb|lbs))?\b/gi)) out.push(Number(m[1]));
  for (const m of text.matchAll(/\b(\d{2,3})\s*(?:lb|lbs)\b/gi)) out.push(Number(m[1]));
  return out;
}

export function guardBrief(text: string, context: string, readiness: string | null): Violation[] {
  const v: Violation[] = [];
  const t = text.trim();
  const lower = t.toLowerCase();

  // Length: it lands on a lock screen.
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words > 48) v.push({ rule: "length", detail: `${words} words (cap 40)` });

  for (const f of FILLER) {
    if (lower.includes(f)) v.push({ rule: "filler", detail: `"${f}"` });
  }

  for (const re of LOGISTICS) {
    const m = t.match(re);
    if (m) v.push({ rule: "invented-logistics", detail: `"${m[0]}"` });
  }

  // Telling her to skip exercises is only legitimate on a Low readiness day.
  // ("Drop assist one notch" / "drop a set on yellow" are load/volume calls the
  // prompt itself sanctions — only outright skipping is gated.)
  if (/\b(skip|leave out)\b/i.test(t) && readiness !== "low" && readiness !== "red") {
    v.push({ rule: "skip-without-low-readiness", detail: `readiness=${readiness ?? "none"}` });
  }

  // "3×10, 12" — a rep RANGE rendered as a list (the voice pass used to do this).
  // Ambiguous on a lock screen; must read "3×10-12".
  const garbled = t.match(/\d\s*[×x]\s*\d{1,2},\s*\d{1,2}\b/);
  if (garbled) v.push({ rule: "garbled-range", detail: `"${garbled[0]}"` });

  const wd = t.match(WEEKDAYS);
  if (wd) v.push({ rule: "weekday", detail: `"${wd[0]}"` });

  // Every load the brief asserts must be one this session actually prescribes.
  // Catches the L1-load-on-L2-day class ("RDL stays at 150" on a 95 day).
  const prescribed = prescribedLoads(context);
  if (prescribed.size) {
    for (const n of assertedLoads(t)) {
      if (!prescribed.has(n)) v.push({ rule: "load-not-in-session", detail: `${n} not in {${[...prescribed].join(",")}}` });
    }
  }

  // Same-day health numbers are provisional; the brief must not quote one.
  if (/\bhrv\s*(?:of|at|is|was)?\s*\d{2}\b/i.test(t)) v.push({ rule: "same-day-number", detail: "HRV figure" });
  if (/\bslept\s*\d/i.test(t) || /\b\d(\.\d)?\s*h(ours)?\s+(of\s+)?sleep\b/i.test(t)) {
    v.push({ rule: "same-day-number", detail: "sleep figure" });
  }

  return v;
}

export function violationsSummary(v: Violation[]): string {
  return v.map((x) => `${x.rule}: ${x.detail}`).join("; ");
}
