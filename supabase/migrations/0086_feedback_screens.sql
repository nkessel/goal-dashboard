-- Feedback organized by screen (owner, Nov 12: "make sure feedback is organized by screen (or universal)
-- so we can look at them when updating screens"). Keys live in src/lib/feedback-screens.ts.
alter table public.journal_entries add column if not exists screens text[];
comment on column public.journal_entries.screens is 'Feedback notes only: which screens a note is about (keys in src/lib/feedback-screens.ts; ''universal'' = app-wide). Guessed when sent, corrected by hand.';
create index if not exists journal_entries_feedback_screens_idx on public.journal_entries using gin (screens) where kind = 'feedback';
