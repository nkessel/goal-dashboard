-- What your party can see: one switch per screen (Today on by default), and private quests.
alter table profiles add column if not exists share_settings jsonb not null default '{"today": true}'::jsonb;
alter table tasks add column if not exists is_private boolean not null default false;
