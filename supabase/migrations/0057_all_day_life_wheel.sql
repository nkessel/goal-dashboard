-- All-day events in Insights, and the life wheel's areas.
alter table check_in_notes add column if not exists all_day boolean not null default false;
alter table profiles add column if not exists life_wheel jsonb;
