-- When a completion was recorded (a quest done yesterday but logged today counts in today's victories).
alter table tasks add column if not exists logged_at timestamptz;
