# One "when" for quests: due dates and scheduling, simplified

Plan only (owner, Nov 16: "the scheduling / due date situation is too complex and messy… brainstorm a plan, for other models to execute tomorrow… the inline scheduling interface is not as pretty as the main one. It should be an integrated interface, not two separate interfaces. You can make a smaller version of it, but it shouldn't look completely different").

**Approved so far (Nov 18):** one date question with Flexible / Fixed (layout 5c), "Auto-schedule" as the button word. **Not yet approved:** the rest; build only what he has said yes to. The owner's review page: https://claude.ai/artifact/SvhFLihQR11PukuSJXPdQT. Build only the steps he has said yes to. Everything visible goes through the design review (CLAUDE.md): `review/<topic>` branch, UI check, review page, his OK, then `main`.

Builds on:
- `/mnt/project-files/planning/2026-11-16-calendar-planner-design.md` (one read `listCalendarItems`, one write `applyCalendarOps`, undo). That doc is the data side; this one is the screen side. They can be built in either order; step 7 below joins them.
- The three Due panel redesigns on https://claude.ai/artifact/7FZhJ8gbCTCMczh9LVQeWE (branch `review/time-ranges-lesson-button`). All three UX teams split the panel into two questions. This plan takes that split app-wide.
- `review/import-calendar` (commit e06d5c3): keeps its data wiring, loses its own Calendar row and `WhenPicker` (step 4).

## 1. What is wrong today

Seven different controls answer "when", each drawn its own way:

| Place | What it shows today |
|---|---|
| Quest editor › Due pill | quick dates, date, time, early bonus, a Calendar row that opens `WhenPicker`, "Schedule within", (on the review branch) Time of day. About 19 controls. |
| Import card | a "Schedule within" row on the card, a Due pill, and (review branch) a Calendar row with `WhenPicker` |
| Quest ⋯ › Schedule… | `ScheduleWindow` (a floating window) with `WhenPicker` via `TaskScheduleControl` |
| Editor (older path) | `SlotPickerDialog` with `WhenPicker` |
| Prioritize | a calendar button holding Due and `ScheduleWithin` |
| Auto-scheduler window | rows you drag onto the real calendar; its own next-slot button |
| Calendar screen, Today's side calendar | the real calendar (`WeekView`, and `WeekView embedded`) |

And two calendars that look nothing alike: `WeekView` (parchment cards, creatures, essentials, calendar colours) and `WhenPicker` (a plain hour list with grey blocks and day chips).

## 2. The model (owner's picks, Nov 18)

**One date question, not two.** The owner (Nov 18): having both "complete by" and "schedule" is confusing, "since usually scheduling is used to make sure an item is completed by a certain date". So there is one "complete by" answer, and each date is either **Flexible** or **Fixed** (his words, locked in Nov 18).

