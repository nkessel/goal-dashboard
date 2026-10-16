-- Tomorrow's quests carry two orders: queue_rank (how important) and
-- queue_seq (the order you'll do them). The morning lists Today's Quests in
-- sequence and keeps queue_rank so each card can show its importance.
alter table tasks add column if not exists queue_seq smallint;

-- The day planner's quick-event buttons (meals, exercise, ...), per person.
alter table profiles add column if not exists quick_events jsonb;
