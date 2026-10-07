-- Rewards you can earn, plus "imports": quests/rewards added for you (e.g. by
-- Claude) that you review one by one in the app before they're final.

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  icon_key text,
  -- Prompt for an auto-generated portrait (filled in by the app on review).
  icon_prompt text,
  status text not null default 'available' check (status in ('available', 'claimed')),
  claimed_at timestamptz,
  claimed_with_task_id uuid references tasks(id) on delete set null,
  needs_review boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rewards_owner_idx on rewards(owner_id, status);
alter table rewards enable row level security;

-- Completing this quest lets you pick one of your available rewards.
alter table tasks add column if not exists grants_reward boolean not null default false;
-- Imported, not yet confirmed by you.
alter table tasks add column if not exists needs_review boolean not null default false;
-- Prompt for an auto-generated portrait (filled in by the app on review).
alter table tasks add column if not exists icon_prompt text;
