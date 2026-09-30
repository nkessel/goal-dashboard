-- Nested boards ("sub-boards"): a board can now live inside another board,
-- not just at the top level, so users can group related boards together
-- (e.g. a "Health" board containing "Fitness" and "Nutrition" sub-boards)
-- in addition to the existing Board -> Goal -> Task nesting.
--
-- Deliberately no cycle-prevention constraint here: the app only ever sets
-- parent_board_id at creation time (creating a new sub-board under an
-- existing board) and never exposes a way to re-parent an existing board,
-- so a cycle can't be created through the UI. `on delete cascade` means
-- deleting a board also deletes its sub-boards (and their goals/tasks,
-- transitively, via the existing cascades on those tables).

alter table boards add column if not exists parent_board_id uuid references boards(id) on delete cascade;

create index if not exists boards_parent_idx on boards(parent_board_id);
