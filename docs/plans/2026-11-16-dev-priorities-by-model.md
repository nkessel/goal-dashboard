# Dev priorities by Claude model (Nov 16)

Sourced from the live backlog: the open in-app feedback in the database (most on calendar 50, welcome 41, quest editor 36, quest cards 29, Today 24, app-wide 21), `docs/BUILD-PLAN.md`, `docs/HIGH-EFFORT.md`, `docs/REPEAT-ASKS.md` and HANDOFF. Shipped items from those lists are left out. Note ids are in [brackets].

Model names: there is no "Fable 5.5"; the top model is **Fable 5.2** (above Opus 5.5). Rough rule: Fable for work that needs judgment across the whole app, Opus for well-defined features that span several files, Sonnet/Haiku for small, clearly described changes.

Items marked **(my suggestion)** are mine, not from your notes.

---

## Fable 5.2: whole-app, ambiguous, or "has failed before"

1. **Make the app light and responsive (your idea, and your note today [6411e1f9]: "have Fable do a usability audit… focusing on the most used UI elements first").** The Nov 12–14 speed work fixed the *opening* (instant open from the kept copy, lazy toucan/feedback/welcome code, no black screen). What's left is *moving around inside the app*:
   - Opening and closing menus redraws a lot of the screen (the "screen refresh" you saw on Boards). Likely state held too high up, so one tap re-renders a whole page.
   - A few very large screen files re-render as one block: quest editor (174 KB of code), welcome screen (119 KB), toucan (108 KB), calendar week view (101 KB), import screen (124 KB). Known example: tapping an XP pill redraws the whole quest editor [ef27a8c4].
   - Today's own code chunk is still about 60 KB compressed; the first server wait on a cold Vercel start was never measured live.
   - How to spend credits wisely: rank screens and controls by real use from the click log (`ui_clicks` table already records every tap), profile the top 10 first, fix, re-measure. Stop when the top 10 feel instant.
2. **Keyboard and feedback box on iPhone, for good** (repeat asks 1 and 16, asked 7+ and 6+ times). Every round has been "built, unconfirmed". Needs careful reasoning about iOS panning that the test tool can't simulate, ideally from a fresh recording of yours.
3. **The social side** ("VERY VERY important" [6d473d8d]): invite friends to a quest/part of a quest/board, split XP with teammates [80ac8b67], choose whether to share each victory. Needs a sharing and permissions data model plus a design talk with you first.
4. **Calendar as a real planner, the core:** undo/redo with Ctrl+Z/Y [3e14a8c0], repeating events and travel time [13c5ba6a], daily essentials as real events that hold their time [3e7e0b78, 68e84514], and the "rescheduled at the wrong time" bug [a5f87cf1]. These change how scheduling works underneath, so they should be designed together.
5. **Brainstorm: merging Daily Habits, Today's Quests (and maybe Due soon)** into one list for the day. Already earmarked for Fable in HANDOFF; ideas reported to you before building.

**(my suggestion)** 6. **Break up the giant files and move settings out of the catch-all.** Splitting the 5 biggest components and moving per-quest extras (places, progress counts, card looks, drive times) from the `life_wheel` catch-all into real columns would make every later session faster, cheaper and less likely to break things. Pairs naturally with item 1.

**(my suggestion)** 7. **A cheaper "start here" for every session.** HANDOFF.md is loaded into every session and is now very long (its own rule says keep Recently shipped to ~10 lines). Fable should restructure it once so sessions read less and still know the rules; this saves credits on every future run.

---

## Opus 5.5: well-defined features across several files

1. **Undo completion problems** [8f515d40, a8cbfbe4, 013f5984]: still shows checked for a few seconds; XP/reward reversal. Touches the offline queue. **Done Nov 23** (the screen part Nov 19; XP/coin reversal and the offline queue Nov 23, see `docs/SHIPPED.md`).
2. **Sequence and sub-quests merged in the quest creator** [dafe3364]: you gave it a 👎 for still not being done.
3. **Screenshot tool** [6134c212 today, 66ed9816, 85ac6c8a]: output doesn't match the screen; let you keep typing while it's taken; drag out an area.
4. **Right-click / long-press menus as small popups at the pointer, app-wide** [841971c2]: one shared component, then every caller (quest cards, habits, rites).
5. **Boards batch** [071a1c62, 9d19bd85, 0425a9bc, aadeefd1, 07d0466e]: drag the scroll's bottom to resize, title opens the board, long-press menu, the scroll resizing after it loads.
6. **Insights batch** [388c0f4e, 10a509a0, f3cca214, a4df137c, bb5ca474, 565812ea, 61806de0]: today's check-in log with a range, sleep/wake on the chart, spin the Wheel of Time by dragging, easier life-wheel logging, past journal entries.
7. **Anti-habits and streaks** [b07ee9eb, 3d5ccb0e, 2388f419, 57384f3c].
8. **Habits in the day's plan, part 2**: place chosen habits on the calendar around non-negotiables, "by when" times, the toucan offering a habit in a gap (with an on/off switch).
9. **Calendar notes, next batch** (50 open): auto-scheduler window movable with one chip [0ba453c0], tentative outline with Confirm/Change [5ec031b1], drag out a time box [f9e1b187], live resize while placing [10532420].
10. **A smaller toucan chat** [22647c99, today].

