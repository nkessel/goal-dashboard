-- Guard profiles.life_wheel (owner's note 4401e65a, Nov 19: his Keep in touch list and ~15 other
-- saved settings vanished). Every app write is meant to merge into life_wheel; a write that leaves
-- top-level keys out (a stale or failed read before writing) used to delete them. Now an update keeps
-- every top-level key the new value doesn't mention, and records which keys a write left out, so the
-- writer can be found. Nested values are still replaced as before.
create table if not exists life_wheel_drops (
  id bigserial primary key,
  profile_id uuid not null,
  at timestamptz not null default now(),
  missing text[] not null
);
alter table life_wheel_drops enable row level security;

create or replace function keep_life_wheel_keys() returns trigger
language plpgsql security definer set search_path = public as $$
declare gone text[];
begin
  if old.life_wheel is null then return new; end if;
  if new.life_wheel is null then new.life_wheel := old.life_wheel; return new; end if;
  select array_agg(k) into gone from jsonb_object_keys(old.life_wheel) k where not (new.life_wheel ? k);
  if gone is not null then
    insert into life_wheel_drops (profile_id, missing) values (new.id, gone);
    new.life_wheel := old.life_wheel || new.life_wheel;
  end if;
  return new;
end $$;

drop trigger if exists keep_life_wheel_keys on profiles;
create trigger keep_life_wheel_keys before update of life_wheel on profiles
  for each row execute function keep_life_wheel_keys();
