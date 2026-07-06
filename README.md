# HRL

A personal training app with an AI coach that actually knows the athlete — the injuries, the medications, the constraints, the history — and uses that context on every screen and every reply.

Built by Hannah Levinson • more at [hrlevinson.com](https://hrlevinson.com)

**Live:** [holistic-health-coaching.vercel.app](https://holistic-health-coaching.vercel.app) — a single-user PWA, installed to the home screen.

---

## Why this exists

A tracker records what you did. A coach decides what you should do next. Almost every fitness app is a tracker wearing a coach's vocabulary: it stores your sets, draws a chart, and hands the judgment back to you. The moment that actually matters — *given everything about me, what should I do today, and what should I not?* — is the moment they leave empty.

That gap is expensive when the answer is load-bearing. A body with long-managed joint injuries doesn't need a rep counter; it needs a decision that reads the whole picture before it's made. A medication that reshapes appetite changes how fueling has to work. A history that makes food fraught changes how nutrition can be discussed at all. Generic advice isn't just unhelpful here — it's the wrong tool for a body with real constraints.

So HRL is built the opposite way around. The athlete's clinical and training reality is the center of the system, not a note field bolted to the side. The coaching context — authored with a real coach and physical therapist — is the substrate every feature draws from. The app doesn't try to be a better tracker. It tries to make the call a good coach would make, every day, with the full record in view, and to know the difference between pushing and protecting.

**The boundary is the point:** this augments a coach-authored plan; it doesn't replace the coach or the PT. The software assembles context, surfaces risk, and proposes progressions. A human — the athlete, her coach — makes the authoritative call.

## What it does

**Today knows the day.** A schedule-aware home screen opens with a coach-written morning brief generated from your actual recent logs, a Green/Yellow/Red readiness check-in, and proactive signals that fire without being asked — a rising next-morning ankle score, a volume spike, slipping PT compliance, a run of short nights. The coach's job is to catch the problem before it's a problem; this is that job, made visible.

**Sessions are guided, not filled out.** One exercise at a time, last session's numbers pre-loaded, a rest timer, live PR detection, and a finish screen that tells you how the day compared. Logging becomes the workout's interface instead of paperwork after it.

**The plan is alive.** Program targets aren't frozen in code. When your recent top sets earn a bump, a **progression review** proposes the change with a rationale — and *respects the coaching notes*, so it will raise a bench that's ready and refuse to touch a lift that's explicitly capped for joint safety. Accept it, and the target actually changes everywhere.

**The coach carries the whole record.** The chat automatically sees your last two weeks of training, your run traffic-light status, your recovery check, and your Apple Health data — no pasting context in. It remembers durable facts across conversations, writes a weekly review, and keeps its advice inside your real constraints.

**Recovery and health close the loop.** A ten-second daily check (fueling, post-run protocol, nervous-system work) plus an Apple Health ingest (sleep, HRV, resting heart rate, steps) give the coach the objective and behavioral signals it's supposed to watch, not just the lifts.

## How it's built

- **Next.js 16** (App Router) · **TypeScript** (strict) · **Tailwind v4** — a hand-built design system, no component library.
- **Supabase** (Postgres) with a strict boundary: the browser never touches the database. Every read and write goes through server API routes using the service-role key; single-user access is gated by a passcode carried as a bearer token.
- **Anthropic Claude** (`claude-sonnet-4-6`) powers the coach, the morning brief, the weekly review, cross-conversation memory consolidation, and the progression review. The system prompt is cached; a per-request context block (recent logs, health, recovery, saved memory) is assembled fresh and appended uncached, so caching stays effective while the coach stays current.
- **A living program.** The base program lives in `src/lib/program.ts`; per-exercise overrides live in the database and are merged at read time, which is what lets the coach's proposals become the plan.
- **Hand-rolled SVG charts**, tuned for the dark theme — no charting dependency.
- **PWA**: custom icon, standalone display, installs like a native app.

## A note on privacy

This repo is public; the athlete's personal record is not in it. The real coaching prompt is supplied at runtime (an environment variable in production, a gitignored local file in development) and falls back to a generic example coach committed here. The clinical source documents never entered the repository, and the commit history was rebuilt clean. What's public is the engineering; what's private stayed private — by design, which is rather the whole thesis of the app.

## Run it

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
APP_PASSCODE=your-passcode
# optional: your own coach system prompt (else a generic default is used)
COACH_SYSTEM_PROMPT=...
```

The coach prompt resolves in order: `COACH_SYSTEM_PROMPT` → a gitignored `coach-prompt.local.md` at the repo root → the generic default in `src/lib/system-prompt.ts`. Supabase tables are prefixed `hrl_` (`hrl_logs`, `hrl_checkins`, `hrl_recovery`, `hrl_health`, `hrl_conversations`, `hrl_messages`, `hrl_memory`, `hrl_briefs`, `hrl_program_overrides`).

```bash
npm install
npm run dev
```

---

Built by Hannah Levinson • more at [hrlevinson.com](https://hrlevinson.com)
