-- "How do you feel?" after a victory, a fail and a habit tick (owner, Nov 19): five faces, -2 … 2,
-- the same scale as an event's tone (check_in_notes.tone). Null = not asked or skipped.
alter table tasks add column if not exists felt smallint check (felt between -2 and 2);
alter table rite_completions add column if not exists felt smallint check (felt between -2 and 2);
