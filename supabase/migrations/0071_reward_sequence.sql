alter table public.rewards rename column prereq_steps to prereq_more;
alter table public.rewards add column if not exists followups jsonb;
