# The calendar as a real planner: design and build order

Written Nov 16, 2026 (design only, nothing built). Covers the owner's notes: undo and redo [3e14a8c0], repeating events and travel time [13c5ba6a], daily essentials as real events that hold their time [3e7e0b78, 68e84514], "rescheduled at the wrong time" [a5f87cf1], and the glitchy opening of the calendar (owner, Nov 16: "showing 14-day view before what the user used last, and lots of flickering").

Everything here was found by reading the code on `main` (after pull request 6). Nothing was reproduced in a browser, so each build step starts by confirming its cause with a test. Lines are as of Nov 16.

## 0. The owner's answers (Nov 16)

1. **Snoozing a quest that already has a calendar time: ask each time.** In place, three pills under the snooze: "Same time that day" · "Take it off the calendar" · "Leave it where it is". Each is one undoable step.
2. **A repeating quest** is a fresh quest each time, with its own XP, on Today on its day.
3. **A repeating item marked for Google** becomes one true repeating event there.
4. **Travel time is app-only.** Google Calendar has no travel-time field, so sending it would mean an extra event per trip; not done unless he asks.
5. **Lunch never shrinks.** When there is no free gap for it, it keeps its full length and stands side by side with what's there.
6. Undo's reach (not answered, default stands): any change to a time, from any screen, can be undone from the calendar during the same visit.
7. Still his to pick: the look of the "add to Google Calendar" check, from the three UX teams (step 9).

