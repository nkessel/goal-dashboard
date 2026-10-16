-- Quest steps: XP paid when a step is done, how much of the quest a step is
-- worth (percent; null = an equal share), how far along it is, and what it paid.
alter table quest_steps add column if not exists xp integer not null default 0 check (xp >= 0);
alter table quest_steps add column if not exists weight integer check (weight is null or (weight between 1 and 100));
alter table quest_steps add column if not exists progress integer not null default 0 check (progress between 0 and 100);
alter table quest_steps add column if not exists xp_paid integer not null default 0;
