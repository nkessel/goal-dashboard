# Duet: the owner's Claude changes his quests, habits and boards

**What it is.** The owner can message Claude in another app ("move the plumber call to the top of today", "mark Stretch done", "add a board called Garage") and that Claude changes the app for real. That Claude can only reach this app's database through the Supabase connector (run SQL), so there is one door: the SQL function `public.duet(action, args)`. It posts to the app's route `POST /api/duet`, which runs **the app's own logic** (the same functions the buttons use), so XP, coins, ordering, rewards, bosses, sequences and early-bird bonuses come out exactly as when he taps in the app.

```
other Claude --SQL--> public.duet(action, args) --HTTPS + key--> /api/duet --> src/lib/duet/* --> src/lib/data/quest-ops.ts (shared with actions.ts)
```

Status: built on `review/duet-tools`, **off** until the owner says yes (see "Switching it on"). Nothing on screen changes.

## Where the code is

| | |
|---|---|
| `src/app/api/duet/route.ts` | The route: checks the `x-duet-key` header, calls the dispatcher. `cache-control: no-store`. |
| `src/lib/duet/` | Dispatcher (`index.ts`), key check (`auth.ts`), reads, quests, habits, boards, undo, change log, pure helpers (`pure.ts`, tested by `scripts/test-duet.mjs`). All take the owner id as an argument; none reads a session. |
| `src/lib/data/quest-ops.ts` | The bodies moved out of `src/app/actions.ts` (`finishTaskForOwner`, `reopenTaskForOwner`, `deleteTaskForOwner`, archive/restore, `createQuestForOwner`, `setTaskPlacementForOwner`, rite complete/uncomplete/create/update, core habit). `actions.ts` calls them after `requireProfileId()`. **Rule: never export these from a `"use server"` file** (every export there is callable by any signed-in client with any arguments). When you change quest completion, change it in `quest-ops.ts`. |
| `supabase/migrations/0097_duet.sql` | `duet_changes` (the undo log, RLS on, no policies), the `http` extension, `public.duet()`. |

Auth: the header must equal `secret.duet_key` in `app_defaults` (constant-time compare; 401 if wrong, 503 if no key). The owner it acts for is `secret.duet_owner`. Both keys are server-only (never in `SHAREABLE_KEYS`, so never shown as settings). `anon` and `authenticated` cannot execute `public.duet`.

## Calling it (the other Claude)

```sql
select public.duet('today');
select public.duet('add_quest', '{"title":"Call the plumber","board":"Errands","due":"2026-11-27"}');
select public.duet('complete_quest', '{"quest":"Call the plumber"}');
select public.duet('undo');
```

Result: `{ok, change_id?, summary, data?, notes?}` or `{ok:false, error, candidates?}`. `candidates` is up to 5 `{id, title, board}`.

### Reads
- `today` `{day?}`: Today's Quests in order (`section` due_soon or chosen, ids, due, importance, urgency, xp), the Additional Quests count, that day's daily habits and evening rites with `done`. `day` is `YYYY-MM-DD`, default today in America/New_York.
- `find` `{q, kind?: quest|habit|board}`: open quests, unarchived habits, boards whose names contain `q`.
- `board` `{board}`: a board's open quests in board order, and its sub-boards.

### Quests
- `add_quest` `{title, notes?, board?, due?, importance?, urgency?, xp?, coins?, minutes?, tiny?, aspiration?, place?: top|today|additional|board_only}`. Defaults as the app's editor: 15 XP, 1 coin, importance/urgency 0, placed in Additional Quests.
- `edit_quest` `{quest, title?, notes?, board?, due?, importance?, urgency?, xp?, coins?, minutes?, tiny?, aspiration?}`. `due: null` clears it; `board: null` takes it off its board. Changing `xp` on a finished or part-done quest adjusts the XP already earned, as the app does.
- `place_quest` `{quest, where: top|today|additional|board_only}`.
- `move_quest` `{quest, above?|below?}` within Today's Quests (the chosen ones; due-soon quests sort by date).
- `complete_quest` `{quest, at?}`: `at` is a date (noon, New York), a New York date-time or a full instant; never in the future. Stand-ins finish the assignment they speak for; sequences, rewards, bosses and the early-bird bonus work as in the app.
- `reopen_quest` `{quest}` (takes XP and coins back), `archive_quest` `{quest}`, `restore_quest` `{quest}` (from the archive).

### Habits (`slot` day = a daily habit, evening = an evening rite)
- `add_habit` `{title, slot?, days?, time?, xp?, coins?, minutes?, core?, repeat?}`. `days`: names ("Mon", "thursdays", "weekdays", "weekends") or numbers **0 (Sunday) to 6 (Saturday)**, as the app stores them; all seven or none = every day. `time`: "07:30", "7am". `repeat`: `{every, unit: day|week|month|year, from?}` instead of days. `core`: for a daily habit, "always in Today's Quests" (the habit plan); for an evening rite, rite vs mini-quest. Default XP 5.
- `edit_habit` `{habit, title?, slot?, days?, time?, xp?, coins?, minutes?, core?, repeat?}` (`null` clears time, coins, minutes, repeat, days). The app has no way to move a habit between day and evening after creating it; `slot` here sets the column directly.
- `move_habit` `{habit, above?|below?}` within its slot, `complete_habit` `{habit, day?, pct?}`, `uncomplete_habit` `{habit, day?}`, `remove_habit` `{habit}` (archives), `restore_habit` `{habit}`.
- `tick_subhabit` `{habit, step, day?, on?}`: tick one sub-habit (`on: false` unticks), as the habit's checklist does in the app: a sub-habit's own XP and coins are paid, ticking the last required one completes the habit, unticking a required one of a done habit undoes it. `today` lists each habit's `sub_habits` with `done`. Code: `tickRiteStepForOwner` in `quest-ops.ts` (the app's `tickRiteStepAction` calls the same).

