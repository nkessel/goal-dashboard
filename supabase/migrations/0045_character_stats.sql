-- Character stats (Strength, Intelligence, Charisma…): a quest can send a
-- share of its XP to stats instead of the main level meter.
alter table tasks add column if not exists stat_split jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists stats jsonb;
alter table profiles add column if not exists stat_xp jsonb not null default '{}'::jsonb;
create table if not exists stat_xp_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  stat text not null,
  amount int not null,
  created_at timestamptz not null default now()
);
create index if not exists stat_xp_events_owner_idx on stat_xp_events(owner_id, created_at desc);
alter table stat_xp_events enable row level security;
