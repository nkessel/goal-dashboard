-- The toucan spirit's add-ons: what's been bought, and what it's wearing.
alter table profiles add column if not exists toucan jsonb not null default '{"owned":[],"equipped":{}}'::jsonb;
