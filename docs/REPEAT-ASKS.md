# Repeat asks: run these at higher effort

The owner's rule (Nov 2): anything asked for **3 or more times** gets built at a higher effort, checked comprehensively, and confirmed with the owner. These are the asks that keep coming back. Before you tell the owner one of them is done, do all of the following:

- Read every note about it (in-app feedback, `/journal` › App feedback, the recordings).
- Find every screen it applies to. "App-wide" means the whole app.
- Run `npm run ui-check` and look at the screenshots of each screen.
- Say which screens you checked and what still needs a real iPhone.

Status words:
- **open**: not built yet.
- **built, unconfirmed**: shipped, but the owner hasn't said it's right yet.
- **confirmed**: the owner said it's right.

Only the owner moves an item to *confirmed*. When they bring it up again, add one to its count and reopen it.

| # | Ask (owner's words, shortened) | Times | Status | Where it applies / how to check |
|---|---|---|---|---|
| 1 | **No resizing or jumping when the keyboard opens or closes** ("the page must not resize", black band behind the keyboard, page jumps on close) | 6+ | built, unconfirmed (many rounds) | Every text field: welcome screen (respond, top priority, other priorities, events), + sheet, feedback box, quest editor, toucan chat, wise-line feedback field. The ui-check simulates the keyboard but can't show iOS panning, so ask the owner for a recording. |
| 2 | **Display bugs the owner keeps finding ("basic QA")**: "how did this get approval to ship", "display issues – lots of them" | 5+ | ongoing | `npm run ui-check` before every push; add every new screen to `flows.mjs`. Next to cover: boards arrange, Treasure Chest editors, quest editor folds, toucan chat, feedback box, calendar day/3-day views. |
| 3 | **Toucan's ‹ › as one gilded, symmetrical coin under him** | 4 | built, unconfirmed (Nov 2, afternoon; an old CSS rule had kept it in the card) | Welcome screen, phone and computer. |
| 4 | **× closes only what the toucan says, never the toucan; ✎/rating only on long-press or right-click** | 4 | built, unconfirmed: welcome (Nov 2); perched-toucan notes on Today (Nov 2, evening) | Welcome bubble, the note he flies in with on Today (`NudgeNote`), the perched owl's bubble. |
| 5 | **Fractions like "0/5" or "0 of 3 quests done" are demoralizing**: say how many there are, celebrate what's done | 4 | built, unconfirmed (Nov 2, evening: `lib/progress-words.ts`) | Boards list, a board's header, sub-habits, steps tray, quest editor steps, Evening Rites header, quest cards' steps (Nov 2, night). Grep for `}/{` in `src/components` before saying done. |
| 6 | **Popups → small inline menus or context menus** (snooze menu "much simpler, nimbler", delete-portrait "much smaller context menu", no unnecessary popups) | 4 | partly built | Snooze from a quest's ⋯ (Tomorrow / 2 days / Other…), portrait delete, the sequence editor (resize/move/minimize), Settings pages. |
| 7 | **Reorder by dragging, never ↑/↓ arrows** (and right-click/long-press menus everywhere) | 3 | partly built (sub-habits done Nov 3) | The sequence dialog's ↑ ↓, the quest ⋯ menu editor, calendars list, any list editor. |
| 8 | **Cards don't grow for extras**: time estimate by the XP, due date under the level bars, "postponed" without a new line | 3 | built, unconfirmed (Nov 2, night: quest cards put the due day ("Today", "Thu", "Nov 10", "Overdue"; full date on hover) under the bars and drop the line it had; tiny quests use the same clock; habit cards show their time above the XP instead of on a line under the name) | Quest cards on Today, boards and Due soon; tiny-quest cards use the same time icon. |
| 9 | **The steps tray looks right** (overlaps the card, completed steps in order, no "Next" button, clear icon) | 3 | built, unconfirmed (Nov 2, night: its own rounded panel 6px under the card instead of tucked under its edge; no "✦ Next" tag or highlight; "Steps" without the ❦; steps keep their own order, done or not; "3 to go" instead of 1/4) | `StepsTray.tsx` on Today and boards; the quest editor's steps. |
| 10 | **Scheduling is visual and in context** ("the schedule button still doesn't show the calendar options in a visual in-context way, pls fix app-wide"; plan my day from Today) | 3 | built, unconfirmed (Nov 2, night: `calendar/WhenPicker.tsx`: day chips, the day drawn with your calendars, quests and timed habits, a gold block you tap to place and nudge by 15 min, the first free spots as chips; used by a quest's "Schedule on calendar" and the quest editor's Add to calendar; Plan my day shipped earlier) | The schedule control on a quest card, in the quest editor, from Due soon; the calendar's Plan my day; To schedule. |
| 11 | **"To schedule" movable and minimizable** | 2 | built, unconfirmed (Nov 2, evening: a floating window on wide screens, – to a chip) | The calendar on a computer; on a phone it stays a slide-in drawer. |
| 12 | **The calendar scrolls seamlessly** (drag to reveal days partway, no whole-day steps) | 2 | open | `/calendar` days view, computer and phone. |
| 13 | **Sleep check-in is clear**: one line for times, a "saved" confirmation, a preview when folded, "yesterday" for the factors, editing behind a gear | 3 | built, unconfirmed (Nov 2) | Welcome › Sleep check-in. Still open: a one-tap yesterday/today switch for the factors. |
| 14 | **The feedback tool never lags**: type straight after adding a screenshot, screenshots taken without stopping you, a list of your recent notes to edit | 2 | built, unconfirmed (Nov 3) | `FeedbackDock.tsx`. |
| 15 | **The habit editor as easy as the quest editor** (sub-habits visible, draggable, XP and coins, in-place order, themed dropdowns, Close turns into Save) | 2 | built, unconfirmed (Nov 3: `SubHabitList.tsx`; parts not yet pills) | `RiteEditorDialog`, Daily Habits. |

When an item is confirmed, keep its row for a week, then delete it.
