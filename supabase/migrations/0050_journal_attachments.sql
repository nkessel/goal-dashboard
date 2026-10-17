-- Screenshots attached to feedback (public image URLs).
alter table journal_entries add column if not exists attachments jsonb not null default '[]'::jsonb;
