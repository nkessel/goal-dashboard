-- Habits that repeat on an interval: every N days, weeks, months or years,
-- counted from a start date. Such a habit comes up on each occurrence and
-- stays up until it's done, skipped or the next occurrence comes round.
-- { "every": 1, "unit": "year", "from": "2026-10-30" }; null = the weekday schedule (days).
alter table rites add column if not exists repeat jsonb;
