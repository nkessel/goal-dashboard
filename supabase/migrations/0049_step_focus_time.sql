-- Time spent on each step in focus mode (for insights later).
alter table quest_steps add column if not exists seconds_spent int not null default 0;