11. **Brainstorm: character info at the top of Settings and a character screen** [98a2c58f]. Ideas reported back to you before anything is built; needs taste across the profile, stats and avatar pieces but nothing cross-cutting.

**(my suggestion)** 12. **Tests for the XP and coin math** (complete, undo, sub-quest coins, early bonus, offline replay). Several bugs this month were money/XP reversals; a small test file would catch them before you do. **Done Nov 23:** `scripts/test-xp-math.mjs`.

**(my suggestion)** 13. **Widen the UI check** to boards' arrange mode, Treasure Chest editors, the toucan chat and a "Chrome on iPhone" keyboard mode (repeat ask 2, "display bugs I keep finding"). Every screen it covers is one you stop having to QA.

14. **(lowest priority, future idea; yours, Nov 16)** **Right-click any button or element to add a context menu there**, where there isn't one yet. Needs a design pass first (what the new menu can hold: the app's existing actions for that element, links to its settings), then one shared piece that any element can opt into. Builds on item 4 and on the menu arranging in `ui/MenuArrange.tsx`.

---

## Sonnet 5.5 (and Haiku 5.5 where noted): small, clearly specified

1. **"No mist on this board" doesn't save** [508f8eb2]: a persistence bug.
2. **Complete Quest wording** [7b01e745, today]: "Complete Quest" opening "Completed in the past" / "Complete Quest Now" (the choice itself shipped Nov 14; this is labels and Ctrl+Enter).
3. **Walkthrough / XP guide notes from today** [0bd0922b, 789c021f]: backdrop on by default, section title, drop the easy/medium/hard buttons, tie the tips to the walkthrough. (Read both notes; anything unclear goes back to you.)
4. **Language window** (BUILD-PLAN 9) [c084cb95, d6ad55e1, 34a34b07]: native script word by word, a learning view, saved phrases behind a button.
5. **Flat icons, the known leftovers**: the inventory sheet's ✨🖼📷🎨, the item menu's coloured circles, the coloured event faces, Prioritize's 📅.
6. **Boards small ones**: animate switching board views [0c79cf53], show which sort is in use, a past-due filter [b289b823].
7. **Journal**: a priorities prompt/category [91d52f03 rest].
8. **Auto-scheduler counts that disagree** (header 9 vs its sections; Habits "5" vs "All 4"), Folders numbered soonest first.
9. **Calendar clipping**: essentials' names cut without "…", "7:00 AM" clipped in the Gym block.
10. **Consistent capitalization** across the app (UX synthesis leftover). Haiku 5.5 is enough.

11. **Email to Daniel about his Champion title** [13b4b2d4]. **Only after the app has a domain email address** (choose the domain, set up the sender, then send with your wording and OK).

**(my suggestion)** 12. **Mark feedback that's already built.** HANDOFF says many open notes were built but never marked, which inflates the backlog every session reads. Sonnet checks each against the code and marks it; Haiku can tag any untagged notes by screen.

**(my suggestion)** 13. **Haiku for upkeep**: trimming "Recently shipped" in HANDOFF, updating counts in REPEAT-ASKS and FEEDBACK-BY-SCREEN after each push.

**(follow-up, Nov 16)** **The arrange gear inside every other context menu.** The habit menu has it (drag to reorder, tap a name to rename, eye to hide; on `review/time-ranges-lesson-button` until approved). The rite, board, calendar item, inventory, notification, folder, streak and matrix menus can be reordered and renamed from Settings › Layout; each still needs the gear in the menu itself (`MenuGear` + `MenuArrange`). Sonnet.

---

## Waiting on you (no model should build these yet)

- Import card screen: pick mockup A, B or C (thread "Clarify the import card screen", since Nov 12).
- `review/prioritize-bars` (taller Prioritize bars): built Nov 14, not UI-checked or reviewed.
- Walkthrough redesign: on hold until you say go (wording chosen Nov 15).
- Daily coursework as a habit: options A–D sent Nov 11.
- A domain for the app (needed before the email to Daniel and any app emails).
