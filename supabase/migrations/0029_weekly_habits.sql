-- Habits on chosen weekdays (0 = Sunday … 6 = Saturday; null = every day),
-- optionally due by a time of day ("17:30").
alter table rites add column if not exists days smallint[];
alter table rites add column if not exists due_time text check (due_time is null or due_time ~ '^[0-2][0-9]:[0-5][0-9]$');
