-- Importance/urgency can now be set to 0 (the quest editor's 0-5 icon pickers).
alter table tasks drop constraint if exists tasks_importance_check;
alter table tasks drop constraint if exists tasks_urgency_check;
alter table tasks add constraint tasks_importance_check check (importance between 0 and 5);
alter table tasks add constraint tasks_urgency_check check (urgency between 0 and 5);
