-- Spark map (the interest-based nervous system): how interesting, novel and
-- challenging a quest feels, 0–5 each; null = not rated yet. (Urgency
-- already has its own column.)
alter table tasks add column if not exists interest smallint check (interest between 0 and 5);
alter table tasks add column if not exists novelty smallint check (novelty between 0 and 5);
alter table tasks add column if not exists challenge smallint check (challenge between 0 and 5);
