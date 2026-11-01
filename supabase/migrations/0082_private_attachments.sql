-- Private files kept with a quest (a form to fill in, a filled application...).
-- The bytes live here, readable only through the server (RLS on, no policies);
-- the app serves them to their owner at /api/attachments/<id>.
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  mime text not null default 'application/octet-stream',
  size integer not null default 0,
  data bytea,
  created_at timestamptz not null default now()
);
create index if not exists attachments_owner_idx on public.attachments(owner_id);
alter table public.attachments enable row level security;

-- What a card or quest carries: [{ "id": uuid, "name": text, "size": int }].
alter table public.import_cards add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists attachments jsonb not null default '[]'::jsonb;
