-- A project board's next action, and an XP kind for finishing quests early.
alter table boards add column if not exists next_task_id uuid references tasks(id) on delete set null;
alter table xp_events drop constraint if exists xp_events_kind_check;
alter table xp_events add constraint xp_events_kind_check check (kind = any (array['task_assigned','task_completed','daily_check_in','streak_bonus','level_up_adjustment','planning_ritual','early_bird']));
