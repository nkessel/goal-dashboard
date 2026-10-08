-- Aspirations: things worth keeping in view that aren't actionable yet.
-- They live on their quest board but stay off Today, the map and Power-ups.
alter table tasks add column if not exists is_aspiration boolean not null default false;
