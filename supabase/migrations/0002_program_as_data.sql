-- Make the program editable: exercises become data, not code.
--
-- Until now program.ts was the whole truth about which exercises exist, so the
-- coach could recommend "swap hammer curls for rows" and then be structurally
-- incapable of doing it. hrl_program_overrides could only override a *target
-- string* on an exercise that already existed — there was no way to express
-- "U1 no longer has hammer curls."
--
-- The model, layered:
--   1. program.ts SESSIONS  — the base template + fallback. Still the seed.
--   2. hrl_phases.program_snapshot — the structural truth once edited. NULL
--      means "nothing has been changed; use the code template."
--   3. hrl_program_overrides — working target tweaks on top (unchanged).
--
-- This follows the direction W3-F4 already set (program-as-data lives on the
-- phase, program.ts stays the base template), rather than inventing a parallel
-- op-replay system.

alter table hrl_phases
  add column if not exists program_snapshot jsonb;

comment on column hrl_phases.program_snapshot is
  'Full Record<SessionKey, Session> for this phase. NULL = unedited; fall back to program.ts SESSIONS.';


-- Every change to the program, append-only, so she can always see what the
-- coach did and why — and undo it.
--
-- The coach may edit unprompted (her call, 2026-07-14), which only works if
-- nothing is silent: every edit lands here with a rationale, and every edit is
-- reversible. Control after the fact instead of a gate before it.
create table if not exists hrl_program_changes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  session_key text check (session_key in ('L1', 'U1', 'L2', 'U2', 'C1', 'G1')),

  -- Human-readable, shown to her verbatim.
  -- e.g. "Replaced Hammer Curl with Cable Row in U1"
  summary text not null,

  -- Why. Required — an unexplained change to her program is not acceptable.
  rationale text not null,

  source text not null default 'coach' check (source in ('coach', 'manual')),

  -- The complete program immediately BEFORE this change. NULL means the program
  -- was still on the code template. Undo = write this back to the phase, which
  -- is a point-in-time restore: undoing an older change also discards the ones
  -- stacked on top of it. That is honest and always correct, which matters more
  -- here than the illusion of cherry-picking one edit out of a sequence.
  before_snapshot jsonb,

  reverted_at timestamptz
);

create index if not exists hrl_program_changes_created_idx
  on hrl_program_changes (created_at desc);

-- Matches every other hrl_ table: RLS on, no policies, service-role only.
alter table hrl_program_changes enable row level security;
