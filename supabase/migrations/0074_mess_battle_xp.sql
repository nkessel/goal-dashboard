-- XP for fighting back the mess (mess check-in battles).
alter table xp_events drop constraint if exists xp_events_kind_check;
alter table xp_events add constraint xp_events_kind_check check (kind = any (array['task_assigned','task_completed','daily_check_in','streak_bonus','level_up_adjustment','planning_ritual','early_bird','mess_battle']));
