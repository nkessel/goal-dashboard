-- A quest can also show on other boards (it lives on board_id; also_on links it elsewhere).
alter table tasks add column if not exists also_on uuid[] not null default '{}';
create index if not exists tasks_also_on_idx on tasks using gin (also_on);
