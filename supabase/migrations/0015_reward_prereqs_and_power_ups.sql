-- Reward prerequisites: accepting a reward can first ask for a quest
-- ("Completely empty the car") before the reward itself is revealed.
alter table rewards add column if not exists prereq_title text;
alter table rewards add column if not exists prereq_description text;
alter table rewards add column if not exists prereq_xp integer not null default 10;

-- Quests created when a reward is accepted: the reward's own quest links to
-- the reward, and stays locked behind its prerequisite quest until that's done.
alter table tasks add column if not exists reward_id uuid references rewards(id) on delete set null;
alter table tasks add column if not exists locked_by_task_id uuid references tasks(id) on delete set null;

-- Power-ups: quick-win, low-energy quests kept in their own menu.
alter table tasks add column if not exists is_power_up boolean not null default false;

-- New quests start unrated: 0 importance, 0 urgency.
alter table tasks alter column importance set default 0;
alter table tasks alter column urgency set default 0;
