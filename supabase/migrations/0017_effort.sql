-- How much energy a quest takes, 0–5 (0 = unrated). Lets the Power-ups list
-- (every quest of 15 minutes or less) filter by max effort.
alter table tasks add column if not exists effort integer not null default 0 check (effort between 0 and 5);
