-- Sub-quests can pay coins as well as XP (owner, Nov 14). coins_paid records what a step has paid,
-- so unticking it takes them back.
alter table public.quest_steps add column if not exists coins integer not null default 0;
alter table public.quest_steps add column if not exists coins_paid integer not null default 0;
