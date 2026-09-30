-- Manual drag-to-reorder for goals (within a board) and tasks (within the
-- Today view's pinned/other lists). Boards already had sort_order from the
-- initial schema; this brings goals and tasks up to the same pattern.

alter table goals add column if not exists sort_order int not null default 0;
alter table tasks add column if not exists sort_order int not null default 0;

-- Backfill existing rows so the new column reflects today's display order
-- (creation order) rather than leaving everything at 0, which would make
-- the very first drag jump every row's relative position at once.
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

create index if not exists goals_board_sort_idx on goals(board_id, sort_order);
create index if not exists tasks_owner_sort_idx on tasks(owner_id, sort_order);
