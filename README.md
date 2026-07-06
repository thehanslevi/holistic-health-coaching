# HRL

An adaptive health coaching and training app that advises based on an athlete's holistic constraints and personal history (injuries, life circumstances, medications, mental health, and more).

Built by Hannah Levinson • more at [hrlevinson.com](https://hrlevinson.com)

**Live:** [holistic-health-coaching.vercel.app](https://holistic-health-coaching.vercel.app) — a single-user PWA, installed to the home screen.

---

## Why this exists

Most fitness apps functions primarily as trackers: they store sets, draw charts, and build progressive loading plans based on numbers alone. A truly personalized *given everything about me, how best can I approach this training day?* approach is generally unavailable.

That gap is important. Athletes with long-managed joint injuries doesn't just need rep counters; they need to make decisions that factor in a whole picture. Generic advice isn't just unhelpful — it's potentially damanging for real bodies with real constraints.

With this app, the athlete's clinical and training reality is the first feature for every decision and the driver of design. Coaching contexts are authored with support from licensed clinicians, mental health professionals, and physical therapists. The app is structured to make the types of real-time calls good coaches make, with the athlete's full record in view - and to know the difference between pushing and protecting.

This augments a coach-authored plan, and doesn't claim to fully replace a coach or PT. The software assembles context and proposes progressions in response to both priorities and risks. Ultimately, a human — the athlete, her coach — is expected to make the informed final call on how to approach each day and training session.

## What it does

**Today knows the day.** A schedule-aware home screen opens with a coach-written morning brief generated from recent logs, a Green/Yellow/Red readiness check-in, and proactive signals (i.e. joint scoring, volume spikes, PT compliance, sleep shortages). The coach's job is to catch any potential issues proactively before they become problems that need reactive management or mitigation.

**Sessions are guided, not filled out.** One exercise at a time, last session's numbers pre-loaded, a rest timer, live PR detection, and a finish screen that tells you how the day compared. Logging becomes the workout's interface instead of paperwork after it.

**The plan is alive.** Program targets aren't frozen in code. When your recent top sets earn a bump, a **progression review** proposes the change with a rationale — and *respects the coaching notes*, so it will raise a bench that's ready and refuse to touch a lift that's explicitly capped for joint safety. Accept it, and the target actually changes everywhere.

**The coach has persistent access to the athlete's 360° record.** The coach auto-reviews the athlete's last two weeks of training, "traffic-light status", recovery checks, and your Apple Health data. It remembers durable facts across conversations, writes weekly reviews, and keeps its advice aligned to and balanced between the data behind an athlete's goals, priorities, and material realities.

**Recovery and holistic health remain paramount.** Ten-second daily checks (fueling, post-run protocol, nervous-system work) plus Apple Health ingests (sleep, HRV, resting heart rate, steps) give the coach objective and behavioral signals to watch.

## How it's built

- **Next.js 16** (App Router) · **TypeScript** (strict) · **Tailwind v4** — a hand-built design system, no component library.
- **Supabase** (Postgres) with a strict boundary: the browser never touches the database. Every read and write goes through server API routes using the service-role key; single-user access is gated by a passcode carried as a bearer token.
- **Anthropic Claude** (`claude-sonnet-4-6`) powers the coach, the morning brief, the weekly review, cross-conversation memory consolidation, and the progression review. The system prompt is cached; a per-request context block (recent logs, health, recovery, saved memory) is assembled fresh and appended uncached, so caching stays effective while the coach stays current.
- **A living program.** The base program lives in `src/lib/program.ts`; per-exercise overrides live in the database and are merged at read time, which is what lets the coach's proposals become the plan.
- **Hand-rolled SVG charts**, tuned for the dark theme — no charting dependency.
- **PWA**: custom icon, standalone display, installs like a native app.

## A note on privacy

Because this repo is public, the "test" athlete's personal record is hidden. Real coaching prompts are supplied at runtime (an environment variable in production, a gitignored local file in development) and fall back to a generic example coach committed here. Clinical source documents from test athletes never enter the repository, and the commit history was rebuilt clean. By design, the engineering is public and the health data is private.

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
