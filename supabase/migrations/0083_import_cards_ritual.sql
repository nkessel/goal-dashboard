-- Rituals of connection (made together, e.g. a couples covenant): their own kind of import card.
alter table import_cards drop constraint if exists import_cards_kind_check;
alter table import_cards add constraint import_cards_kind_check check (kind in ('quest', 'habit', 'schedule', 'reward', 'project', 'shopping', 'done', 'ritual'));
