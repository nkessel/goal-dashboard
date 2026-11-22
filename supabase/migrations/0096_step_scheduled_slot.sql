-- A sub-quest on the calendar (owner, Nov 21, Run B item 9 "When"): its own block, with its own Google event.
-- Null = not on the calendar. Nothing reads these yet except the schedule/unschedule actions.
alter table public.quest_steps add column if not exists scheduled_start timestamptz;
alter table public.quest_steps add column if not exists scheduled_end timestamptz;
alter table public.quest_steps add column if not exists google_calendar_event_id text;
create index if not exists quest_steps_scheduled_idx on public.quest_steps (owner_id, scheduled_start) where scheduled_start is not null;
