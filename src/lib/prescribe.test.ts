// Run: npm test  (node --test, no test framework dependency)
//
// The case that prompted these: on 2026-07-17 an L2 hypertrophy day
// (3 × 10–12 @ 95 lb) was pre-loaded with 145 lb — the L1 strength load logged
// on 07-13. A max-strength load offered for high-rep work.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepRange, parseTargetWeight, prescribeSet } from "./prescribe.ts";

// Real prescriptions from src/lib/program.ts
const L1_RDL = { sets: 4, reps: "6 reps", target: "145 lbs" };
const L2_RDL = { sets: 3, reps: "10–12 reps", target: "95 lbs" };
const L1_HIP_THRUST = { sets: 4, reps: "8–10 reps", target: "Loaded" };
const L2_REV_LUNGE = { sets: 3, reps: "10 each leg", target: "Bodyweight → DBs" };
const L1_LEG_PRESS = { sets: 4, reps: "12 reps", target: "235 lbs" };
const U1_PULLUP = {
  sets: 4,
  reps: "4–6 reps",
  target: "55 lb assist",
  weighted: false,
  loadType: "assistance" as const,
};
const BALANCE = { sets: 3, reps: "45 sec each leg", target: "Eyes closed", weighted: false, timed: true };

// ── parsing ──────────────────────────────────────────────────────────────────

test("parses rep prescriptions, including ranges and per-side work", () => {
  assert.deepEqual(parseRepRange("6 reps"), { min: 6, max: 6 });
  assert.deepEqual(parseRepRange("10–12 reps"), { min: 10, max: 12 }); // en dash
  assert.deepEqual(parseRepRange("8-10 reps"), { min: 8, max: 10 }); // hyphen
  assert.deepEqual(parseRepRange("12 each side"), { min: 12, max: 12 });
  assert.equal(parseRepRange("45 sec each leg"), null);
});

test("target weight takes the low end of a range and ignores qualitative targets", () => {
  assert.equal(parseTargetWeight("145 lbs"), 145);
  assert.equal(parseTargetWeight("75–85 lbs"), 75); // conservative end
  assert.equal(parseTargetWeight("Loaded"), null);
  assert.equal(parseTargetWeight("Bodyweight → DBs"), null);
  assert.equal(parseTargetWeight("55 lb assist"), null); // assistance is not load
});

// ── 1. RDL strength load is not reused for hypertrophy ───────────────────────

test("RDL: a 145 lb strength load is NOT carried into 3 × 10–12 hypertrophy work", () => {
  const p = prescribeSet({
    exercise: L2_RDL,
    previous: { reps: "6", weight: "145" }, // the L1 strength effort
  });
  assert.notEqual(p.weight, "145");
  assert.equal(p.weight, "95"); // falls back to the programmed hypertrophy target
  assert.equal(p.source, "reduced-for-reps");
});

test("RDL: the exact 2026-07-17 regression — 145 lb × 8 offered against 10–12", () => {
  const p = prescribeSet({ exercise: L2_RDL, previous: { reps: "8", weight: "145" } });
  assert.equal(p.weight, "95");
  assert.ok(Number(p.weight) < 145);
});

test("RDL: a matching strength effort IS carried on the strength day", () => {
  const p = prescribeSet({ exercise: L1_RDL, previous: { reps: "6", weight: "145" } });
  assert.equal(p.weight, "145");
  assert.equal(p.source, "previous");
});

test("RDL: a hypertrophy load that met the rep range is carried forward", () => {
  const p = prescribeSet({ exercise: L2_RDL, previous: { reps: "12", weight: "95" } });
  assert.equal(p.weight, "95");
  assert.equal(p.source, "previous");
});

// ── 2. Reverse lunge adjusts by rep range ────────────────────────────────────

test("reverse lunge: load carries when the prior set met the prescribed reps", () => {
  const p = prescribeSet({ exercise: L2_REV_LUNGE, previous: { reps: "10", weight: "15" } });
  assert.equal(p.weight, "15");
  assert.equal(p.source, "previous");
});

test("reverse lunge: raising the rep prescription drops the carried load", () => {
  const p = prescribeSet({
    exercise: { ...L2_REV_LUNGE, reps: "15 each leg" },
    previous: { reps: "10", weight: "15" }, // 10 reps' worth of load, 15 now asked
  });
  assert.equal(p.weight, undefined); // qualitative target → blank, not a guess
  assert.equal(p.source, "none");
});

// ── 3. Hip thrust starting load is conservative ──────────────────────────────

test("hip thrust: no history and a qualitative target produces no invented load", () => {
  const p = prescribeSet({ exercise: L1_HIP_THRUST });
  assert.equal(p.weight, undefined);
  assert.equal(p.source, "none");
});

test("hip thrust: a heavy low-rep effort is not carried into 8–10 rep work", () => {
  const p = prescribeSet({ exercise: L1_HIP_THRUST, previous: { reps: "5", weight: "225" } });
  assert.equal(p.weight, undefined);
  assert.notEqual(p.weight, "225");
});

