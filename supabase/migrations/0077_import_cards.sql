-- Import cards: things waiting to be triaged into the app (from notes, lists,
-- other apps). The user goes through them one by one: import (guided into a
-- quest or habit), snooze, or skip. Nothing here is a quest until imported.
create table if not exists import_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- What it would become: 'quest' or 'habit'.
  kind text not null default 'quest' check (kind in ('quest', 'habit')),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  -- Suggested steps, as plain strings: ["Pick a date", "Invite"].
  steps jsonb not null default '[]'::jsonb,
  -- Suggested repeat for habits: {"every":1,"unit":"week"} (unit day|week|month|year),
  -- optionally "times" (3 = three times per period) and "weekdays" ([1,3] = Mon, Wed; 0 = Sun).
  repeat jsonb,
  -- Human wording of the repeat or timing, shown as-is: "weekly, 30 min", "3x a week".
  repeat_text text,
  due_on date,
  minutes int check (minutes is null or minutes between 1 and 1440),
  -- A board name to suggest (matched by name when importing; may not exist yet).
  board_hint text,
  -- Where it came from: a short label and the original text.
  source_label text,
  source_text text,
  -- A batch name, so a set can be found or cleared together.
  batch text,
  status text not null default 'new' check (status in ('new', 'snoozed', 'imported', 'skipped')),
  snoozed_until timestamptz,
  decided_at timestamptz,
  -- The quest it became, once imported.
  task_id uuid references tasks(id) on delete set null,
  sort int not null default 0
);
create index if not exists import_cards_owner_status on import_cards (owner_id, status, sort, created_at);
alter table import_cards enable row level security;
