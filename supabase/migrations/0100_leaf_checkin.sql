-- The leaf (cannabis) log asks why and how you feel, and follows up afterwards (owner, Nov 24; mockup codes WI, WB, WR).
-- A leaf log is a check_in_notes row with body '🍃 Cannabis'. `tone` on it now means the AFTER face (the follow-up);
-- the face given when logging goes in before_tone. Old leaf logs keep what they have (their `details` is read as the reason).
-- All columns are nullable, so every other note is unchanged. RLS is already on the table. The Duet reads this table
-- through its own column list (src/lib/duet/checkins.ts), so nothing else needs to change.
alter table check_in_notes add column if not exists reason text;
alter table check_in_notes add column if not exists before_tone smallint check (before_tone between -2 and 2);
alter table check_in_notes add column if not exists before_feelings text[];
alter table check_in_notes add column if not exists after_feelings text[];
alter table check_in_notes add column if not exists outcome text check (outcome in ('yes', 'partly', 'no'));
alter table check_in_notes add column if not exists after_note text;
alter table check_in_notes add column if not exists reflected_at timestamptz;
