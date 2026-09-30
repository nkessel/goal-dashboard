-- Estimated time to complete a task ("⏱ 25m" on the quest/task card), per
-- the design handoff's card anatomy. Nullable: existing tasks and any task
-- created without an estimate simply don't show the clock row.

alter table tasks add column if not exists estimate_minutes integer;
