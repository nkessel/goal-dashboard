-- Priority Matrix parking lots, boards on the matrix, and fine-grained effort.
--
-- tasks.matrix_state: where a quest sits on the matrix screen.
--   null        on the map when rated, otherwise in "Not yet plotted"
--   'unplotted' in "Not yet plotted" (keeps its ratings)
--   'later'     in "Save for later"
--   'hidden'    removed from the matrix (bring it back with +)
alter table tasks add column if not exists matrix_state text
  check (matrix_state in ('unplotted', 'later', 'hidden'));

-- Effort takes one decimal place, like importance and urgency, so a quest
-- can be dropped anywhere on the impact/effort map.
alter table tasks alter column effort type numeric(3,1) using effort::numeric(3,1);

-- A board can be plotted as one item (e.g. a course instead of each assignment).
--   matrix_state null = not on the matrix; 'plot' = on the map (or in
--   "Not yet plotted" while unrated); 'unplotted'; 'later'.
alter table boards add column if not exists matrix_state text
  check (matrix_state in ('plot', 'unplotted', 'later'));
alter table boards add column if not exists importance numeric(3,1) not null default 0
  check (importance between 0 and 5);
alter table boards add column if not exists urgency numeric(3,1) not null default 0
  check (urgency between 0 and 5);
alter table boards add column if not exists effort numeric(3,1) not null default 0
  check (effort between 0 and 5);
alter table boards add column if not exists icon_key text;
alter table boards add column if not exists icon_source text not null default 'library';
