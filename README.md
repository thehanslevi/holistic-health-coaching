# HRL — personal training & AI coaching app

A mobile-first PWA that unifies workout tracking, recovery, progress analytics,
and an AI coach that actually knows your training. Built as a single-user app
you install to your home screen.

> This is a personal project published as a portfolio piece. The owner's real
> coaching prompt and clinical context are **not** in this repo — the app ships
> with a generic example coach (see [Configuration](#configuration)).

## Highlights

- **Today** — a schedule-aware home screen with a coach-written morning brief,
  a Green/Yellow/Red readiness check-in, proactive signals (injury-trend,
  overtraining, PT slippage, low sleep), and a daily recovery check.
- **Guided sessions** — one exercise at a time, last-session numbers pre-loaded,
  per-set completion, a rest timer, PR detection, and a finish screen with
  volume deltas.
- **Calendar** — month grid of everything logged, tap any day to review it or
  backfill a session for that date.
- **Progress** — hand-rolled SVG charts (lift progression, weekly volume, joint
  response vs. run load, PT compliance) plus a coach-written weekly review.
- **Coach** — a streaming chat that automatically sees your recent logs, with
  persistent cross-conversation memory, a morning brief, and a **progression
  review** that proposes target changes you can apply to a living program.
- **Apple Health ingest** — an endpoint an iOS Shortcut can POST sleep / steps /
  HRV / resting-HR to each morning, feeding the coach objective recovery data.
- **PWA** — custom icon, standalone display, installs like a native app.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript (strict)
- Tailwind CSS v4
- [Supabase](https://supabase.com) (Postgres) — all access through server-side
  API routes using the service-role key; the browser never touches the DB
- [Anthropic Claude](https://www.anthropic.com) (`claude-sonnet-4-6`) for the
  coach, morning brief, weekly review, memory consolidation, and progression review
- Deployed on [Vercel](https://vercel.com)

## Architecture notes

- **Single-user auth** — a passcode gate; the client sends it as a bearer token
  (or `?key=` for the Health shortcut) and every API route verifies it.
- **Coach context** — a cached, stable system prompt plus an uncached, per-request
  context block assembled from the last 14 days of logs, health, recovery, and
  saved memory (`src/lib/coach-context.ts`).
- **Living program** — the base program lives in `src/lib/program.ts`; per-exercise
  target overrides are stored in the DB and merged at read time, so the coach's
  progression calls actually change the plan.

## Configuration

Create `.env.local`:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
APP_PASSCODE=your-passcode
# optional: your own coach system prompt (else a generic default is used)
COACH_SYSTEM_PROMPT=...
```

The coach prompt resolves in order: `COACH_SYSTEM_PROMPT` env var → a local,
gitignored `coach-prompt.local.md` at the repo root → the generic default in
`src/lib/system-prompt.ts`.

Database schema lives in Supabase (tables are prefixed `hrl_`): `hrl_logs`,
`hrl_checkins`, `hrl_recovery`, `hrl_health`, `hrl_conversations`, `hrl_messages`,
`hrl_memory`, `hrl_briefs`, `hrl_program_overrides`.

```bash
npm install
npm run dev
```

## License

Personal project — no license granted for reuse of the specific program content.
