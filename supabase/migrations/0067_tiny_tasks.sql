-- Tiny tasks: quick quests (5 minutes by default) drawn half height on Today,
-- with just a check box unless you give them a portrait.
alter table tasks add column if not exists is_tiny boolean not null default false;
