-- Tags: optional labels so a quest can sit in several categories at once
-- (quest boards stay the one "home" for each quest).
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);
create unique index if not exists tags_owner_name_idx on tags(owner_id, lower(name));
alter table tags enable row level security;

create table if not exists task_tags (
  task_id uuid not null references tasks(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, tag_id)
);
create index if not exists task_tags_tag_idx on task_tags(tag_id);
alter table task_tags enable row level security;
