// Run: npm test
//
// The scenario that prompted this: on 2026-08-01 the coach read a provisional
// 8am sleep value (a partial ~3h block) as fact and told her to skip lifting for
// "three hours of sleep" — a number that was 8.2h by lunchtime.

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHealthSeries, type HealthReading } from "./health-series.ts";

const TODAY = "2026-08-01";

// Newest-first, with today present as a provisional partial night.
const sleepWithProvisionalToday: HealthReading[] = [
  { date: "2026-08-01", value: 3.0 }, // provisional partial sync
  { date: "2026-07-31", value: 6.1 },
  { date: "2026-07-30", value: 7.23 },
  { date: "2026-07-29", value: 7.67 },
  { date: "2026-07-28", value: 6.79 },
];

test("today's provisional value is flagged, never presented as settled", () => {
  const out = formatHealthSeries("sleep_hours", sleepWithProvisionalToday, TODAY, 14);
  assert.match(out, /PROVISIONAL/);
  assert.match(out, /Do NOT quote this/);
  // The settled 'most recent complete' reading is yesterday, not today.
  assert.match(out, /Most recent COMPLETE reading: 6\.1 on 2026-07-31/);
});

test("the 3h provisional night does not drag the baseline down", () => {
  const out = formatHealthSeries("sleep_hours", sleepWithProvisionalToday, TODAY, 14);
  // Settled median of [6.1, 7.23, 7.67, 6.79] ≈ 7.0, and min must be 6.1 —
  // NOT the provisional 3.0. If 3.0 leaked into the stats, min would be 3.
  assert.match(out, /Baseline \(median\): 7\n/);
  assert.match(out, /min: 6\.1/);
  assert.doesNotMatch(out, /min: 3\b/);
});

test("today is excluded from the settled reading count", () => {
  const out = formatHealthSeries("sleep_hours", sleepWithProvisionalToday, TODAY, 14);
  assert.match(out, /4 settled readings \(today excluded\)/);
});

test("when today has NOT synced, no provisional warning and the newest is real", () => {
  const noToday = sleepWithProvisionalToday.slice(1); // starts at 07-31
  const out = formatHealthSeries("sleep_hours", noToday, TODAY, 14);
  assert.doesNotMatch(out, /PROVISIONAL/);
  assert.match(out, /No reading for today yet/);
  assert.match(out, /Most recent COMPLETE reading: 6\.1 on 2026-07-31/);
});

test("HRV gets a generic same-day caveat, not the sleep-specific one", () => {
  const hrv: HealthReading[] = [
    { date: "2026-08-01", value: 13 }, // crashed provisional
    { date: "2026-07-31", value: 34.5 },
    { date: "2026-07-30", value: 38.4 },
  ];
  const out = formatHealthSeries("hrv", hrv, TODAY, 14);
  assert.match(out, /PROVISIONAL/);
  assert.match(out, /same-day readings settle over the day/);
  assert.match(out, /Baseline \(median\): 36\.5/); // (34.5+38.4)/2, today excluded, rounded
});

test("only-today-in-window returns an explicit not-usable-yet message", () => {
  const out = formatHealthSeries("sleep_hours", [{ date: "2026-08-01", value: 3.0 }], TODAY, 14);
  assert.match(out, /the only reading in this window is TODAY/);
  assert.match(out, /PROVISIONAL/);
});

test("empty window is reported, not crashed", () => {
  assert.match(formatHealthSeries("hrv", [], TODAY, 14), /No hrv readings/);
});
