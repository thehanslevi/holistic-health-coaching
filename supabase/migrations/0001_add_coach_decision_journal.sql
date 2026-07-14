-- The coach's own decision journal.
--
-- Append-only by design: `decision` and `rationale` are written once and never
-- rewritten. That is precisely what hrl_memory got wrong — it had the model
-- rewrite the entire note list on every turn, so it drifted, evicted, and
-- froze inferences that were true when written and rotted afterward.
--
-- What belongs here: the coach's REASONING. "Held runs at 1.5 mi because the
-- ankle came back at 3 after 1.25. Revisit after two consecutive runs at or
-- below 1." That is what gives continuity of intent across months, and it is
-- the thing a rolling context window can never supply.
--
-- What does NOT belong here:
--   - Facts about the athlete  -> hrl_profile (she maintains those herself)
--   - Anything derivable from logs/health -> neither; computed on demand via
--     the coach's tools, so it can never go stale.
--
-- Only the closing fields mutate, and only to record how a decision actually
-- turned out. That is what closes the loop: the coach can finally say
-- "I had you hold at 1.5 for two weeks; your ankle went 3 to 1; that worked."

create table if not exists hrl_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- What the coach decided, in her terms. e.g. "Hold runs at 1.5 mi."
  decision text not null,

  -- Why, grounded in what was true at the time it was made.
  rationale text not null,

  -- What would justify revisiting. e.g. "Two consecutive runs with next-AM
  -- ankle at or below 1." Null = no explicit trigger; revisit on judgment.
  review_trigger text,

  status text not null default 'open' check (status in ('open', 'closed')),

  -- How it actually went. Set only when closing.
  outcome text,
  closed_at timestamptz
);

create index if not exists hrl_decisions_status_created_idx
  on hrl_decisions (status, created_at desc);

-- Matches every other hrl_ table: RLS on, no policies, service-role only.
alter table hrl_decisions enable row level security;
