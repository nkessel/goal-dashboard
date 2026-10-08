-- Evening routine: rites (core = non-negotiable, optional = mini-quests) and
-- one completion per rite per (local) day. Plus partial progress on quests.

create table if not exists rites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  icon_key text,
  is_core boolean not null default false,
  xp_value integer not null default 5,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rites_owner_idx on rites(owner_id, archived, sort_order);
alter table rites enable row level security;

create table if not exists rite_completions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  rite_id uuid not null references rites(id) on delete cascade,
  day date not null,
  xp_awarded integer not null default 0,
  completed_at timestamptz not null default now(),
  unique (rite_id, day)
);
create index if not exists rite_completions_owner_day_idx on rite_completions(owner_id, day);
alter table rite_completions enable row level security;

-- Quest progress: 0-100, with the XP already paid out tracked per quest so
-- completing pays only the remainder (and reopening/deleting reverses it all).
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'tasks' and column_name = 'xp_awarded') then
    alter table tasks add column xp_awarded integer not null default 0;
    update tasks set xp_awarded = xp_value where status = 'completed';
  end if;
end $$;
alter table tasks add column if not exists progress integer not null default 0 check (progress between 0 and 100);

-- Rewards can pay a completion bonus (XP and/or coins) when claimed.
alter table rewards add column if not exists bonus_xp integer not null default 0;
alter table rewards add column if not exists bonus_coins integer not null default 0;

-- Reward lifecycle: available → claimed (accepted: coins spent) → completed
-- (done: completion bonus paid).
alter table rewards drop constraint if exists rewards_status_check;
alter table rewards add constraint rewards_status_check check (status in ('available', 'claimed', 'completed'));
alter table rewards add column if not exists completed_at timestamptz;
