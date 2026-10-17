-- An honorary level the owner can grant; whoever has one can set it anywhere from 1 to 99.
-- It's what others see; real progress (XP, bosses, perks) carries on underneath.
alter table profiles add column if not exists display_level smallint check (display_level between 1 and 99);
