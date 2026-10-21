-- Sub-habits: a habit can hold a short checklist of steps ("Chester care":
-- food, water, walk…), each ticked off per day. Ticking the last one
-- completes the habit for the day.
alter table rites add column if not exists steps jsonb not null default '[]'::jsonb;

create table if not exists rite_step_checks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  rite_id uuid not null references rites(id) on delete cascade,
  step_id text not null,
  day date not null,
  created_at timestamptz not null default now(),
  unique (rite_id, step_id, day)
);
create index if not exists rite_step_checks_owner_day_idx on rite_step_checks(owner_id, day);
alter table rite_step_checks enable row level security;
