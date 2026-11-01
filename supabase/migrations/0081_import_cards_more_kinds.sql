-- Older to-do lists mix kinds: rewards (Treasure Chest), projects (a board with its quests
-- in steps), shopping (a buy list in steps) and things already done (log them as done, or skip).
alter table import_cards drop constraint if exists import_cards_kind_check;
alter table import_cards add constraint import_cards_kind_check check (kind in ('quest', 'habit', 'schedule', 'reward', 'project', 'shopping', 'done'));
