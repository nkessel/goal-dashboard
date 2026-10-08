-- Two kinds of thing only: quest boards (which nest) and quests. Quests now
-- belong to a board directly; the old middle "goal" layer is folded into quests.
alter table tasks add column if not exists board_id uuid references boards(id) on delete set null;
create index if not exists tasks_board_idx on tasks(board_id);

-- Quests that sat under a goal move to that goal's board.
update tasks t set board_id = g.board_id
from goals g
where t.goal_id = g.id and t.board_id is null;

-- Each goal becomes a quest on its board (progress carried over), except the
-- empty "General" placeholders. Safe to re-run: skips ones already converted.
insert into tasks (owner_id, board_id, title, description, importance, urgency, xp_value, progress, status, completed_at, created_at)
select g.owner_id, g.board_id, g.title, g.description, 0, 0, 0, g.progress,
       case when g.completed_at is not null then 'completed' else 'open' end, g.completed_at, g.created_at
from goals g
where not (g.title = 'General' and not exists (select 1 from tasks t where t.goal_id = g.id))
  and not exists (select 1 from tasks t where t.board_id = g.board_id and t.title = g.title);
