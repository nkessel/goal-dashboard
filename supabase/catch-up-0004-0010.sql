-- Catch-up: safe to run more than once. Brings the database up to migrations 0004-0010.

-- 0004
-- AI-generated avatars/quest icons. Generated once via Cloudflare Workers AI,
-- then the PNG is uploaded to Supabase Storage and its public URL is stored
-- here — never regenerated on every view (per product decision).

alter table profiles add column if not exists avatar_image_url text;

alter table tasks drop constraint if exists tasks_icon_source_check;
alter table tasks add constraint tasks_icon_source_check
  check (icon_source in ('monster', 'library', 'ai'));

-- 0005 (guarded: only backfills ordering the first time the columns are added)
do $$
declare fresh boolean := not exists (select 1 from information_schema.columns where table_name='goals' and column_name='sort_order');
begin
  alter table goals add column if not exists sort_order int not null default 0;
  alter table tasks add column if not exists sort_order int not null default 0;
  if fresh then
    with ranked as (
  select id, row_number() over (partition by board_id order by created_at asc) - 1 as rn
  from goals
)
update goals set sort_order = ranked.rn
from ranked
where goals.id = ranked.id;

with ranked as (
  select id, row_number() over (partition by owner_id order by created_at desc) - 1 as rn
  from tasks
)
update tasks set sort_order = ranked.rn
from ranked
where tasks.id = ranked.id;
  end if;
end $$;
create index if not exists goals_board_sort_idx on goals(board_id, sort_order);
create index if not exists tasks_owner_sort_idx on tasks(owner_id, sort_order);

-- 0006
-- Lets the Priority Matrix place a quest with one decimal of precision
-- (e.g. importance 3.4) instead of snapping to whole 1-5 steps. Widen the
-- columns from smallint to numeric(3,1) and relax the integer check to a
-- ranged decimal check.

alter table tasks alter column importance type numeric(3,1) using importance::numeric(3,1);
alter table tasks alter column urgency type numeric(3,1) using urgency::numeric(3,1);

alter table tasks drop constraint if exists tasks_importance_check;
alter table tasks drop constraint if exists tasks_urgency_check;

alter table tasks add constraint tasks_importance_check check (importance between 1 and 5);
alter table tasks add constraint tasks_urgency_check check (urgency between 1 and 5);

-- 0007
-- Nested boards ("sub-boards"): a board can now live inside another board,
-- not just at the top level, so users can group related boards together
-- (e.g. a "Health" board containing "Fitness" and "Nutrition" sub-boards)
-- in addition to the existing Board -> Goal -> Task nesting.
--
-- Deliberately no cycle-prevention constraint here: the app only ever sets
-- parent_board_id at creation time (creating a new sub-board under an
-- existing board) and never exposes a way to re-parent an existing board,
-- so a cycle can't be created through the UI. `on delete cascade` means
-- deleting a board also deletes its sub-boards (and their goals/tasks,
-- transitively, via the existing cascades on those tables).

alter table boards add column if not exists parent_board_id uuid references boards(id) on delete cascade;

create index if not exists boards_parent_idx on boards(parent_board_id);

-- 0008
-- Estimated time to complete a task ("⏱ 25m" on the quest/task card), per
-- the design handoff's card anatomy. Nullable: existing tasks and any task
-- created without an estimate simply don't show the clock row.

alter table tasks add column if not exists estimate_minutes integer;

-- 0009
create table if not exists avatar_library (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  created_by uuid references profiles(id) on delete set null,
  prompt text,
  is_preset boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists avatar_library_image_url_key on avatar_library (image_url);

alter table avatar_library enable row level security;
drop policy if exists "Avatar library is publicly readable" on avatar_library;
create policy "Avatar library is publicly readable" on avatar_library for select using (true);

insert into avatar_library (image_url, is_preset, prompt) values
  ('/design/icon-dragon.jpg', true, 'dragon'),
  ('/design/icon-goblin.jpg', true, 'goblin'),
  ('/design/icon-sorcerer.jpg', true, 'sorcerer'),
  ('/design/icon-boar.jpg', true, 'boar'),
  ('/design/icon-golem.jpg', true, 'golem'),
  ('/design/icon-venomroot.jpg', true, 'venomroot'),
  ('/design/icon-bat.jpg', true, 'bat'),
  ('/design/avatar-ranger.jpg', true, 'ranger')
on conflict (image_url) do nothing;

-- 0010
-- Shared quest/task icon library — mirrors avatar_library (0009) but scoped
-- to task icons instead of character avatars. Every AI-generated task icon
-- gets added here (with its prompt kept as searchable metadata) so anyone
-- can browse and re-pick a previously generated icon instead of only ever
-- generating a fresh one. Replaces the old emoji/monster-emoji picker in the
-- UI entirely — task icons are AI-generated images only now.

create table if not exists task_icon_library (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  -- Null for the built-in presets seeded below (and for any row whose
  -- creator's account is later deleted).
  created_by uuid references profiles(id) on delete set null,
  prompt text,
  is_preset boolean not null default false,
  created_at timestamptz not null default now()
);

-- Re-generating the same prompt shouldn't pile up duplicate library rows.
create unique index if not exists task_icon_library_image_url_key on task_icon_library (image_url);

-- Everyone can browse the whole library (it's meant to be shared); only the
-- server (via the service-role key) inserts into it, so no insert policy is
-- needed for the anon/authenticated roles.
alter table task_icon_library enable row level security;
drop policy if exists "Task icon library is publicly readable" on task_icon_library;
create policy "Task icon library is publicly readable" on task_icon_library for select using (true);

-- The same 8 pre-made monster portraits already bundled in /public/design
-- (and already seeded as avatar presets in 0009) so the library isn't empty
-- before anyone has generated their own task icons.
insert into task_icon_library (image_url, is_preset, prompt) values
  ('/design/icon-dragon.jpg', true, 'dragon'),
  ('/design/icon-goblin.jpg', true, 'goblin'),
  ('/design/icon-sorcerer.jpg', true, 'sorcerer'),
  ('/design/icon-boar.jpg', true, 'boar'),
  ('/design/icon-golem.jpg', true, 'golem'),
  ('/design/icon-venomroot.jpg', true, 'venomroot'),
  ('/design/icon-bat.jpg', true, 'bat')
on conflict (image_url) do nothing;
