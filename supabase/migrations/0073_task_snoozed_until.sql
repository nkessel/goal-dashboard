alter table public.tasks add column if not exists snoozed_until timestamptz;
