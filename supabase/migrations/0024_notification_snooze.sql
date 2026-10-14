-- Snooze a notification: it hides until this time, then comes back unread.
alter table notifications add column if not exists snoozed_until timestamptz;
