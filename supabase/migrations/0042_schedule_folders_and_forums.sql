-- Folders on the scheduling list, and the Party forums.
alter table tasks add column if not exists schedule_folder text;
alter table profiles add column if not exists schedule_folders jsonb not null default '[]'::jsonb;

create table if not exists forum_threads (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('party','community','ideas')),
  author_id uuid references profiles(id) on delete set null,
  title text not null,
  body text not null default '',
  status text check (status in ('waiting','building','released','idea')),
  pinned boolean not null default false,
  reply_count int not null default 0,
  vote_count int not null default 0,
  created_at timestamptz not null default now(),
  last_post_at timestamptz not null default now()
);
create index if not exists forum_threads_scope_idx on forum_threads(scope, pinned desc, last_post_at desc);

create table if not exists forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references forum_threads(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists forum_posts_thread_idx on forum_posts(thread_id, created_at);

create table if not exists forum_votes (
  thread_id uuid not null references forum_threads(id) on delete cascade,
  voter_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, voter_id)
);

alter table forum_threads enable row level security;
alter table forum_posts enable row level security;
alter table forum_votes enable row level security;
