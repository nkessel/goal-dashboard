-- Evening: "Celebrate today's wins" and "Prepare for tomorrow's day"; meal and
-- exercise planning moves into the latter (each planning item earns XP).
update rites set title = 'Celebrate today''s wins', description = 'Look back at what you got done.' where kind = 'wins' and title = 'Appreciate recent wins';
update rites set title = 'Prepare for tomorrow''s day', description = 'Plan tomorrow''s meals, moments and quests on its hours.' where kind = 'plan';
update rites r set archived = true where r.kind is null and r.archived = false and coalesce(r.slot, 'evening') <> 'day' and r.title ilike 'plan meals%'
  and exists (select 1 from rites p where p.owner_id = r.owner_id and p.kind = 'plan' and p.archived = false);

-- A quest made by placing a planning item (a meal, a workout…) on tomorrow's
-- plan: the XP that planning paid (null for ordinary quests).
alter table tasks add column if not exists plan_xp integer;