// ── 4. Low readiness reduces the prescription ────────────────────────────────

test("yellow day: the load is trimmed below the last good session", () => {
  const p = prescribeSet({
    exercise: L1_LEG_PRESS,
    previous: { reps: "12", weight: "235" },
    readiness: "yellow",
  });
  assert.ok(Number(p.weight) < 235, `expected a reduction, got ${p.weight}`);
  assert.equal(p.weight, "210"); // 235 × 0.9, rounded down to a loadable 5
  assert.equal(p.source, "reduced-for-readiness");
});

test("red day: no load is offered at all", () => {
  const p = prescribeSet({
    exercise: L1_RDL,
    previous: { reps: "6", weight: "145" },
    readiness: "red",
  });
  assert.equal(p.weight, undefined);
  assert.equal(p.source, "reduced-for-readiness");
});

// ── 5. Missing readiness does not produce aggressive progression ─────────────

test("missing readiness never increases the load", () => {
  for (const readiness of [undefined, null] as const) {
    const p = prescribeSet({
      exercise: L1_LEG_PRESS,
      previous: { reps: "12", weight: "235" },
      readiness,
    });
    assert.ok(
      Number(p.weight) <= 235,
      `missing readiness produced ${p.weight}, above the last load`,
    );
  }
});

test("missing readiness on a mismatched rep range still reduces", () => {
  const p = prescribeSet({ exercise: L2_RDL, previous: { reps: "6", weight: "145" } });
  assert.ok(Number(p.weight) < 145);
});

// ── 6. The most recent value is not canonical ────────────────────────────────

test("a load logged with no reps is not treated as a proven working set", () => {
  const p = prescribeSet({ exercise: L2_RDL, previous: { weight: "145" } });
  assert.notEqual(p.weight, "145");
  assert.equal(p.weight, "95");
  assert.equal(p.source, "reduced-for-reps");
});

test("the fallback never exceeds the programmed target", () => {
  const p = prescribeSet({ exercise: L2_RDL, previous: { reps: "5", weight: "200" } });
  assert.ok(Number(p.weight) <= 95);
});

test("the fallback never exceeds the prior load either", () => {
  // Target says 95 but she has only ever moved 65 for this — don't jump her up.
  const p = prescribeSet({ exercise: L2_RDL, previous: { reps: "5", weight: "65" } });
  assert.equal(p.weight, "65");
});

test("stale reps are not carried when the load was reduced", () => {
  const p = prescribeSet({ exercise: L2_RDL, previous: { reps: "6", weight: "145" } });
  assert.equal(p.reps, undefined); // "6" against a 10–12 slot would mislead
});

// ── unloaded + timed work keeps behaving ─────────────────────────────────────

test("assisted pull-ups carry reps and never a load", () => {
  const p = prescribeSet({ exercise: U1_PULLUP, previous: { reps: "5", weight: "55" } });
  assert.equal(p.weight, undefined);
  assert.equal(p.reps, "5");
});

test("assisted pull-ups carry the assistance setting forward", () => {
  const p = prescribeSet({
    exercise: U1_PULLUP,
    previous: { reps: "6", assistWeight: "55" },
  });
  assert.equal(p.assistWeight, "55");
  assert.equal(p.reps, "6");
  assert.equal(p.weight, undefined); // assistance is never external load
});

test("assistance is never reduced by the prefill — that call is the coach's", () => {
  const p = prescribeSet({
    exercise: U1_PULLUP,
    previous: { reps: "6", assistWeight: "55" },
    readiness: "yellow",
  });
  // A yellow day must not silently make pull-ups HARDER by cutting assistance.
  assert.notEqual(Number(p.assistWeight), 45);
  assert.equal(p.assistWeight, "55");
});

test("assistance seeds from the target before any set has logged one", () => {
  const p = prescribeSet({ exercise: U1_PULLUP, previous: { reps: "6" } });
  assert.equal(p.assistWeight, "55"); // from "55 lb assist"
  assert.equal(p.source, "target");
});

test("a logged assistance setting beats the target", () => {
  const p = prescribeSet({
    exercise: U1_PULLUP,
    previous: { reps: "6", assistWeight: "45" }, // she already chipped it down
  });
  assert.equal(p.assistWeight, "45");
  assert.equal(p.source, "previous");
});

test("red day offers no assisted work either", () => {
  const p = prescribeSet({
    exercise: U1_PULLUP,
    previous: { reps: "6", assistWeight: "55" },
    readiness: "red",
  });
  assert.equal(p.assistWeight, undefined);
  assert.equal(p.source, "reduced-for-readiness");
});

test("timed work carries its duration", () => {
  const p = prescribeSet({ exercise: BALANCE, previous: { duration: "45 sec" } });
  assert.equal(p.duration, "45 sec");
});
