-- Lets the Priority Matrix place a quest with one decimal of precision
-- (e.g. importance 3.4) instead of snapping to whole 1-5 steps. Widen the
-- columns from smallint to numeric(3,1) and relax the integer check to a
-- ranged decimal check.

alter table tasks alter column importance type numeric(3,1) using importance::numeric(3,1);
alter table tasks alter column urgency type numeric(3,1) using urgency::numeric(3,1);

alter table tasks drop constraint if exists tasks_importance_check;
alter table tasks drop constraint if exists tasks_urgency_check;

alter table tasks add constraint tasks_importance_check check (importance between 1 and 5);
alter table tasks add constraint tasks_urgency_check check (urgency between 1 and 5);
