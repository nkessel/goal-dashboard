-- Steps inside a quest: a small checklist whose ticks move the quest's
-- progress bar (and so pay out its share of the XP).

create table if not exists quest_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists quest_steps_task_idx on quest_steps(task_id, sort_order);
create index if not exists quest_steps_owner_idx on quest_steps(owner_id);
alter table quest_steps enable row level security;
