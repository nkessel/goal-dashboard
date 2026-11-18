# One list for the day: brainstorm

Written Nov 16, 2026. **Ideas only, nothing built.** For the owner's pick before any building ("brainstorm" rule). Covers his Nov 15 ask (merge Daily Habits, Today's Quests and maybe Due soon on Today) and notes [9bc0034b] ("integrate habits into the daily agenda") and [29018ed3] (section headers that are easier to digest).

**Mockups (Nov 17):** phone mockups of Today now, A, B and C side by side: https://claude.ai/artifact/1f1KvCyDFQWtUzZoZvPGet

## Choices for the owner

1. **Which shape?** A (three shelves in one panel), B (one list in the order you'll do things), or C (the day's calendar as the list). **I recommend B**, built so that C can grow out of it later.
2. **Is the one list a switch or the only way?** Two pills at the head of the list, **By kind | In order**, remembered per account (recommended, and it is what you described on Nov 15: "an option to turn the three lists into one"). Or replace the sections outright.
3. **Where does Due soon go?** Stay its own slim bar above the list, as the place you pull quests *from* (recommended). Or fold its cards into the list.
4. **What happens to a card when it's done?** It leaves the list and joins a slim "Done today · 4" fold at the foot (recommended, so the top of the list is always what's next). Or it stays where it was, turned green.
5. **Habits you didn't choose for today:** keep them in the Daily Habits drawer under the list, as now (recommended). Or show every habit of the day in the list.

## What Today has now

Four parts sit in one board: **Due soon** (a drawer of quests due within your reach; ○ pulls one into today, × takes it out), **Daily Habits** (a drawer of habit cards), **Today's Quests** (your pinned quests, with the habits you chose or made core shown as a block *under* the quests since Nov 14), and **Additional Quests** (a drawer of the rest). Quest cards drag between Today's Quests and Additional Quests and onto the day calendar. Habit cards drag only among themselves and can't go onto the calendar.

So the pieces are side by side, but three things are still missing: one order across quests and habits, habits on the calendar by dragging, and a clear "what's next".

## Option A: three shelves in one panel

Your idea 1. One parchment panel titled Today with three folding sub-headers inside it, each the drawer you already have, each remembering open or closed. Every card, habits and Due soon cards included, drags onto the calendar.

```
Today                          ⌄
 Due soon · 3                  ›
 Habits · 4                    ⌄
   ○ Morning stretch
   ○ Learn a language   Listen
 Quests · 3                    ⌄
   ○ Call the bank    2 – 2:30pm
   ○ Draft the invite
 Additional Quests · 12        ›
```

- **Gains:** smallest change, nothing to relearn, the kinds stay easy to find. Habits finally drag onto the calendar. Fits your Nov 12 note about collapsible headers.
- **Costs:** it is still three lists. It doesn't answer "what do I do next", and the habits are still easy to skip past, which is the thing you said overwhelms you ("when I look at Today's Quests to plan my day, I forget about the habits").
- **Size:** small.

## Option B: one list, in the order you'll do things (recommended)

Your idea 2. Quests and the habits chosen for today become one list. You drag any card anywhere, a habit between two quests included. Anything with a time (a quest on the calendar, a habit set to At or Between) shows its time on the card's existing time line and sits in time order by itself. The first card not yet done is "next" and gets the gold edge that core habits use today. Cards keep the looks they have: quest cards as now, habit cards with their round check and ★.

```
[ By kind | In order ]      + ⚲
 Due soon · 3                  ›
 ○ Morning stretch   ★  7:30am      ← next (gold edge)
 ○ Call the bank        2 – 2:30pm
 ○ Learn a language     Listen
 ○ Draft the invite
 ○ Evening walk         before 8pm
 + Add a quest to today
 Done today · 2                ›
 Daily Habits · 3 more         ›
 Additional Quests · 12        ›
```

- **Gains:** one place to look, and the top of it is always the next thing. Habits can't be forgotten because they sit among the quests. Planning the day is dragging one list into order, then (if you like) dragging cards onto the calendar. Auto-schedule's result can simply become this order.
- **Costs:** the list can get long (3 quests plus 5 habits). The guard is what you already have: only core and chosen habits come in, and done cards leave for the "Done today" fold. It needs one saved order for the day across quests and habits, which doesn't exist yet. With the switch, Today has two looks to keep working.
- **How it stays calm:** no new controls. The switch is the same pair of pills as Prioritize's Quests | Habits. Folds are the app's drawer. Time and "before 8pm" use the habit time words from the time-ranges review.
- **Size:** medium. The first half is the same work as option A.

## Option C: the day's calendar as the list

The list *is* today's calendar, read as an agenda. Timed things run down the page in time order with lunch and the other daily essentials shown as thin lines between them. Under it, a "Sometime today" tray holds everything without a time; dragging a card up between two timed ones gives it that time.

```
 7:30  ○ Morning stretch  ★
 9:00  ○ Draft the invite
 ─ 12:30 Lunch ─
 2:00  ○ Call the bank
 Sometime today · 3            ⌄
   ○ Learn a language
   ○ Evening walk
```

