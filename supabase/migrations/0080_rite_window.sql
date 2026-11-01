-- A habit with a time window (Gym anywhere 7–10 AM): due_time is the window's start,
-- window_to its end; the calendar and planner place it in the first free stretch inside.
alter table rites add column if not exists window_to text check (window_to is null or window_to ~ '^[0-2][0-9]:[0-5][0-9]$');
