-- A deadline separate from a calendar slot, "can be done in N-minute
-- chunks" for filler time, and an optional custom coin payout (null = auto
-- from XP).
alter table tasks add column if not exists due_at timestamptz;
alter table tasks add column if not exists chunk_minutes integer check (chunk_minutes is null or chunk_minutes > 0);
alter table tasks add column if not exists coin_value integer check (coin_value is null or coin_value >= 0);
create index if not exists tasks_due_idx on tasks(owner_id, due_at) where due_at is not null;
