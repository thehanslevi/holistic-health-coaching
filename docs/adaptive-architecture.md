# Adaptive Architecture — making the app stop operating on stale facts

## The problem

The app codifies facts that are *meant to change* — working loads, rep ranges,
baselines, injury status, thresholds — into **code** (`program.ts`) and the
**coach's system prompt**. But the whole premise of the training is progressive
change. So the codified "truth" drifts from reality the moment the athlete
trains, and every drift surfaces as a wrong number, a stale phase, or an
unhelpful line. Patching each failure individually is whack-a-mole.

## The principle

**Code holds logic. Data holds facts.**

Anything that changes is either *derived from the logs* or *stored as living,
dated data* — never written into code or the prompt. The prompt carries
*principles* ("use her logged history for loads"), never *numbers* ("RDL is 150").
Every data-derived fact carries an "as of" date and degrades gracefully when stale.

## What already exists (partial scaffolding — not the default)

- `prescribe.ts` — derives each set's prescription from the last log that matches
  the session's rep range; the hardcoded target is only a fallback.
- `hrl_program_overrides` — per-exercise working target/note, edited via
  `TargetEditor` or written by the coach's Apply.
- `/api/program/propose` + `ProgressionReview.tsx` — on-demand coach proposals to
  bump a target from recent top sets.
- `hrl_phases` — program-as-data: phase snapshots + advancement; `resolveProgram`
  already prefers a phase's `program_snapshot` over `program.ts`.
- `hrl_profile` — the living profile the athlete maintains; overrides the static
  prompt; injected into coach context.
- Coach context now injects the next-session prescription and per-source
  freshness guards (health, cycle) — the seeds of workstream #4.

---

## Workstream 1 — Self-updating baselines  *(highest leverage; build first)*

**Goal:** working loads track logged performance automatically, instead of a
human hand-editing `program.ts`.

**Design**
- A scheduled job (Vercel cron, like the daily push) runs a **baseline
  recalibration** per tracked lift.
- Per lift: read recent logged top sets within the lift's prescribed rep range;
  determine the current *clean working load* using the reps hit and the session's
  logged RIR/RPE (already captured at finish). Classify: **earned a bump**
  (consistently top-of-range at ~2 RIR), **holding**, or **regressed/deloaded**.
- Emit **proposals**, not silent changes. Small high-confidence bumps may
  auto-apply *with a visible notice and one-tap undo*; larger or riskier changes
  require explicit confirm.
- Surface: a **Baseline check** review (extend `ProgressionReview`) — confirm or
  dismiss each proposal; confirm writes an `hrl_program_overrides` row (the
  working target the logger and coach already read).

**Data:** a proposals store `{ exercise_id, current, proposed, basis, confidence,
status, created_at }` (reuse the propose route's output shape; persist it).

**Acceptance:** after several sessions of progression the app proposes the bump
with no code edit; confirming updates the working target; the logger and coach
use it on the next session. Regression proposes a sensible reduction, never a
grind.

## Workstream 2 — Facts out of the prompt → living data  *(build second)*

**Goal:** the coach's system prompt holds principles and safety floors, never
current numbers or current injury state.

**Design**
- Audit `COACH_SYSTEM_PROMPT` for baked facts: specific loads, "current
  milestone" numbers, current injury/rehab status, phase specifics.
- Move each to **dated `hrl_profile` entries** (living data) or derive it from
  logs / the resolved program.
- The prompt keeps: voice, reasoning rules, ED/safety floors, and the standing
  rule *"all loads, statuses, and numbers come from the logs, the resolved
  program, and the living profile — never state a number you didn't read."*
- Coach context already injects the living profile + next-session prescription;
  broaden profile coverage (injury status, goals, milestones) as dated entries.

**Acceptance:** no specific load or "current state" number survives in the
prompt; updating a fact is a profile edit (data), not a prompt/env change.

## Workstream 3 — Program fully as data  *(build third)*

**Goal:** `program.ts` becomes a one-time seed + typed fallback; the live program
is DB data, edited in-app or by the coach, versioned.

**Design**
- Make in-app program editing write the active phase's `program_snapshot`
  (add/remove/reorder exercises; change sets/reps/tier/rest), not just target
  overrides. `resolveProgram` already prefers the snapshot.
- `program.ts` → seed the first phase and provide the fallback shape only.
- Version each structural change for audit/rollback.

**Acceptance:** adding/removing an exercise or changing reps/tier/rest is a data
write with history — no deploy; existing logs preserved.

## Workstream 4 — Freshness as a system-wide rule  *(build alongside #1)*

**Goal:** one shared mechanism for "as-of + degrade when stale," replacing the
per-surface guards.

**Design**
- A small `freshness(dateISO, windowDays)` util → `{ fresh, ageDays, label }`.
- Every data-derived surface (health, cycle, baselines) and the coach context
  consume it uniformly. Stale → flag + suppress confident claims.

**Acceptance:** health, cycle, and baseline staleness all flow through one util;
a new data source gets freshness handling for free.

## Workstream 5 — Routine recalibration ritual  *(build last)*

**Goal:** force the codified state current with a human in the loop, on a
schedule, so nothing rots silently.

**Design**
- A monthly scheduled **recalibration** that re-derives baselines (#1), surfaces
  stale profile entries (#2), and flags program numbers that disagree with the
  logs (#3), then asks the athlete to confirm a short checklist.
- Delivered as a review surface (+ optional push).

**Acceptance:** monthly, a short "confirm what's changed" review; confirming
updates the living data; drift is caught on a cadence rather than by accident.

---

## Sequencing

**1 → (4 alongside) → 2 → 3 → 5.** Workstreams 1 and 2 together remove the
large majority of stale-information failures at the source. Each ships
independently and is verified on real data before the next begins.
