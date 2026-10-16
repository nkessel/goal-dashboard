-- The scheduling priority list: quests waiting to be put on the calendar, in order
-- (the first three are numbered). Null = not on the list.
alter table tasks add column if not exists schedule_rank integer;
create index if not exists tasks_schedule_rank on tasks (owner_id, schedule_rank) where schedule_rank is not null;
