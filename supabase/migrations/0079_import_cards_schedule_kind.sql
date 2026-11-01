-- Import cards can also be "to schedule": a quest that goes onto the list to schedule.
alter table import_cards drop constraint if exists import_cards_kind_check;
alter table import_cards add constraint import_cards_kind_check check (kind in ('quest', 'habit', 'schedule'));
-- When a "to schedule" card should be planned within (days from import); optional.
alter table import_cards add column if not exists plan_within_days int check (plan_within_days is null or plan_within_days between 0 and 366);
