-- The weekly check-in with a partner is a planning session too.
alter table planning_sessions drop constraint if exists planning_sessions_kind_check;
alter table planning_sessions add constraint planning_sessions_kind_check check (kind in ('week','month','pair'));
