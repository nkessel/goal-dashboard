-- Secret missions: private long quests with their own steps, kept in settings.
alter table profiles add column if not exists secret_missions jsonb not null default '[]'::jsonb;
