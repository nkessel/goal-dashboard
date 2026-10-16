-- The app's owner reviews feedback sent by other people in their party.
-- (Mark the owner with: update profiles set is_admin = true where id = '<profile id>';)
alter table profiles add column if not exists is_admin boolean not null default false;

-- The owner's decision on each piece of feedback; null = not reviewed yet.
--   global   = build it for everyone
--   personal = build it just for the person who asked
--   later    = saved for later
--   skipped  = not planned
alter table journal_entries add column if not exists review_status text
  check (review_status in ('global', 'personal', 'later', 'skipped'));
alter table journal_entries add column if not exists reviewed_at timestamptz;

-- A notification for the owner when new feedback arrives.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'friend_request', 'friend_request_accepted', 'reaction', 'comment',
  'reschedule_reminder', 'level_up', 'daily_check_in', 'imports', 'feedback'
));
