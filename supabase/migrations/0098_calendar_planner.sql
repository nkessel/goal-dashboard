-- Calendar planner step 3 (docs/CALENDAR-PLANNER-DESIGN.md section 2b): real columns and tables for travel time,
-- "on Google", accepted daily events and repeating events. Nothing reads them yet: `life_wheel.questDrives` and
-- `scheduler.essentialDays` stay the source until step 4 switches readers over, and the server writes both
-- (src/lib/data/calendar-planner.ts). Numbered 0098 (the design called it 0090, which is taken).
-- Like the other server tables: RLS on, no policies (only the service role reads or writes; the app has its own sign-in).

alter table public.tasks
  add column if not exists travel_before_min int not null default 0,
  add column if not exists travel_after_min int not null default 0,
  add column if not exists on_google boolean not null default true;
alter table public.task_sessions
  add column if not exists travel_before_min int not null default 0,
  add column if not exists travel_after_min int not null default 0,
  add column if not exists on_google boolean not null default true;

create table if not exists public.calendar_series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  icon text,
  quest_template jsonb,
  start_minute int not null,            -- wall-clock minutes after midnight
  minutes int not null,
  tz text not null,
  repeat jsonb not null,
  from_day date not null,
  until_day date,
  travel_before_min int not null default 0,
  travel_after_min int not null default 0,
  on_google boolean not null default false,
  google_recurring_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_series_owner_idx on public.calendar_series(owner_id);
alter table public.calendar_series enable row level security;
revoke all on public.calendar_series from anon, authenticated;

create table if not exists public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('essential','habit','event','google_extra')),
  source_key text not null,             -- 'lunch', 'e:<id>', 'h:<rite id>', or a Google event id
  title text,
  icon text,
  day date not null,
  starts_at timestamptz,                -- null on a skipped day
  ends_at timestamptz,
  state text not null default 'placed' check (state in ('placed','skipped')),
  series_id uuid references public.calendar_series(id) on delete set null,
  travel_before_min int not null default 0,
  travel_after_min int not null default 0,
  on_google boolean not null default false,
  google_event_id text,
  updated_at timestamptz not null default now()
);
create unique index if not exists calendar_blocks_owner_kind_key_day_idx on public.calendar_blocks(owner_id, kind, source_key, day);
create index if not exists calendar_blocks_owner_day_idx on public.calendar_blocks(owner_id, day);
alter table public.calendar_blocks enable row level security;
revoke all on public.calendar_blocks from anon, authenticated;

-- Copy 1: life_wheel.questDrives ({ "<quest id>": minutes }) into the quest's travel columns (both ways the same).
-- Only fills quests whose columns are still 0, so a rerun never overwrites a newer value.
update public.tasks t
set travel_before_min = d.m, travel_after_min = d.m
from (
  select p.id as owner_id, e.key as task_id, least(600, round(e.value::numeric)::int) as m
  from public.profiles p, jsonb_each_text(case when jsonb_typeof(p.life_wheel->'questDrives') = 'object' then p.life_wheel->'questDrives' else '{}'::jsonb end) e
  where e.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and e.value ~ '^[0-9]+(\.[0-9]+)?$'
) d
where t.id = d.task_id::uuid and t.owner_id = d.owner_id and d.m > 0 and t.travel_before_min = 0 and t.travel_after_min = 0;

-- Copy 2: scheduler.essentialDays ({ "YYYY-MM-DD": { "<lunch | e:id | h:id>": { at?, minutes?, off? } } }) into calendar_blocks.
-- "at" is minutes after midnight in the app's zone (America/New_York, the app's default APP_TIMEZONE); "off" is a skipped day.
insert into public.calendar_blocks (owner_id, kind, source_key, day, starts_at, ends_at, state)
select p.id,
  case when h.key like 'h:%' then 'habit' else 'essential' end,
  h.key,
  d.key::date,
  case when h.value ? 'at' and (h.value->>'at') ~ '^[0-9]+$' and coalesce((h.value->>'off')::boolean, false) = false
       then ((d.key::date + make_interval(mins => (h.value->>'at')::int))::timestamp at time zone 'America/New_York') end,
  case when h.value ? 'at' and (h.value->>'at') ~ '^[0-9]+$' and coalesce((h.value->>'off')::boolean, false) = false
       then ((d.key::date + make_interval(mins => (h.value->>'at')::int + coalesce(nullif(h.value->>'minutes','')::int, 60)))::timestamp at time zone 'America/New_York') end,
  case when coalesce((h.value->>'off')::boolean, false) then 'skipped' else 'placed' end
from public.profiles p,
  jsonb_each(case when jsonb_typeof(p.scheduler->'essentialDays') = 'object' then p.scheduler->'essentialDays' else '{}'::jsonb end) d,
  jsonb_each(case when jsonb_typeof(d.value) = 'object' then d.value else '{}'::jsonb end) h
where d.key ~ '^\d{4}-\d{2}-\d{2}$'
  and jsonb_typeof(h.value) = 'object'
  and (coalesce((h.value->>'off')::boolean, false) or ((h.value->>'at') ~ '^[0-9]+$'))
on conflict (owner_id, kind, source_key, day) do nothing;
