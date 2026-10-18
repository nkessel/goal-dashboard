-- Weekly / monthly planning ritual drafts and seals.
create table if not exists planning_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('week','month')),
  period_key text not null,
  data jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, kind, period_key)
);
alter table planning_sessions enable row level security;
alter table xp_events drop constraint if exists xp_events_kind_check;
alter table xp_events add constraint xp_events_kind_check check (kind = any (array['task_assigned','task_completed','daily_check_in','streak_bonus','level_up_adjustment','planning_ritual']));
