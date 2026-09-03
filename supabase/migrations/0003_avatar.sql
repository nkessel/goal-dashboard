-- Avatar customization (Priority #10). Theme (calm/adventure) already
-- exists on profiles from the initial schema.
alter table profiles add column if not exists avatar_base text not null default '🙂';
alter table profiles add column if not exists avatar_color text not null default '#6366f1';
alter table profiles add column if not exists avatar_accessory text;
