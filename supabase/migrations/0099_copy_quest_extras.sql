-- D2: copy the per-quest extras kept in profiles.life_wheel (questPlaces, calCardLooks, progressUnits)
-- into the tasks columns added by D1 (place, card_look, progress_unit). Nothing is deleted or
-- overwritten: the keys stay in life_wheel, a backup of them goes into life_wheel_backup first (RLS on,
-- no policies: service role only), and a column is only filled where it is still null and the quest is
-- the profile's own.

create table if not exists public.life_wheel_backup (
  profile_id uuid,
  key text,
  value jsonb,
  taken_at timestamptz not null default now()
);
alter table public.life_wheel_backup enable row level security;

insert into public.life_wheel_backup (profile_id, key, value)
select p.id, k.key, p.life_wheel -> k.key
from public.profiles p
cross join (values ('questPlaces'), ('calCardLooks'), ('progressUnits')) as k(key)
where p.life_wheel ? k.key
  and not exists (select 1 from public.life_wheel_backup b where b.profile_id = p.id and b.key = k.key);

update public.tasks t
set place = e.value #>> '{}'
from public.profiles p, jsonb_each(p.life_wheel -> 'questPlaces') e
where jsonb_typeof(p.life_wheel -> 'questPlaces') = 'object'
  and t.id::text = e.key and t.owner_id = p.id
  and jsonb_typeof(e.value) = 'string' and t.place is null;

update public.tasks t
set card_look = e.value
from public.profiles p, jsonb_each(p.life_wheel -> 'calCardLooks') e
where jsonb_typeof(p.life_wheel -> 'calCardLooks') = 'object'
  and t.id::text = e.key and t.owner_id = p.id
  and jsonb_typeof(e.value) = 'object' and t.card_look is null;

update public.tasks t
set progress_unit = e.value
from public.profiles p, jsonb_each(p.life_wheel -> 'progressUnits') e
where jsonb_typeof(p.life_wheel -> 'progressUnits') = 'object'
  and t.id::text = e.key and t.owner_id = p.id
  and jsonb_typeof(e.value) in ('object', 'string') and t.progress_unit is null;
