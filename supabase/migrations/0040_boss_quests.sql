-- A level boss's sessions can be real quests: completing one counts toward the boss.
alter table tasks add column if not exists boss_id uuid references level_bosses(id) on delete set null;
create index if not exists tasks_boss_id on tasks (boss_id) where boss_id is not null;
