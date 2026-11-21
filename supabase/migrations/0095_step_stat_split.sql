-- A sub-quest's own stat split (owner, Nov 21: "make sure the stat assigner is standardized across the app").
-- Null = it follows its quest's split; set = its share of the quest's XP goes to these stats instead.
alter table public.quest_steps add column if not exists stat_split jsonb;
