-- A quest step can be skipped or failed (null = open or done).
alter table quest_steps add column if not exists state text check (state is null or state in ('skipped','failed'));
