-- Imported quests announce themselves as a notification (snooze or read it)
-- instead of a popup.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'friend_request', 'friend_request_accepted', 'reaction', 'comment',
  'reschedule_reminder', 'level_up', 'daily_check_in', 'imports'
));
