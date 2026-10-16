-- Quests: how much energy finishing one gives back (0 = unrated, 1–5).
alter table tasks add column if not exists energy_gain smallint not null default 0 check (energy_gain between 0 and 5);

-- Check-ins beyond energy: the extra things someone tracks (e.g. mood,
-- focus), and one row per reading.
alter table profiles add column if not exists check_metrics jsonb;

create table if not exists check_ins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  metric text not null,
  level numeric not null check (level between 1 and 10),
  created_at timestamptz not null default now()
);
create index if not exists check_ins_owner_time on check_ins (owner_id, created_at desc);
alter table check_ins enable row level security;

-- Habits: a portrait (or the plain checkbox), coins, and a time estimate.
alter table rites add column if not exists icon_source text check (icon_source is null or icon_source in ('library', 'ai'));
alter table rites add column if not exists coin_value integer check (coin_value is null or coin_value >= 0);
alter table rites add column if not exists estimate_minutes integer check (estimate_minutes is null or estimate_minutes > 0);
alter table rite_completions add column if not exists coins_awarded integer not null default 0;
