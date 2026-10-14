-- Today screen: a quest can live only on its board (not in Additional Quests).
alter table tasks add column if not exists in_additional boolean not null default true;

-- Journal entries can be tagged (gratitude, expression, win, idea, feedback).
alter table journal_entries add column if not exists kind text;

-- Daily habits share the rites table, in the "day" slot.
alter table rites add column if not exists slot text not null default 'evening';

-- A boss guards each level: defeat it before you can level up.
create table if not exists level_bosses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  level int not null check (level between 1 and 9),
  title text not null,
  target int not null default 1 check (target >= 1),
  progress int not null default 0,
  defeated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, level)
);
alter table level_bosses enable row level security;
