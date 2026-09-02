-- Every inbound sync attempt, successful or not, so "did the phone send?" is
-- answerable from the app instead of guessed at. Health Auto Export's background
-- automations are throttled by iOS; when data stops arriving we need to know
-- whether the phone tried and failed, or never tried at all.
create table if not exists hrl_sync_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  endpoint text not null default '/api/health',
  status int not null,
  ok boolean not null default false,
  source text,
  health_count int not null default 0,
  health_dates text[] not null default '{}',
  cycle_count int not null default 0,
  error text,
  user_agent text,
  bytes int
);
create index if not exists hrl_sync_events_created_idx on hrl_sync_events (created_at desc);
alter table hrl_sync_events enable row level security;
