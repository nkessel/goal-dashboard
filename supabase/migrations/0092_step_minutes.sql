-- A sub-quest's own time estimate, in minutes (owner, Nov 20: sub-quests get a time estimate, set from their ⋯).
alter table public.quest_steps add column if not exists minutes smallint;
