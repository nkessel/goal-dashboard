<!-- Copied from the Claude project files (ui-audit/high-effort-list.md) on 2026-11-12 so any account can read it. This repo copy is the one to keep current. -->
# Work to run at high or extra effort (Opus 5.5)

These are better done in a session set to high or extra effort. Each one either needs design choices from you first, touches many screens, changes data, or has failed in earlier attempts. Normal-effort sessions should leave them alone and pick from the quick list instead.

Ids are the in-app feedback notes (first 8 characters). "Brainstorm first" means you asked to see ideas before anything is built.

## 1. Asks you've made 3 or more times (`docs/REPEAT-ASKS.md`)
- **The keyboard never resizes or jumps the page.** Asked 6+ times. It needs a check on a real iPhone, which a cloud session can't do. Best done with you recording each field.
- **Display bugs you keep finding.** Asked 5+ times. Widen the UI check to boards, Treasure Chest editors, the toucan chat and Chrome-on-iPhone's keyboard.
- **Popups become small inline menus, and every popup can be dragged and resized.** Notes: e3379723 "drag and resize basically any popup", fd583428 "popups are harsh" (run 3 UX reviewers first). This touches every dialog in the app.
- **Reorder by dragging everywhere, never ↑/↓.** This includes the scheduling list (013bd426) and sub-quests (d3f5c104).

## 2. The social side ("VERY VERY important", 6d473d8d)
- Invite a friend to a quest, part of a quest, a board, or anything else.
- Split XP percentages with teammates on any quest (80ac8b67).
- Choose whether to share each victory on the celebration screen, instead of it sharing automatically.
- Message anyone in the party, with an email notification.

This needs a data model (sharing, invites, permissions) and a design talk with you.

## 3. Calendar as a real planner
- **Repeating events, quests or not, and travel time.** Reached from the right-click menu (13c5ba6a).
- **Undo and redo**, with buttons and Ctrl+Z / Ctrl+Y (3e14a8c0).
- **Click and hold to drag out a custom time box** (f9e1b187).
- **Changing a quest's length:**
  - The preview resizes live while placing it (10532420).
  - On the calendar, longer grows the box; shorter asks first (b92b5691).
- **Daily essentials like real events** (3e7e0b78, 68e84514):
  - Once accepted they hold their time.
  - They're never covered over, and they never go to Google.
  - Any item gets an easy "not on Google Calendar" toggle.
- **The auto-scheduler window:**
  - It isn't movable, and minimizing shows two buttons (0ba453c0).
  - Its list needs right-click, drag to reorder, and a Today / Additional filter (013bd426).
  - Today's quests at the top, and its button says "Schedule next quest" (be1eafb7).
  - Auto-schedule shows a tentative outline with Confirm / Change, where Change lets you drag it to any slot (5ec031b1).
- **Rescheduling from Today placed it at the wrong time** (a5f87cf1). This is a correctness bug; needs a real calendar to test.
- **Other calendar notes:**
  - Edit Google events in place (1a19edb3), and offer to update Google's title or notes when you change them in the app (daf28a8c).
  - Wrong or unwanted calendars in the reschedule tool, "10/10 top priority" (59474700, a038910b).
  - A smooth 1–14 day width slider with partial days (070f6e4d).
  - Colours per calendar, past ones too, and a past/now distinction on or off (8ce43826).
  - Big blocks: choose where the icon and info sit (a9e80702).
  - Fine-tune the checkmark look (7fa96e3f).
  - Rescheduled items show flames as they redden (cf05e5cb).
  - Show when past quests were completed (e300999d).
  - "Go through multiple iterations of improving this screen" (05a2411d).

## 4. The welcome screen as buttons you shape yourself
- **Long-press or right-click any welcome button** to set its XP, its look, its icon and its text. Only the gear opens the screen settings (58c0800a, 2064f739, 9cf6e5a6).
- **Each section pays XP when saved**, with a pop-out Save. Brainstorm first (c3cf0bf2).
- **One welcome screen a day.** After 2.5 hours away, the toucan greets you in the mist instead (37acc106, 4bbe505a).
- **Swipe a section left to snooze it**, and a big green check when a section is done.

## 5. Quests and completing them
- **Completing:**
  - Choose to complete all sub-quests, give partial XP, or complete the quest and leave its sub-quests (9144f5cb).
  - Completed cards stay on Today until you move them (74b32130).
  - Complete a quest from the calendar with the celebration (09f22c55, 1ce825b9).
  - Celebrate the character stats that gained XP (3471d889).
  - More celebration when you raise the XP after partial progress (2f8aac19).
- **Sub-quests:**
  - Drag them easily to reorder.
  - Turn one into a quest.
  - Give them avatars, with a calendar option to show them (d3f5c104).
- **Portraits:**
  - Paint 1 to 3 to choose from (c6c7aeef, 5c693b5d).
  - Upload an image, then choose to turn it into a portrait or use it as is.
  - A blank circle by default.
  - "What to paint" shouldn't feel like editing the title (621a4e6b).
  - "Paint for 3" becomes a pick list (fef19c2b).
- **Brainstorms you asked for before building:**
  - The Save vs. Complete quest button design (3 drafts).
  - How a highlighted number looks.
  - The board button on a quest portrait.
  - Quest card balance.
  - Habits in the day's plan.
- **The Bounty List:** a purse icon, +50 then +100 coins per press, and the icon iterated until it looks high quality (3c1d887a).
- **A welcome guide for new questers**, with the warning about XP and coin inflation (9864f4d8).

## 6. Other bigger pieces
- **Screenshot tool:** it isn't working (66ed9816, 9d5333d8), and you'd like to drag out an area of the screen (85ac6c8a).
- **Copy and paste in text fields** (1f4e5680). Check what blocks it on each screen.
- **Anti-habits as tracked events with their timing.** Waiting on your pick of the ideas sent Nov 4.
- **Morning routine design talk** (Saturday), and the button audit (Saturday Nov 7).
