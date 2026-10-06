-- Flexible tasks: things like "get a haircut" or "clean the car" that don't
-- belong in a fixed calendar slot (which urgent work keeps bumping), but do
-- need to happen within some window.
--
--   due_by     — "sometime before this date". The task floats until then and
--                surfaces in Today's "Due soon" list as the window closes.
--   context    — where the task can be done ('out', 'home', 'computer',
--                'phone'), so errands can be batched: "I'm out driving"
--                pulls up the haircut, car wash and gym together.
--   is_upkeep  — life-maintenance task; Today offers one upkeep task a day
--                so it doesn't get eaten by urgent work.
--
-- Gap fillers need no column: they're open, unscheduled tasks with an
-- estimate of 20 minutes or less (tasks.estimate_minutes).

alter table tasks add column if not exists due_by date;
alter table tasks add column if not exists context text;
alter table tasks add column if not exists is_upkeep boolean not null default false;

alter table tasks drop constraint if exists tasks_context_check;
alter table tasks add constraint tasks_context_check
  check (context is null or context in ('out', 'home', 'computer', 'phone'));

create index if not exists tasks_due_by_idx on tasks(owner_id, due_by) where status = 'open';