**His Nov 16 notes on daily events are part of step 7:** drag daily non-negotiables and habits [1ecfbf74]; a dragged one becomes a calendar appointment at the time it was moved to, with "Turn into quest card" kept [d2caf0ac]; right-click "Add a different quest here" lets him drag the new quest's block and moves the daily event to another spot by itself [1ecfbf74]; one day's event (today's lunch) can become a quest without all of them becoming quests [f7f0f274]; the menu's two edit buttons become one editor, reusing the existing one (XP, coins, avatar) [d2caf0ac]. Editor polish in the same step: the sleep tracker's time picker for the range and a simpler length picker [f7f0f274, 9599ee19], a save button at the lower right [cdfda496], edit buttons on hover and an up caret to close the section [aafd005c], room for the full name "Clean up & breakfast prep" [93b843eb].

## 1. Causes found

### 1a. The calendar opens glitchy (four separate causes, biggest first)

1. **The server draws the grid in the wrong time zone.** `WeekView` is drawn on the server first, and the server's clock is UTC. Items are placed with `isSameDay`, `getHours` and `gridStart` in the server's zone (`WeekView.tsx` about 1042–1063, `calendar-task-window.ts`), so the first picture has every card 4–5 hours late, evening items in the next day's column, and afternoon items hidden as "after 10:30 pm". When the browser takes over, the text and structure don't match, so React throws the server's picture away and redraws the page. That is a full flash on every direct load (opening the app on the calendar, a refresh, the iPhone home-screen app waking). The UI check never caught it because its server and browser share one time zone.
2. **Before it has measured the screen, the grid shows every loaded day.** `CalendarLayers` loads 7 extra days each side (`BUFFER = 7`) so days scroll seamlessly. `WeekView` starts with `colWidth = 0` and in that state lays out all of them as equal columns (`repeat(days.length, minmax(0, 1fr))`, lines 1212 and 1252). A day view is 15 squeezed columns, 3 days is 17, a week is 21. That is the "14-day view" seen first. On a direct load it stays until the script has loaded.
3. **What the device remembers is read after the first picture.** Days zoom (`calendar-day-span`, a part-day number like 2.6), hour zoom (`ZOOM_KEY`), the layers (hidden calendars, done quests, essentials look; `useSyncExternalStore` with defaults on the server), early/late hours and the scroll spot are each read from browser storage in an effect, so each causes its own redraw: columns change width, rows change height, events appear or vanish.
4. **A stale copy from the bottom bar.** `BottomNav` fully prefetches `/calendar` (no view named) and keeps it for 60 seconds (`staleTimes.static`). The page picks the view from the `cal-view-<id>` cookie at that moment. A copy fetched before the view changed shows the old view first.

Also seen: after a sideways scroll or zoom settles, `router.replace` reloads the page data with a new range (by design); with cause 3 fixed this no longer shows.

**Fixes (step 1):**
- Draw cards, essentials and the now-line only in the browser: a `useHydrated()` (`useSyncExternalStore(() => () => {}, () => true, () => false)`) gates `items` and `DailyBlocks`. The server draws the empty grid, hours and day headers (those come from date keys and are right). Moving between tabs inside the app mounts in the browser, so nothing is delayed there.
- While `colWidth === 0`, draw only the visible days (`days.slice(buffer, buffer + vis)`) at `1fr`. After measuring, in the same layout pass, draw all loaded days and set the scroll spot. No squeezed picture can ever show.
- One cookie `cal-ui-<id>` (view, n, span, hour zoom, early/late; the layers' few switches) written wherever those are saved today; `calendar/page.tsx` reads it and passes them as starting values, so the first picture is the final one. Keep browser storage as the fallback.
- `BottomNav`: don't fully prefetch `/calendar`; fetch on pointer down (it already does) so the cookie is read at tap time.
- UI check: run the server with `TZ=UTC` and the browser context with `timezoneId: "America/New_York"`, and add a check that fails on a React hydration error and on a layout shift of the calendar grid after first paint.

### 1b. "Rescheduling an item in the today screen did not place it in the correct place in the calendar" [a5f87cf1]

The note is from Nov 5 and the picker has been rebuilt since, so the exact case can't be replayed. Five things in today's code each put a rescheduled quest in the wrong place:

1. **Two records of "when" that don't know about each other.** Today's snooze (`snoozeQuestAction`, `snoozeQuestUntilAction`, `tomorrow.ts` `snoozeToTomorrow`) changes `queued_for` / `snoozed_until` only. A quest with a calendar time keeps `scheduled_start`, `is_on_calendar` and its Google event, so the calendar still shows it at the old time. This is the root problem and section 2 removes it.
2. **The picker's day chips don't move the pick** (`WhenPicker.tsx`). `pick` is an exact moment; `setDayIdx` changes only the day shown. Pick 2:00, tap "Tmrw": the foot reads "Tmrw 2:00–3:00" (`dayChip(dayIdx)` beside `hm(pick)`) and "Place it" stays lit, but the quest is placed today. The same happens when a quest's current time is outside the 7 days shown (yesterday): the foot says "Today".
3. **A Google failure stops the app's own move.** `attachCalendarEvent` calls `updateCalendarEvent` first and it throws (event deleted in Google, permission expired), so `rescheduleTask` never runs and the quest stays where it was. `moveSession` already does this the right way round (catch, then move).
4. **Times outside 7 am–10:30 pm.** `outside()` hides them behind the early/late buttons and `offset()` clamps a card that starts before 7 to the top edge, so it looks placed at 7. The picker allows any time inside the scheduler's day range.
5. **The time-zone picture in 1a.1**: after a direct load the card can be seen at the UTC time for a moment.

**Fixes (step 2):** changing the day keeps the time of day (`pick = day start + minutes of old pick`, clamped), and the foot's day label comes from `pick`, never `dayIdx`; a pick outside the window is cleared. Move the app's time first, then Google, and keep Google failures as a quiet "Google didn't take it" line. After placing outside the shown hours, open early/late and scroll to it. Snooze asks each time (answer 1).

### 1c. "I don't know what happened to Lunch" [68e84514]

- Essentials are **not items**. `DailyBlocks` draws them as a layer under the cards (`zIndex 0`), outside the lane layout, so anything placed or dragged at that time is simply drawn over them.
- Where a hold sits is **worked out again by every surface** (`WeekView` `DailyBlocks`, `WhenPicker`, `AutoScheduler`, each with its own busy list), so they disagree, and it moves whenever anything nearby changes.
- `holdAt` returns `null` when the range is full; the hold is then drawn "crowded" or not at all.
- A day's change ("Keep it here", skip) is saved by **sending the whole settings object** from the browser's own copy (`day-holds.ts` → `saveSchedulerSettingsAction`). Two tabs, or a stale copy, wipe each other's changes ("Keep it here on lunch made it disappear" [d097fb6f] is the same cause). `saveDayHold` also drops holds older than a week.

## 2. One design

### 2a. The idea

Today "when" lives in five places: `tasks.scheduled_*`, `task_sessions`, `profiles.scheduler` (essentials and their day holds), `life_wheel.questDrives` (travel), and Today's `queued_for` / `snoozed_until`. Every feature asked for here needs the same two things, so build them once:

- **One way to read:** `listCalendarItems(ownerId, from, to)` returns `CalItem[]`, and every surface (week/day/month views, `WhenPicker`, the auto-scheduler, Today's side calendar, "suggest a slot") uses it, with one `busyWindow(item)` that includes travel.
- **One way to write:** `applyCalendarOps(ownerId, ops[])` is the only code that changes a time. It returns the opposite ops. Undo is then nearly free, Google sync lives in one place, and a rule like "nothing lands on an essential" is written once.

```ts
type CalItem = {
  ref: string;            // "t:<task id>" | "s:<session id>" | "b:<block id>" | "o:<series id>:<YYYY-MM-DD>" | "g:<google id>"
  kind: "quest" | "session" | "essential" | "habit" | "event" | "google";
  title: string; icon?: string | null;
  start: string; end: string;            // ISO moments
  travelBefore: number; travelAfter: number;   // minutes
  onGoogle: boolean; googleEventId?: string | null;
  seriesId?: string | null; occurrenceDay?: string | null;
  state: "placed" | "proposed" | "skipped";    // proposed = a floating essential not yet accepted
  task?: Task;
};

type CalOp =
  | { op: "place"; ref: string; start: string; end: string; counts?: boolean }   // also move and resize
  | { op: "remove"; ref: string }
  | { op: "restore"; row: unknown }                    // the opposite of remove
  | { op: "travel"; ref: string; before: number; after: number }
  | { op: "google"; ref: string; on: boolean }
  | { op: "skip"; ref: string; skipped: boolean }      // one day of an essential, habit or series
  | { op: "series"; id: string; patch: unknown; scope: "one" | "following" | "all"; day?: string }
  | { op: "queue"; ref: string; queued_for: string | null; snoozed_until: string | null };  // Today's snooze, so it travels with the time
```

Rules inside `applyCalendarOps`: change the app's rows first and Google after (a Google failure is reported, never blocks); a batch is one undo step (accepting an auto-schedule preview is one step); each opposite op carries the value it expects to find, and if the item has changed since (another device) that one is skipped with "That one changed since; left as it is."; an undo never counts as a reschedule and puts `reschedule_count` back.

### 2b. Data (migration `0090_calendar_planner.sql`; note there are two files numbered 0088)

- `tasks` and `task_sessions`: add `travel_before_min int default 0`, `travel_after_min int default 0`, `on_google boolean default true`. Copy `life_wheel.questDrives` into the travel columns (both ways the same), then read drives from the columns (`use-quest-places.ts` `useAllQuestDrives`).
- `calendar_blocks`: things on the calendar that aren't a quest's own slot. `id, owner_id, kind ('essential'|'habit'|'event'|'google_extra'), source_key text` (`lunch`, `e:<id>`, `h:<rite id>`, or a Google event id), `title, icon, day date, starts_at, ends_at, state ('placed'|'skipped'), series_id, travel_before_min, travel_after_min, on_google boolean default false, google_event_id, updated_at`. Unique on `(owner_id, kind, source_key, day)`. Copy `scheduler.essentialDays` into it; stop writing `essentialDays`.
- `calendar_series`: `id, owner_id, title, icon, quest_template jsonb null, start_minute int` (wall-clock minutes after midnight), `minutes int, tz text, repeat jsonb, from_day date, until_day date null, travel_before_min, travel_after_min, on_google, google_recurring_event_id`.
- Quests keep `scheduled_start/end` for now (too many screens read them). Moving them into `calendar_blocks` is not needed for any feature here.
- `saveSchedulerSettingsAction` becomes a merge on the server (`scheduler = scheduler || patch`), so a stale copy can no longer wipe keys. This one line is worth shipping early.

### 2c. Undo and redo [3e14a8c0]

- A small store in the browser (`lib/calendar-undo.ts`, `useSyncExternalStore`, kept in `sessionStorage`, 50 steps): `{ label, undo: CalOp[], redo: CalOp[] }`. Every caller of `applyCalendarOps` pushes what it returns. A new change clears redo.
- Keys: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z and Ctrl+Y redo, on the calendar screen (and Today's side calendar), ignored while typing in a field or when a dialog is open.
- Buttons: two 32px flat line arrows in the calendar's toolbar row, faded when there is nothing to undo; the title names the step ("Undo: moved Dentist to 3:00 pm"). After a change, the existing quiet line gets "· Undo".
- Out of scope: completing or failing a quest (that has its own undo), and edits made in Google itself.

### 2d. Essentials that hold their time [3e7e0b78, 68e84514]

Two states, one function.

- **Proposed** (as now: dashed, floating): `essentialsFor(day, settings, items)` in `lib/auto-schedule.ts`, the only place a float is worked out, used by every surface. It never returns nothing and never shrinks: the nearest free gap to the ideal time at full length; else it sits at the ideal time, full length, beside what's there.
- **Accepted** (solid, "like the other things"): a `calendar_blocks` row. It is made when the owner accepts a plan preview that includes it, drags it, resizes it, or picks "Keep it here". From then on it is an ordinary item: draggable, in the item menu, undoable, counted as busy by everything, never moved by the auto-scheduler. It is not sent to Google unless its Google check is on.
- **Never covered:** both states go through the same lane layout as cards (they join `items` in `WeekView`), so an overlap puts them side by side. `DailyBlocks` as a background layer goes away.
- **Dragging** [1ecfbf74, d2caf0ac]: a proposed or accepted essential or timed habit drags like any card; letting go is `{ op: "place" }`, which makes (or moves) its row, so it is an appointment at that time from then on. Today the holds let clicks through to the grid (`WeekView.tsx` about 1808) and can't be dragged.
- **"Add a different quest here"** (right-click): starts the grid's own drag-to-pick on that spot; when the quest is made, one batch places it and moves the essential to its next spot from `essentialsFor` (one undo step).
- **One day into a quest** [f7f0f274]: "Turn into quest card" on one day's block makes a quest at that time and marks that day's row skipped; the daily event itself is unchanged on other days.
- Skipping for a day is `{ op: "skip" }` (a row with `state = 'skipped'`), also undoable.

### 2e. Travel time [13c5ba6a]

Half of this exists: "drives" (`useAllQuestDrives`, the dashed bands in `WeekView`, counted busy for essentials) for quests with a place. Make it general:

- Any item can have travel before and after (columns above; a Google event that isn't ours keeps its travel in a `google_extra` block).
- `busyWindow(item) = [start − before, end + after]` is used by holds, the picker, the auto-scheduler and slot suggestions, so nothing is planned into the drive.
- Where to set it: the item's right-click / ⋯ menu ("Travel time", opening in place as a fold with the app's pills: None, 10, 15, 30, 45, 1 h, Other; a `GoldCheck` "Same on the way back"), and a `.qe-fact` pill in the quest editor and the event editor. A place with a known drive fills it in as now.
- On the grid: the existing dashed band above and below the card, with a flat line car glyph in ink (the 🚗 emoji goes, per the icons rule), draggable at its outer edge to change the minutes.

### 2f. Repeating events, quest or not [13c5ba6a]

- Reuse the habit editor's repeat control and `lib/habit-repeat.ts` (`Repeat = { every, unit, from }`), extended with `weekdays?: number[]` for weekly and an end (`until` or `count`). One control app-wide.
- A series is a rule; its days are worked out when read (`expandSeries(series, from, to)`), from the wall-clock time and the series' time zone, so daylight-saving changes keep "9:00" at 9:00. This must be done with the zone named, never the server's clock (see 1a.1).
- A change to one day is a `calendar_blocks` row with `series_id` and `day` (moved, resized or skipped). Editing asks, in place, "This one · This and later · All" (three pills). "This and later" ends the old series the day before and starts a new one.
- Quest series (answer 2): each day is a fresh quest, created when its day arrives (the daily cron) or when the owner first touches that day's card.
- Google (answer 3): one event with a repeat rule; a changed day becomes a changed instance. Google's own repeating events stay read-only in the app, as now.
- Reached from: the item menu ("Repeat…"), the quest editor and event editor (a `.qe-fact` pill beside Due/Time), and the add popup.

### 2g. "Add to Google Calendar" check [3e7e0b78]

Data is `on_google` per item (quests default on, as today; essentials and plain events default off; the last choice per kind is remembered). `pushMissingGoogleEvents` (`lib/data/calendar-sync.ts`) must skip items with it off; today it sends anything that lacks an event. Turning it off deletes the Google event; on creates it; both are ops, so both undo. The look is the owner's pick from the three UX teams (step 9).

## 3. Build order

Small steps, each its own `review/<topic>` branch and review page unless marked "nothing visible". Suggested model in brackets. Steps 1 and 2 are independent of the rest and fix what the owner sees now.

| # | Step | Model | Notes |
|---|---|---|---|
| 1a | UI check in two time zones (`TZ=UTC` server, New York browser), fail on hydration errors and on calendar layout shift after first paint | Sonnet 5.5 | Nothing visible. Run it first: it should fail on `main`, confirming 1a.1 and 1a.2. |
| 1b | Cards, essentials and now-line drawn only in the browser (`useHydrated`) | Sonnet 5.5 | `WeekView.tsx`, `MonthView.tsx` (check its day placing too). |
| 1c | Only the visible days until measured | Sonnet 5.5 | `WeekView.tsx` lines 392–424, 1212, 1252. |
| 1d | `cal-ui` cookie for span, hour zoom, early/late, layers; page passes starting values | Sonnet 5.5 | `RememberView.tsx`, `calendar/page.tsx`, `CalendarLayers.tsx`. |
| 1e | No full prefetch of `/calendar` from the bottom bar | Haiku 5.5 | `BottomNav.tsx` line 182. |
| 2a | Picker: day chips keep the time of day; label from the pick; no hidden pick | Haiku 5.5 | `WhenPicker.tsx`. Add a UI-check step: pick, switch day, place, read the time. |
| 2b | Move the app's time first, Google after | Haiku 5.5 | `attachCalendarEvent` in `actions.ts`. Nothing visible. |
| 2c | A time outside the shown hours opens early/late and scrolls to it | Sonnet 5.5 | `WeekView.tsx` `outside`, `offset`. |
| 2d | Settings saved as a merge on the server | Haiku 5.5 | `saveSchedulerSettingsAction`. Nothing visible. |
| 3 | Migration 0090 and the copy of drives and day holds | Sonnet 5.5 | Verify with SELECTs; keep old keys readable for one release. Nothing visible. |
| 4 | `CalItem` and `listCalendarItems`; views read it (no change in looks) | Opus 5.5 | The big refactor. Pixel-compare the UI check's calendar shots before and after. |
| 5 | `applyCalendarOps` with opposites; every time-changing action routed through it; snooze asks each time (answer 1) | Opus 5.5 | Tests against the fake database: apply then undo returns every row to its start. |
| 6 | Undo/redo store, keys and buttons | Sonnet 5.5 | New flow in `flows.mjs`. |
| 7a | `essentialsFor` as the one float (never shrinks); essentials and timed habits in the lane layout; accepted rows; dragging them | Opus 5.5 | Marks 68e84514, 1ecfbf74 (drag), d2caf0ac (becomes an appointment) and the data half of 3e7e0b78. |
| 7b | "Add a different quest here"; one day into a quest; one editor for daily events with the polish notes in section 0 | Sonnet 5.5 | Marks the rest of 1ecfbf74, d2caf0ac, f7f0f274, 9599ee19, cdfda496, aafd005c, 93b843eb. |
| 8 | Travel time for every item: menu fold, editor pill, draggable band, `busyWindow` everywhere | Sonnet 5.5 | Replace the 🚗. |
| 9 | Google check: three UX teams, three options each, owner picks, then build | Sonnet 5.5 runs the teams and builds | Fix `pushMissingGoogleEvents` in the same push. |
| 10a | `expandSeries` with tests (daylight saving, month ends, weekdays, until/count) | Opus 5.5 | Pure code, nothing visible. |
| 10b | Repeat control (shared with habits), series in the app, "This one · This and later · All" | Sonnet 5.5 | |
| 10c | Quest series; Google repeat rule | Opus 5.5 | Needs the owner's real Google Calendar to confirm; say so. |

## 4. Overlap with work in flight

- `review/time-ranges-lesson-button` (waiting on review) changes `auto-schedule.ts`, `timed-habits.ts`, `use-quest-cal.ts`, `AutoScheduler.tsx`, `SchedulingList.tsx`, `place-next.ts` and `actions.ts`. Steps 1 and 2 don't touch those except `actions.ts` (different functions). Steps 4, 5 and 7 do: merge that branch first, or rebase onto it. Its habit time ranges become the `from`/`to` that `essentialsFor` already uses for meals, so habits can share the function.
- Pull request 6 (merged) set `prefetch={false}` on same-screen links; step 1e follows the same rule.
- `review/import-calendar` gives imports a calendar time from Due: it should call `applyCalendarOps` once step 5 exists.

## 5. What a cloud session can't confirm

Real iPhone timing of the first paint, the owner's real data sizes, and anything written to his real Google Calendar (repeat rules, deletes). Each step's note to the owner should say what the UI check covered.
