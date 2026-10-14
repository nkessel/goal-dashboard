-- Energy check-ins (1–10 in half steps) from the Today screen.
create table if not exists energy_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  level numeric(3,1) not null check (level between 1 and 10),
  created_at timestamptz not null default now()
);
create index if not exists energy_log_owner_created on energy_log (owner_id, created_at desc);
alter table energy_log enable row level security;
