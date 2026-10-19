-- The auto-scheduler's settings (planning hours, daily cap) and each quest's preferred time of day.
alter table profiles add column if not exists scheduler jsonb;
