-- Notifications (Priority #9)
-- In-app notifications for social + XP + scheduling events. Email delivery
-- (for higher-value moments only, per spec) is tracked via email_sent so a
-- retry/cron job can tell what's already gone out.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade, -- recipient
  actor_id uuid references profiles(id) on delete set null,           -- who caused it (null for system events)
  kind text not null check (kind in (
    'friend_request',
    'friend_request_accepted',
    'reaction',
    'comment',
    'reschedule_reminder',
    'level_up',
    'daily_check_in'
  )),
  activity_id uuid references activity_events(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  friendship_id uuid references friendships(id) on delete cascade,
  body text not null, -- pre-rendered display text, e.g. "Priya reacted 🎉 to your completed goal"
  is_read boolean not null default false,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_idx on notifications(profile_id, created_at desc);
create index if not exists notifications_unread_idx on notifications(profile_id, is_read);

alter table notifications enable row level security;
-- No public read policy: notifications are private, server-only (service_role bypasses RLS).

-- Reschedule reminders need to know which tasks already got one, so a cron
-- sweep doesn't re-notify every run.
alter table tasks add column if not exists reminder_sent_at timestamptz;
