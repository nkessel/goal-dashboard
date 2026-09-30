-- Goal Dashboard: core schema (Suggested Build Priority step 1)
-- Entities: profiles (User), boards, goals, tasks, xp/weekly budget, friendships
-- Auth identity comes from NextAuth (Google OAuth); `profiles.id` mirrors the
-- NextAuth user id (a UUID we generate at first sign-in) rather than Supabase Auth.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Users / profiles
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique not null,          -- Google account's stable subject id
  email text unique not null,
  name text,
  avatar_url text,
  theme text not null default 'calm' check (theme in ('calm', 'adventure')),
  level int not null default 1 check (level between 1 and 10),
  total_xp int not null default 0,
  weekly_xp_budget int not null default 100,
  streak_count int not null default 0,
  streak_protection_tokens int not null default 0,
  last_check_in_at timestamptz,
  is_public boolean not null default true,  -- default visibility for new boards/goals
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Goal Boards
-- ---------------------------------------------------------------------------
create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  color text,
  is_private boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boards_owner_idx on boards(owner_id);

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  progress smallint not null default 0 check (progress between 0 and 100), -- manually-set slider, decoupled from subtasks
  is_private boolean not null default false, -- overrides board default when set
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists goals_board_idx on goals(board_id);
create index if not exists goals_owner_idx on goals(owner_id);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  goal_id uuid references goals(id) on delete set null, -- optional: subtask of a goal (organizational only)
  title text not null,
  description text,

  -- Eisenhower matrix: separate importance/urgency, not a single priority number
  importance smallint not null default 3 check (importance between 1 and 5),
  urgency smallint not null default 3 check (urgency between 1 and 5),

  reschedule_count int not null default 0, -- drives redness gradient in UI (1..8+)

  color text,          -- optional custom color; blended with/overridden by redness indicator
  icon_key text,       -- curated "monster profile" key, or external icon-library id
  icon_source text default 'monster' check (icon_source in ('monster', 'library')),

  xp_value int not null default 0, -- user-assigned, constrained by weekly budget at write time

  is_on_calendar boolean not null default false,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  google_calendar_event_id text,

  is_manual_priority boolean not null default false, -- in the manually curated top 1-3 list

  status text not null default 'open' check (status in ('open', 'completed')),
  completed_at timestamptz, -- supports retroactive completion (user-editable timestamp)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_owner_idx on tasks(owner_id);
create index if not exists tasks_goal_idx on tasks(goal_id);
create index if not exists tasks_status_idx on tasks(owner_id, status);
create index if not exists tasks_scheduled_idx on tasks(scheduled_start);

-- Tasks <-> multiple Goal Boards (a task "belongs to zero or more Goal Boards")
create table if not exists task_boards (
  task_id uuid not null references tasks(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  primary key (task_id, board_id)
);

-- ---------------------------------------------------------------------------
-- XP ledger + weekly budget tracking (auditable, not just a running total)
-- ---------------------------------------------------------------------------
create table if not exists xp_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  kind text not null check (kind in ('task_assigned', 'task_completed', 'daily_check_in', 'streak_bonus', 'level_up_adjustment')),
  amount int not null,
  week_start date not null, -- Monday of the ISO week this counts against for budget purposes
  created_at timestamptz not null default now()
);

create index if not exists xp_events_owner_week_idx on xp_events(owner_id, week_start);

-- ---------------------------------------------------------------------------
-- Friendships (directory-based v1: any user can send/accept a request)
-- ---------------------------------------------------------------------------
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friendships_addressee_idx on friendships(addressee_id, status);
create index if not exists friendships_requester_idx on friendships(requester_id, status);

-- Invite links (bring-a-friend v1 flow)
create table if not exists invite_links (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id) on delete cascade,
  code text unique not null default encode(gen_random_bytes(6), 'hex'),
  uses_count int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Activity feed: completions, reactions (any emoji), full-text comments
-- ---------------------------------------------------------------------------
create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('task_completed', 'goal_completed', 'level_up')),
  task_id uuid references tasks(id) on delete cascade,
  goal_id uuid references goals(id) on delete cascade,
  is_public boolean not null default true, -- resolved from board/goal privacy at write time
  created_at timestamptz not null default now()
);

create index if not exists activity_events_owner_idx on activity_events(owner_id, created_at desc);
create index if not exists activity_events_public_idx on activity_events(is_public, created_at desc);

create table if not exists activity_reactions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activity_events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  emoji text not null, -- any emoji, not a fixed set
  created_at timestamptz not null default now(),
  unique (activity_id, profile_id, emoji)
);

create table if not exists activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activity_events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activity_comments_activity_idx on activity_comments(activity_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  foreach t in array array['profiles','boards','goals','tasks','friendships','activity_comments']
  loop
    execute format('drop trigger if exists set_updated_at on %I;', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Server routes use the Supabase service_role key (bypasses RLS) since auth
-- is handled by NextAuth, not Supabase Auth. These policies are a backstop
-- in case the anon/public key is ever used directly from the client.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table boards enable row level security;
alter table goals enable row level security;
alter table tasks enable row level security;
alter table task_boards enable row level security;
alter table xp_events enable row level security;
alter table friendships enable row level security;
alter table invite_links enable row level security;
alter table activity_events enable row level security;
alter table activity_reactions enable row level security;
alter table activity_comments enable row level security;

-- Public read of public profiles/boards/goals/activity (directory + feed browsing)
create policy profiles_public_read on profiles for select using (true);
create policy boards_public_read on boards for select using (not is_private);
create policy goals_public_read on goals for select using (not is_private);
create policy activity_public_read on activity_events for select using (is_public);
create policy reactions_public_read on activity_reactions for select using (true);
create policy comments_public_read on activity_comments for select using (true);

-- No anon/public writes; all mutations go through server routes using the
-- service_role key, which bypasses RLS entirely.
