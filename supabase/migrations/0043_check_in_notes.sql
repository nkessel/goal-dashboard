-- Write-in events and #tags added alongside a check-in ("bad sleep", "#coffee").
create table if not exists check_in_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists check_in_notes_owner_idx on check_in_notes(owner_id, created_at desc);
alter table check_in_notes enable row level security;
