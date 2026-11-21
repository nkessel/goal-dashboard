-- Listening list (owner, Nov 20-21; docs/plans/listening-list.md): what a row on the Listening list board holds.
-- { kind: 'course' | 'app' | 'set' | 'item', app?: 'podcasts' | 'youtube', source?: text, url?: text,
--   lessonsBoard?: uuid (a course whose lessons are another board's quests),
--   items?: [{ id, title, url?, done?, doneAt? }] (lessons, shows, playlists or recordings, in his order),
--   reflections?: { [itemId or "row"]: { takeaway?, remember?: text[], replay?, rating?, notes?, at } } }
-- One-day rows use is_aspiration. Nothing outside the Listening list reads it.
alter table public.tasks add column if not exists listen jsonb;
