-- When a quest should be planned (put on the calendar) by: "within a week" from
-- the import screen. The auto-scheduler treats it like a soft deadline.
alter table tasks add column if not exists plan_by timestamptz;
