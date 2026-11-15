-- Events: how it felt on five faces (owner, Nov 13): -2 Bad, -1 Poor, 0 OK, 1 Good, 2 Great.
-- The old minus / neutral / plus (-1, 0, 1) keep their values.
alter table check_in_notes drop constraint if exists check_in_notes_tone_check;
alter table check_in_notes add constraint check_in_notes_tone_check check (tone between -2 and 2);
