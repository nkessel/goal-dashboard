-- One quest in more than one calendar spot (owner, Nov 5: "the same quest show up in multiple
-- calendar spots"; a quest that ran long continues the next morning). The quest's own slot stays
-- on tasks.scheduled_start/end; each further session is a row here, with its own Google event.
create table if not exists public.task_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  google_calendar_event_id text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists task_sessions_owner_idx on public.task_sessions(owner_id, starts_at);
create index if not exists task_sessions_task_idx on public.task_sessions(task_id);
alter table public.task_sessions enable row level security;