### Check-ins
- `check_in` `{energy?, metrics?, notes?, at?}`: `metrics` is `{"Mood": 7, "Focus": 6}` (or `[{metric, level}]`), 1 to 10 in tenths, names among the metrics he tracks (an unknown name is refused; adding a metric is done in the app); `Energy` may be given there too. `notes`: a line or a list of lines (with #tags), or `{text, details?, tone?: -2..2}`. `at`: a past moment (up to three months back); default now. The result's `data.ids` are the entries' keys.
- `check_ins` `{day?}`: that New York day's readings and notes, oldest first, each with its `key` (`e:` energy, `c:` other metric, `n:` note) and `archived` if hidden in the app.
- `remove_check_in` `{ids}`: deletes those entries for good (up to 12; keys from `check_ins`). `undo` puts them back as they were.

### Boards
- `add_board` `{title, parent?}`, `edit_board` `{board, title?, parent?}` (`parent: null` = top level), `move_board` `{board, above?|below?}` among its siblings.

### Undo
- `undo` `{change_id?}` (default: his latest change not yet undone). Edits restore the before values; `add_quest` deletes through the app's delete path (XP reversed); `add_habit` archives; `add_board` removes the board only if still empty (else it refuses and says why); complete becomes reopen (early-bird bonus taken back too, which the app's own reopen does not do) and puts the quest back where it was on Today; uncomplete becomes complete; reorders restore the old `sort_order`s; place restores the old flags.

## Rules for the Claude that calls it

1. Use these actions; **never write the tables directly** when an action exists (it would skip XP, coins and ordering).
2. Pass names or ids. If the result has `candidates`, **ask the owner which one**; never guess or retry with a different guess.
3. After a change, tell him what `summary` says and mention the `change_id`; offer to undo ("say undo and I'll put it back").
4. `notes` carry things he should know (a stand-in was completed; the calendar block wasn't changed).
5. Dates are New York. A bare date for `due` means the end of that day (the editor's 23:59).
6. Bulk changes to his quests (many due dates at once) still need his confirmation first (HANDOFF section 4).

## Not done from here

Sleep is not in this door either: the sleep and wake log is `profiles.life_wheel->'wheelOfTime'->'log'->'YYYY-MM-DD'` (`{bed, wake, effort, hindrances, at}`, the day is the morning after the night), not `check_ins`, `calendar_blocks`, `energy_log` or `check_in_notes`. Read it there before reporting a sleep log as missing (Nov 24, note c675eb5e).

Anything needing his Google token: placing or moving a quest on his calendar. If an edit would normally also lengthen a calendar block, the database part is done and a note says the block wasn't changed (it follows the next time he opens the quest in the app). Quest steps, sub-quests, scheduling, rewards, goals, failing a quest, the journal, tracked events (streaks) and adding a check-in metric are not in this door yet (owner's note d8f914be asks for every interaction in the app; the three gaps it named, sub-habit ticks, check-in metrics and notes, removing a check-in entry, were added Nov 24).

## Switching it on (needs the owner's yes)

1. Merge `review/duet-tools` to `main` (the route deploys; a `docs/`-only push wouldn't).
2. Apply `supabase/migrations/0097_duet.sql` to production.
3. Set the three secrets (the key is generated in SQL, so no one sees it):
   ```sql
   insert into app_defaults (key, value) values
     ('secret.duet_url', 'https://goal-dashboard-kappa.vercel.app/api/duet'),
     ('secret.duet_owner', (select id::text from profiles where is_admin limit 1)),
     ('secret.duet_key', encode(gen_random_bytes(24), 'hex'))
   on conflict (key) do update set value = excluded.value, updated_at = now();
   ```
4. Check: `select public.duet('today');` returns `ok: true`.
5. Tell the other Claude about it: point it at this file (its "Calling it" and "Rules" sections).

**Turn it off:** `delete from app_defaults where key = 'secret.duet_key';` (the route answers 503 and `public.duet` says it is switched off). Rotate the key by setting `secret.duet_key` again.

## Testing

- `node --experimental-strip-types scripts/test-duet.mjs` (name resolution, weekdays, clamping, dates, ordering).
- `node scripts/ui-check/duet-route-try.mjs` after a `npm run ui-check` build: starts the fake database (with the Duet keys seeded) and `next start`, then calls `today`, `tick_subhabit`, `check_in`, `check_ins`, `remove_check_in` and `undo` and prints each result.
- Route test without the real database: run `scripts/ui-check/fake-db.mjs` with `secret.duet_key` and `secret.duet_owner` seeded in `app_defaults`, start `next dev` against it (HANDOFF section 3), then POST to `/api/duet`.
