-- Secret-mission steps are real quests, linked by mission id.
alter table tasks add column if not exists mission_id text;
create index if not exists tasks_mission_idx on tasks (owner_id, mission_id) where mission_id is not null;
