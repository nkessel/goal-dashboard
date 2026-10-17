-- Unsent feedback drafts, kept on the account so they survive reloads, tabs and devices.
alter table profiles add column if not exists feedback_drafts jsonb not null default '[]'::jsonb;
