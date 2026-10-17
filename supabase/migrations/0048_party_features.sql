-- Party: notification levels and email, boards shared with the party (and who
-- added a quest to one), and support calls / shared-board notifications.
alter table profiles add column if not exists notify_level text not null default 'all' check (notify_level in ('all','highlights','essential'));
alter table profiles add column if not exists notify_email boolean not null default true;
alter table boards add column if not exists shared_with_party boolean not null default false;
alter table tasks add column if not exists added_by uuid references profiles(id) on delete set null;
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind = any (array['friend_request','friend_request_accepted','reaction','comment','reschedule_reminder','level_up','daily_check_in','imports','feedback','support','shared_board']));
