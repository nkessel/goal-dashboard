-- A quest can be failed (owner, Nov 6 and 13): it leaves the open lists like a finished one
-- (status 'completed', nothing paid) and shows a red X instead of a green check. Undo reopens it.
alter table public.tasks add column if not exists failed_at timestamptz;
alter table public.tasks add column if not exists fail_reason text;
comment on column public.tasks.failed_at is 'Set when the quest was marked failed (status is completed, xp_awarded 0).';