- **Flexible**: a goal. It reads the way it was entered ("Within a week", "This month", or "Around Fri" when picked from the calendar), on the pill and on cards (dashed pill). The auto-scheduler aims for it. If it passes, it quietly moves forward and never shows as overdue.
- **Fixed**: it has to be done by then. It reads as its date ("By Fri"), on a solid gold pill. The auto-scheduler places it ahead of flexible ones, it shows overdue (red) once due today or past, and finishing early earns the early bonus (the early bonus row shows only for fixed dates).
- Turning "Within a week" to Fixed sets the date to the last day of that range ("By Tue, Nov 25"), which can then be changed. (Default; owner hasn't objected.)
- **Pick a time** stays optional, under the date: it opens the small calendar (section 4) and puts the quest on the calendar at that time. With a time but no date, that day becomes the date (Flexible). The date and the picked time can differ ("By Fri", on the calendar Thu 3pm).
- **Auto-schedule** is the word for the calendar-picks button everywhere (owner, Nov 18 comment: not "Let the calendar pick").
- The time-of-day range (After / Before / Between, from `review/time-ranges-lesson-button`) folds under the date as one quiet line ("Before 12 pm ✎"), shown once set.

Not "when" controls, unchanged: **Priority** (on Today or not), **Snooze** (hide it until; snoozing a placed quest moves its block), **travel**, **card colour**.

**Data, no new columns needed:** Flexible = `plan_by` + `plan_within_days` (what "Schedule within" already writes; `plan_within_days` null when a calendar day was picked). Fixed = `due_at` (+ early bonus fields); setting Fixed clears `plan_by`, setting Flexible clears `due_at`. Picked time = `scheduled_start/end` + `task_sessions`. Existing quests: a quest with `due_at` reads as Fixed, one with only `plan_by` as Flexible; a quest with both shows Fixed (its `due_at`) and keeps `plan_by` only as the scheduler's aim. No data migration.

**Decided Nov 18 (owner: "yes to your recommendation, but make sure that the user knows what's happening to it when they accept the import"):** a date alone puts the quest on the auto-scheduler's list; it gets a calendar time only when you press Auto-schedule, plan your day, drag it, or pick a time. Nothing is placed on the calendar automatically.

**Saying what happens, on every import (and in the quest editor's footer when creating):** the line just above Import (`landsWords`) always says it, and the toast after Import repeats it with a link. Words, by case:

| Card has | Line above Import | Toast after Import |
|---|---|---|
| no date, no time | "Goes on the Errands board and in Additional Quests. Not on your calendar." | "Imported to Errands · Additional Quests" |
| Flexible date | "Goes on the Errands board and in Additional Quests, and onto the auto-scheduler's list to get a time within a week. It won't be on your calendar until you Auto-schedule it." | "Imported · on the auto-scheduler's list (within a week) · Auto-schedule now ›" |
| Fixed date | "…and onto the auto-scheduler's list, to be placed before Fri (fixed). It won't be on your calendar until you Auto-schedule it." | "Imported · on the list, fixed by Fri · Auto-schedule now ›" |
| Picked time | "…and on your calendar Thu 3:00–3:30 pm." | "Imported · on your calendar Thu 3pm · See it ›" (opens the calendar on that day) |

- "Auto-schedule now ›" in the toast places that one quest at once (the same `findSlot` rule) with Undo; it never places anything without that tap.
- Board name and place (Today's Quests / Additional Quests / board only) come from the card's own choices; habits, rewards, projects and done keep their current lines from `importWhere`.
- The line updates live as the card's When pill changes, and slides (no jump) when it grows a line.
- ui-check `import`: one screenshot per row of the table, the toast included.

## 3. One panel: `WhenPanel` (layout 5c, owner's pick Nov 18)

One component, used everywhere a quest's "when" can be set. Same rows, same words, same order. The drawings: https://claude.ai/artifact/SvhFLihQR11PukuSJXPdQT#firm-flexible (5c) and #soft-hard.

- **Nothing set:** one row: `Complete by` + quick picks `Today · Tomorrow · Within a week · Within 2 weeks · This month · Other…` (Other opens `DateField`). Below it, a quiet `Pick a time` link.
- **While picking a date** (just picked, or the pill tapped again): one line under the quick picks: `This date is [Flexible · Fixed]` (a two-part switch, Flexible lit by default). Quick picks that are ranges ("Within a week") default to Flexible; a specific day from Other… defaults to Flexible too.
- **Set:** the quick picks fold into one pill: dashed `Within a week` (Flexible) or solid gold `By Fri, Nov 20` (Fixed), and a ×. Tapping the pill re-opens the quick picks and the switch. Under it, only what applies: `Early bonus: Automatic ✎` (Fixed only), `Before 12 pm ✎` (if a range is set), then `On your calendar Thu 3:00 – 3:30 pm · Change · ×` or the `Pick a time` link, and `+ Another session` once placed.
- Parts: `.qe-fact` pills, `Fold`, `DateField`, `TimeToken`, `EarlyBonusFields`, the existing two-part switch style, the `/design` glyphs. No new control styles, no colour emoji. Every fold slides.
- **States for the review page** (screenshot each, phone first): nothing set; picking (switch showing); Flexible within a week; Fixed by Fri; Fixed + early bonus open; Fixed + picked time; picked time + another session; Flexible + time-of-day range; Pick a time open (small calendar); a Fixed date due today (red on the card).
- **Pill face** (`whenWords`, every screen and card): `Within a week`, `Around Fri`, `By Fri`, `By Fri · Thu 3pm`, `Thu 3pm`, or `When` when empty. Fixed and due today/past: `Due today` / `Overdue` in red.
- Works on things not saved yet (a new quest, an import card): the panel edits a `WhenValue` and calls `onChange`; the host decides when to write.

```ts
// src/lib/when.ts (pure, no React, no server)
export type WhenValue = {
  by:
    | null
    | { firm: false; withinDays: number; from: string }        // "Within a week": counted from `from` (local YYYY-MM-DD)
    | { firm: false; date: string }                            // "Around Fri"
    | { firm: true; date: string; time?: string; early?: EarlyBonus }; // "By Fri"
  range?: TimeRange;                                            // After / Before / Between
  sessions: { start: string; end: string }[];                   // picked times (ISO); [] = none
};
export function whenFromTask(t: Task, sessions: TaskSession[]): WhenValue
export function whenFromImportCard(c: ImportCard, attrs: Attrs): WhenValue
export function makeFixed(v: WhenValue, now: Date): WhenValue        // range -> its last day
export function whenWords(v: WhenValue, now: Date): string           // pill face
export function landsWords(v: WhenValue, board: string | null, place: "today" | "additional" | "board"): string
export function whenChanges(before: WhenValue, after: WhenValue): WhenOp[]   // what to write
```

## 4. One calendar in two sizes: `MiniCalendar`

`WhenPicker` goes. "Pick a time" opens a small version of the real calendar, in place (a `Fold` under the row).

- It is `WeekView` itself, with a new `pick` prop, inside a wrapper that fetches its data and sizes it. Not a second drawing of a calendar. Same quest cards (`CalendarTaskChip`), Google event cards, essentials and holds, tentative dashed look, calendar colours and hidden calendars (`useCalendarLayers`), 7 AM–10:30 PM with the Earlier / Later buttons, the now line, day heading with weather.
- Smaller, not different: one day wide on a phone (swipe sideways for other days, as on the calendar screen; up to 3 days when the panel is 560px or wider), about 300px tall in its own scroll box (`embedded` already does this for Today's side calendar), a smaller hour height, opens at the picked time, else an hour before now.
- The quest being placed is a real quest card with the dashed gold "tentative" edge, labelled with its name and time. Tap an empty spot to put it there; drag it to move; drag its foot to change its length. Nothing else on the mini calendar moves or opens (others are shown at 85% so the new card stands out); a small "Open the calendar ›" link goes to the full screen for rearranging.
- One button under it, the same `MagicCalendarIcon` "Auto-schedule" button the calendar uses: puts the card in the first free spot (`findSlot` in `calendar/place-next.ts`, the one rule set). The "Free" chips and the day chips of `WhenPicker` are not carried over (the planner doc lists their bugs).
- Pick mode writes nothing. It hands back `{ start, end }`; the panel shows "Thu 3:00 – 3:30 pm" and the host saves.

```ts
// WeekView.tsx: one new optional prop
pick?: { title: string; minutes: number; portrait?: string | null; value: { start: string; end: string } | null; onChange: (s: { start: string; end: string } | null) => void };
// when set: grid taps place the pick (no new-quest popup), other cards are inert (no drag, no menu, no popup),
// the pick renders as a QuestCard with .cal-tentative, registered as the only draggable.

// src/components/calendar/MiniCalendar.tsx
export function MiniCalendar(props: { title: string; minutes: number; portrait?: string | null; value: Slot | null; onChange: (s: Slot | null) => void; days?: 1 | 3 })
// fetches the window (today … +14 days, more on swipe) with the same loader Today's side calendar uses
// (`today/TodayCalendarData.tsx` → a `calendarWindowAction(from, to)`; swap to `listCalendarItems` when the planner's step 1 lands).
```

Why a prop on `WeekView` and not a split of the file: `WeekView.tsx` is 2,086 lines; a refactor first would cost more than the feature and risk the calendar screen. The planner doc already has the calendar's fixes queued; keep this change additive (everything behind `if (pick)`).

## 5. What each screen becomes

| Place | After |
|---|---|
| Quest editor | the Due pill becomes a **When** pill (calendar glyph, face from `whenWords`) opening `WhenPanel`. |
| Import card | the on-card "Schedule within" row, the Due pill and the Calendar row become the same one **When** pill. The landing line uses `landsWords`. The "plan" question in the import steps goes (the panel covers it). |
| Quest ⋯ menu | "Schedule…" opens `WhenPanel` for that quest under the card (a `Fold`, as Snooze does); `ScheduleWindow` goes. |
| Prioritize | its calendar button opens `WhenPanel`. |
| Auto-scheduler window | rows keep dragging onto the real calendar; a row's tap opens `WhenPanel`. |
| Deleted | `WhenPicker.tsx`, `SlotPickerDialog.tsx`, the stand-alone `ScheduleWithin.tsx`, `ScheduleWindow` and `CalendarRow`, `TaskScheduleControl`'s own picker UI. |

## 6. Build order (one branch and one review page per step unless noted)

Each step: read the screen's feedback notes first (`docs/FEEDBACK-BY-SCREEN.md`: `quest editor`, `calendar`, `quest cards`, `universal`), `npx tsc --noEmit -p .`, eslint on touched files, `npm run ui-check -- --only <flows>`, update `docs/REPEAT-ASKS.md` row 10 (visual scheduling) in the same push.

| # | Step | Model | Depends on | Notes |
|---|---|---|---|---|
| 1 | `src/lib/when.ts` with the types and helpers above, plus `scripts/` or vitest-style checks for `whenWords` and `whenChanges` (table of cases: nothing, within a week, around Fri, by Fri, by Fri 5pm, makeFixed of a range, picked, two sessions, range, fixed overdue, flexible past its day) | Sonnet | none | Nothing visible: ships straight to `main`. |
| 2 | `WhenPanel` (layout 5c, section 3) in the quest editor, replacing the Due panel's contents. "Pick a time" still opens the old `WhenPicker` for now. Rebase `review/time-ranges-lesson-button` first or build on top of it (it holds the Time of day range and is waiting on the owner: ask which before starting). | Opus | 1, owner's layout pick | UI check `today` + `create` flows; add each panel state to `flows.mjs`. |
| 3 | `WeekView` `pick` prop + `MiniCalendar`; swap it into `WhenPanel`. | Opus, high effort (the risky step) | 2 | New ui-check flow `minical`: open, tap a spot, drag the card, Auto-schedule, swipe a day, on phone / keyboard / tablet. The calendar and todaycal flows must stay as clean as `main`. Before/after screenshots beside the real calendar on the review page so the owner can see they match. Needs his iPhone look (drag in a small scroll box). |
| 4 | Import card: one When pill, the landing line and toast from section 2's table; rebase `review/import-calendar` onto step 3 and drop its `CalendarRow`. Keep from that branch: "To schedule" gone as a type, `LandsLine` (now `landsWords`), slot → `scheduleTaskAction` after import. On his OK also run `update import_cards set kind='quest' where kind='schedule'` and verify with a SELECT. | Sonnet | 3 | UI check `import`. |
| 5 | Quest menu, Prioritize, auto-scheduler rows use `WhenPanel`; delete the old pickers (list in section 5). `grep -rn "WhenPicker\|SlotPickerDialog\|ScheduleWindow\|ScheduleWithin"` must come back empty. | Sonnet | 3 | UI check `today`, `calendar`, `sequence`. |
| 6 | Words sweep: the same words everywhere ("Due", "Do it", "Pick a time", "Let the calendar pick", "Within"); quest and calendar cards' when-line from `whenWords`; docs (`SHIPPED.md`, `WAITING.md`, `REPEAT-ASKS.md`). | Haiku | 5 | |
| 7 | Writes go through the planner's `applyCalendarOps` (its step 5), so every "when" change has Undo, and Snooze moves a placed block. `whenChanges` already returns ops in that shape. | Sonnet | planner steps 1–5 | No visible change beyond Undo. |

Steps 1 and 2 can start tomorrow. 3 is the one the owner asked for by name; if he wants to see it first, do 1 → 3 (mini calendar swapped into today's Due panel in place of `WhenPicker`) → 2.

## 7. Open questions for the owner (defaults in brackets)

1. ~~Panel layout~~ Decided Nov 18: one "Complete by" question, layout 5c, Flexible / Fixed.
2. ~~The words~~ Decided: Flexible / Fixed; "Auto-schedule"; flexible dates read as entered.
3. ~~Flexible date placed automatically?~~ Decided: the list; the import card says so (section 2).
4. On the import card, one When pill replaces the "Schedule within" row on the card's face. [Yes]
5. In the mini calendar, only the quest you're placing moves; other things are moved on the full calendar. [Yes]
6. Mini calendar width on a phone. [One day, swipe for more]

## 8. Rules for whoever builds

- Reuse parts; no new control styles. Flat single-colour icons. Open in place, with a slide; no popups.
- Never press "Place on the calendar" / "Put these on my calendar" against the owner's real Google Calendar. The UI check's fake data is the only place to place things.
- No new UI or design change reaches `main` without the owner's OK on a review page (bug fixes ship straight; CLAUDE.md, Nov 19).
