-- How long a quest actually took (Engage Quest: the timer, or minutes typed in), owner Nov 10.
alter table public.tasks add column if not exists minutes_spent integer;
comment on column public.tasks.minutes_spent is 'How long the quest actually took, from Engage Quest (timer or typed).';
