-- Special evening rites that carry their own content:
--   'wins'     — appreciate recent wins (expands to show them)
--   'tomorrow' — choose tomorrow's quests (earns its XP once all three are picked)
-- At most one live rite of each kind per person, so they're never seeded twice.
alter table rites add column if not exists kind text;
create unique index if not exists rites_owner_kind_uniq on rites(owner_id, kind) where kind is not null and archived = false;

-- Skipping a habit for a day on purpose (it ends the habit's streak).
create table if not exists habit_skips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  rite_id uuid not null references rites(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (owner_id, rite_id, day)
);
create index if not exists habit_skips_owner_day_idx on habit_skips(owner_id, day);
alter table habit_skips enable row level security;
