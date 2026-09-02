-- Eval harness results. One row per (surface, subject) judged: the deterministic
-- guard's violations plus an LLM judge's rubric, so bad coach output is caught
-- and counted per rule instead of discovered on Hannah's lock screen.
create table if not exists hrl_evals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  surface text not null,            -- 'brief' | 'proposals' | 'recalibration'
  subject_date date,
  content text,
  passed boolean not null,
  violations jsonb not null default '[]',
  judge jsonb,
  model text,
  regenerated boolean not null default false
);
create index if not exists hrl_evals_created_idx on hrl_evals (created_at desc);
alter table hrl_evals enable row level security;
