-- Which Google calendars show on the Quest Calendar, and their folders.
alter table profiles add column if not exists calendar_sources jsonb;
