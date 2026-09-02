# Native shell — Volt on iOS with HealthKit

**Goal:** the sync problem ends. Sleep, HRV, resting HR, steps, and every Watch
workout flow into Volt in the background, with no third-party exporter and
nothing for Hannah to run. Runs log themselves. Push arrives natively.

## Why a shell and not a rewrite

The web app is the product — the coach, the logger, the Today screen. A PWA
cannot read HealthKit and never will. A native shell keeps 100% of the web app
and adds the two things only native can do: **HealthKit** and **real push**.

## Architecture

- **Capacitor 6** iOS project in `ios/`, app id `com.hrl.volt`.
- **Remote-loaded web app:** `capacitor.config.ts` → `server.url =
  https://holistic-health-coaching.vercel.app`. No static export, no build-time
  bundling of the Next app; every Vercel deploy is instantly the native app's UI.
  (Next API routes keep working because the page is served from Vercel.)
- **Bridge detection:** the web app checks `window.Capacitor?.isNativePlatform()`
  and, when native, hides the web-push opt-in (native push replaces it) and
  shows "Health: connected" instead of the HAE status line.

## HealthKit plugin — in-house, small

Community plugins do foreground queries only. Background delivery needs ~150
lines of Swift we own (`ios/App/App/HealthSync.swift`):

1. **Authorization** for: sleepAnalysis, heartRateVariabilitySDNN,
   restingHeartRate, stepCount, activeEnergyBurned, workoutType.
2. **`HKObserverQuery` + `enableBackgroundDelivery(.hourly)`** per type. iOS
   wakes the app when new samples land (Watch sync) — this is the mechanism HAE
   cannot use from a third-party app on a schedule.
3. **On wake:** anchored queries since the last anchor → aggregate per day
   (same shapes `/api/health` already accepts, `source: "healthkit"`) → POST.
4. **Workouts:** each new `HKWorkout` → POST `/api/workouts/ingest` with
   `{type, start, end, distance_mi, duration_s, avg_hr, splits?}`.
   - `running`/`walking` → a run log is created (`RunLogData`: run_date,
     run_dist, run_time; type inferred from pace pattern; ankle fields empty →
     it becomes a **pending run** so the next-morning check still asks).
   - `traditionalStrengthTraining` → a **detected session** row; Today shows
     "Lifted 11:02–11:41 — log the sets?" which opens the logger with the
     rotation's next session and the timestamps prefilled.
5. **Foreground catch-up** on every app open (belt and braces).

Entitlements: HealthKit, HealthKit background delivery, Background Modes
(processing, remote-notification), Push.

## Push

`@capacitor/push-notifications` → APNs token → POST `/api/push/subscribe`
(`kind: "apns"`). `sendPushToAll` gains an APNs branch (`@parse/node-apn` or
Vercel-friendly HTTP/2 client). Web push subscriptions stay for the desktop.

## What changes in the web app (small)

- `src/lib/native.ts`: `isNative()`, `onNativeHealthSync(cb)`.
- Today: HAE status line → "Health synced 6:02 AM" from `hrl_sync_events`
  (already exists; the shell's POSTs land in the same log).
- `/api/workouts/ingest` (new) + `hrl_detected_sessions` (new) + run auto-log.

## Delivery

1. **Shell + HealthKit read on open** — TestFlight build 1. Retires HAE.
2. **Background delivery + workouts → auto-logged runs** — build 2.
3. **Native push + detected strength sessions** — build 3.
4. **Lock-screen widget** (WidgetKit: today's session + readiness) — build 4.

Each build ships through the existing `ship-to-app-store` flow (EAS not needed —
plain Xcode archive → TestFlight). Apple Developer account: active.

## Not doing

- Rewriting UI in Swift/React Native. The web app stays the product.
- Static export of Next. Remote-load is simpler and keeps API routes.
- Android. Single user, iPhone.
