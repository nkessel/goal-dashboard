-- XP a journal entry paid (feedback earns the 1–3 XP its writer picks).
alter table journal_entries add column if not exists xp_awarded integer not null default 0;
