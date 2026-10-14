-- Tomorrow's Quests: picked during the evening routine, promoted into
-- Today's Quests when the app's day turns over (5:30am).
alter table tasks add column if not exists queued_for date;
alter table tasks add column if not exists queue_rank smallint;
create index if not exists tasks_owner_queued_idx on tasks(owner_id, queued_for) where queued_for is not null;