- **Gains:** one truth. The list and the calendar can never disagree, and auto-schedule fills it in one press.
- **Costs:** it pushes you to give everything a time, which is heavy on days you just want a short list. It leans on the calendar planner work that isn't built yet (one way to read and write times, habits and essentials as real calendar items), so it can't start soon. On the tablet it repeats the calendar that already sits beside Today.
- **Size:** large, and blocked until the calendar planner's steps 3 to 7 are in.

## My recommendation

**B, with the By kind | In order switch, built in two stages.** Stage 1 is A's plumbing (every card draggable everywhere and onto the calendar), which is worth having whichever way you choose. Stage 2 adds the ordered list. C's best idea, timed cards finding their own place, is already inside B, and once the calendar planner is built B can grow C's essentials lines for free. Due soon stays a bar above the list, because it is a list of things you *might* do, and mixing it in would make the day look fuller than it is.

## Build outline (for later sessions; each visible step goes through design review)

Nothing here should start before `review/time-ranges-lesson-button` is merged: it changes habit times and the habit menu in `DailyHabits.tsx`.

**Shared first steps (needed for A and B)**

| Step | What | Model |
|---|---|---|
| 1 | Lift the habit card out of `habits/DailyHabits.tsx` (the inline row at about lines 523 to 858, 67 KB file) into `habits/HabitCard.tsx`, with no change on screen. Its menu, rest, snooze, done time and sub-habits move with it. Check flows `today` and `habiteditor` with `--compare`. | Opus 5.5 |
| 2 | One drag context: `TodayTaskBoard`'s `DndContext` owns the habit cards too (drop the two nested `dnd-DailyHabits*` contexts). Habits still reorder among themselves (`reorderRitesAction`). | Opus 5.5 |
| 3 | Habit and Due soon cards drag onto the day calendar through the same `hoverCalendarAt` / `dropOnCalendarAt` registry (`lib/schedule-carry.ts`). A habit dropped on a time gets a day hold `h:<id>` at that time (today's scheduler holds; later the calendar design's `{ op: "place" }`). A Due soon card dropped there is added to today and scheduled. | Sonnet 5.5 |

**Option A only**

| Step | What | Model |
|---|---|---|
| A1 | Wrap the board's parts in one panel with the existing `drawer-header` bars as sub-headers; open and closed kept per part in the Today layout store. Add to `flows.mjs`. | Sonnet 5.5 |

**Option B (after steps 1 to 3)**

| Step | What | Model |
|---|---|---|
| B1 | The day's order. `src/lib/day-order.ts` (pure, with tests): `mergeDay(quests, habits, saved, times)` returns one list of `q:<id>` / `h:<id>`; timed items are placed by time, the rest keep the saved order, new ones go after the last untimed card. Saved in `life_wheel.dayOrder = { [dayKey]: string[] }` (merge, keep 3 days), with `saveDayOrderAction`. | Sonnet 5.5 |
| B2 | The list. In `TodayTaskBoard`, when the view is "In order", one `SortableContext` over `mergeDay`'s list drawing `SortableQuest` or `HabitCard` by kind; drag end saves the order (and still pins or unpins when a card crosses to Additional Quests). The gold edge on the first open card. Done cards leave with the app's fade into a "Done today" drawer at the foot. | Opus 5.5 |
| B3 | The switch: two `qe-fact` pills in the list's head (as in `PrioritizeTool`), saved in the Today layout (synced to the account); also listed in Settings › Layout and in Arrange Today. "By kind" is today's screen untouched. | Sonnet 5.5 |
| B4 | Auto-schedule and Prioritize write the same order when they finish, so the list matches the plan. UI check: a `todayorder` flow (switch, drag a habit between quests, complete one, drag one to the calendar) on phone, phone with keyboard and tablet. | Sonnet 5.5 |

**Option C (later, only after the calendar planner's steps 3 to 7)**

| Step | What | Model |
|---|---|---|
| C1 | The list reads `listCalendarItems` for today; essentials show as thin lines; a "Sometime today" drawer holds the rest. | Opus 5.5 |
| C2 | Dragging a card between two timed ones asks `essentialsFor`-style gap finding for a time and places it with `applyCalendarOps` (so it undoes). | Opus 5.5 |

## How this fits the other open work

- **Time ranges branch:** B shows a habit's When (At, Before, Between) on its card and uses it for its place in the list. "Count every time" habits stay in the list after a tick, since they can be done again.
- **Calendar planner design:** its `CalItem` already has kinds `quest` and `habit`, and Today's snooze becomes an op there. B's day order is only for cards *without* a time, so the two don't fight; when `calendar_blocks` exists, step 3's habit holds move to it.
- **Split plan:** it doesn't cover `DailyHabits.tsx` or `TodayTaskBoard.tsx`. Step 1 above is the same kind of move and should follow its rules (no change on screen, compare shots before and after).
- **Habits in the daily plan, part 1 (shipped Nov 14):** stays as is. Choosing habits in Prioritize and core habits decide which habits come into the list.

## What a cloud session can't check

Hold-and-drag on a real iPhone across a long list with the calendar tab at the edge. Worth a look on your phone at B2's review.
