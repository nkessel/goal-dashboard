-- Events: a title (body) with optional details shown on hover, and how it felt: -1 minus, 0 neutral, 1 plus.
alter table check_in_notes add column if not exists details text;
alter table check_in_notes add column if not exists tone smallint check (tone in (-1, 0, 1));
