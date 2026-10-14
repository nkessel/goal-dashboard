-- Journal: quick private notes added from the + sheet.
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  mood smallint check (mood between 1 and 5),
  created_at timestamptz not null default now()
);
create index if not exists journal_entries_owner_idx on journal_entries(owner_id, created_at desc);
alter table journal_entries enable row level security;
