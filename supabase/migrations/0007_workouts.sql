-- Every Watch/HealthKit workout the native shell has seen, keyed by HealthKit
-- UUID so repeated syncs are idempotent. Runs are auto-logged into hrl_logs
-- (log_id); strength workouts wait as "detected" until she confirms the session.
create table if not exists hrl_workouts (
  uuid text primary key,
  created_at timestamptz not null default now(),
  type text not null,                -- running | walking | cycling | strength | swimming | cardio | other
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_s int not null,
  distance_mi numeric,
  avg_hr int,
  energy_kcal int,
  status text not null default 'detected' check (status in ('detected','logged','dismissed')),
  log_id uuid,
  raw jsonb
);
create index if not exists hrl_workouts_started_idx on hrl_workouts (started_at desc);
alter table hrl_workouts enable row level security;
