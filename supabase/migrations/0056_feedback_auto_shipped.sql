-- Marks feedback a scheduled run has already built and shipped.
alter table journal_entries add column if not exists auto_shipped_at timestamptz;
