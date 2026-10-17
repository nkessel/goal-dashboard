-- HP: five hearts (counted in halves). Missed non-negotiables cost half a heart; finished quests heal.
alter table profiles add column if not exists hp smallint not null default 10 check (hp between 0 and 10);
alter table profiles add column if not exists hp_checked_day date;
