-- Sub-tasks inside sub-tasks; tags on quests; a quest that stands for a board's current assignment.
alter table quest_steps add column if not exists parent_id uuid references quest_steps(id) on delete cascade;
create index if not exists quest_steps_parent_idx on quest_steps(parent_id);
alter table tasks add column if not exists tags text[] not null default '{}';
create index if not exists tasks_tags_idx on tasks using gin (tags);
alter table tasks add column if not exists stands_for uuid references boards(id) on delete set null;
