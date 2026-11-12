# In-app feedback, by screen

The owner (Nov 12): "make sure feedback is organized by screen (or universal) so we can look at them when updating screens." And earlier: "we need to find ways of being more proactive about feedback sent via the app so I don't have to give the same feedback multiple times."

**The database is the list.** Every in-app feedback note (`journal_entries`, `kind = 'feedback'`) has `screens text[]` (migration 0086): one or more screen keys, `universal` for app-wide notes. The repo is public, so the notes themselves stay in the database; this file is only the map.

## Before you change a screen

Read that screen's open notes **and** the universal ones, and build or at least respect them in the same push:

```sql
select left(id::text, 8) id, created_at::date, screens, coalesce(edited_body, body) note
from journal_entries
where kind = 'feedback' and auto_shipped_at is null
  and (review_status is null or review_status <> 'skipped')
  and screens && array['import', 'universal']   -- your screen key(s) here
order by created_at;
```

A note you build: `update journal_entries set auto_shipped_at = now() where id::text like 'xxxxxxxx%';` (many older notes were built but never marked; mark them when you notice).

## Keeping the tags right

- New notes are tagged when they arrive (`guessFeedbackScreens` in `src/lib/feedback-screens.ts`, called by `/api/feedback`): the welcome screen if it was open, else the open popup's title, else the page. It's a guess: the page is where the owner *was*, not always what the note is about.
- When you read new notes, fix their tags by hand (a note can name several screens):
  `update journal_entries set screens = array['quest-editor','universal'] where id::text like 'xxxxxxxx%';`
- Untagged open notes: `... and screens is null`. Tag them before you start.
- A new screen gets a new key: add it to `FEEDBACK_SCREENS` in `src/lib/feedback-screens.ts` (and the table below). Don't rename keys; they're stored.

## Screens

Open notes per screen on Nov 12, when every open note (316) was tagged by hand. A note with two screens counts in both.

| Key | Screen | Covers | Open (Nov 12) |
|---|---|---|---|
| `universal` | App-wide | Design language, menus, popups, gears, checkboxes, keyboard, speed | 23 |
| `welcome` | Welcome screen | Greeting, wise line, sleep check-in, journal prompts, habit pills, Morning routine, choose today's quests | 55 |
| `today` | Today | Due soon, Today's Quests, Additional Quests, Victories Today, focusing questions, prioritize | 26 |
| `quest-card` | Quest cards | Bars, due day, steps tray, sequence peek, ⋯ / right-click menu, snooze, move | 35 |
| `quest-editor` | Quest editor | Pills, XP, due, time, sub-quests, sequence window, board chip, Save / Complete | 38 |
| `habits` | Habits | Habit cards, sub-habits, habit editor, mess check-in, laundry | 28 |
| `evening` | Evening routine | Rites, Plan tomorrow's day, Choose tomorrow's quests, Celebrate today's wins | 12 |
| `calendar` | Calendar | Views, auto-scheduler, Plan my day, daily essentials, Google calendars | 52 |
| `boards` | Boards | Boards list, a board, sub-boards, Dreams, All Quests, board picker | 14 |
| `import` | Import | /import cards and sorting | 4 |
| `insights` | Insights | Check-ins and chart, events, tracked events, streaks, Wheel of Time | 20 |
| `settings` | Settings | Settings pages, character card, loading looks | 8 |
| `inventory` | Inventory | Backpack, packing lists, Bring from home | 5 |
| `toucan` | Toucan Spirit | Bubble, notes, chat, perch, cage | 12 |
| `feedback-tool` | Feedback tool | Button, box, screenshots, past notes | 14 |
| `celebration` | Celebration | Quest complete / victory, XP bursts | 11 |
| `portrait` | Portrait painter | Choose a portrait, painting, uploads, library | 11 |
| `party` | Party | Guild Hall, friends, invites, sharing | 7 |
| `rewards` | Treasure Chest | Rewards, coins | 1 |
| `create` | + menu | The + button and create sheet | 2 |
| `language` | Learn a language | Language window, phrases | 6 |
| `journal` | Journal | /journal | 0 |

Many of the 316 "open" notes were already built in later pushes but never marked (Nov 11 note in HANDOFF). Check the code before building one again, and mark it.
