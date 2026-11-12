# Open in-app feedback (Nov 2–3)

**Newer way (Nov 12): read notes by screen from the database** (`screens` tag on every note; query and keys in `docs/FEEDBACK-BY-SCREEN.md`). This file is the older hand-written list, kept until its groups are built.

The owner's notes that aren't built yet, grouped by area. They were read from `/journal` › App feedback, because there was no database connector. Take a group, build it, move it to HANDOFF › Recently shipped, and delete its lines here. Anything also in `docs/REPEAT-ASKS.md` is built there first, with more care.

## Nov 4 notes (owner, from /journal › App feedback), not built yet

Built Nov 8: button audit (typed × → `CloseIcon` everywhere, 104 buttons), toucan respond field holds one look under a resting mouse, Snooze = 1 hour / Tomorrow / Other…, Move… (Additional Quests or a board, in the menu), blank-circle default portrait, no browser right-click menu.

Built Nov 4 (afternoon): sequencer as quest cards you drag; Settings search + reorganised (Visual settings holds Theme, Layout and effects; Account holds Calendar sync; Secret Missions a half-width tile that slides in; Account & more quieter; Mess check-in out of Settings); evening routine start time Other… (default 4:30pm); Today's gear moved to Settings › Visual settings › Layout › Arrange Today; menu × centred (`CloseIcon`); new quests 15 XP + 1 coin; "Category" for no board; "Primary" without "Priority ·"; sub-quest menu Skip / Remove / Failed (black); "Auto-schedule" in the quest menu; reward button a third of the width, "Undo quest completion"; quest cards don't move on hover; welcome toucan quiet on arrival (Toucan Spirit › His look › "Speaks when you arrive"); time ruler: no ‹ ›, no "type", tap the time to type in place; welcome habits drag to reorder; Today fades up through the mist after the welcome screen.

Built Nov 8 (night): tracked events (pills under the events box in Insights and the check-in: a tap logs one now, Undo; "+ Add tracked event"; hold or right-click a pill to remove it), focusing questions (a lantern left of Today's Quests: one question at a time, ‹ ›, ✎ edits the list), the whole welcome greeting editable (Good morning! too), All Quests › List (Newest by default, Last changed, Due soonest, Most XP, A–Z). The evening "Skip" note was fixed Nov 6 (right-clicks in tomorrow's tray stay with the quest).

Still to do (each the owner's words, shortened):
- Welcome: check-in button loaded 3 times (2:57 PM); the whole screen refreshed for no reason (2:40 PM).
- **Morning routine**: three UX teams' ideas sent to the owner Nov 8 as 3 options (A: Pick your morning pills, B: Body · Heart · Mind, C: Dawn path + offerings); built Nov 9 as Dawn & dusk (see HANDOFF).
- Board button at the top of a quest's portrait: a tap gives a small overview of the board with a prominent "See quest in board"; drop "See quest in board" from the menu. **Brainstorm 2–3 ideas first, owner approves** (1:55 PM). Built Nov 9 (owner picked blend A + D).
- Stats don't show in the quest editor; check the editor and its view settings all work; 3 agents test (1:50 PM). Location missing from the editor's display menu: 2 agents audit for similar gaps (1:48 PM). Save and Complete quest shouldn't be in the view settings, just a "save settings" button (1:49 PM).
- Sequence and sub-quests from the same pill (1:45 PM).
- Editor metrics (importance etc.): a clear gear top right; change how bars display, colours, icons, names; add metrics (1:44 PM). Sub-quest menu icons in the design language (done in part).
- Swipe a welcome-screen section left to snooze it (or hide if done); finishing a section: a big green check slams down left of its header (1:30 PM).
- Quests made from a Claude chat get real portraits (1:28 PM). (Blank-circle default built Nov 8.)
- Avatars of quests and mini-quests aligned; 3 agents brainstorm the quest card section's balance; 3 agents brainstorm habits in the day's plan (Today and/or calendar) (1:07 PM).
- Welcome sleep time field: "make the whole field and section look immaculately beautiful and elegantly simple" (9:00 AM).
- Drag a toucan into Settings or another screen; once dropped in a zone he doesn't come back on his own (8:41 AM).
- Sequence peek: "N after this" only on hover/press of the background cards; a click shows simple card previews in order (8:41 AM). Screenshot button showed the last screenshot, not this screen; "When it ships" options: add "Immediately" (not default) and put them in the design language (8:41 AM).
- Greeting "Good afternoon! Hail, returning hero": only the second sentence is editable (2:57 PM). Check-in button loaded 3 times (2:57 PM). The whole screen refreshed for no reason (2:40 PM).
- One welcome screen a day (first visit); after 2.5 h away (adjustable) the toucan greets in the mist: "What brings you here today?" with a bigger chat; alternatives and replies like his other phrases (2:56 PM). Never more than one welcome screen a day; snoozed for a day = skipped till tomorrow morning (3:03 PM).
- XP box: a blinking cursor when typing; a highlighted number isn't blue: built Nov 9 (owner picked option 3: pulse, then type over).
- Portrait picker: upload an image, and choose "turn into a portrait" or "use as is" (3:01–3:02 PM).
- Save a little more compelling as the default; Complete quest glorious (golden) but not the first thing you'd press: built Nov 9 (owner picked option 1).
- Settings: screens without a tray (like Notifications) slide in from the right, all inside the one settings box (3:14 PM; done for Secret Missions).

## Nov 4 evening – Nov 5 notes (owner, read from the database Nov 5), not built yet

Built Nov 5 (UI check thread): clicking the bird no longer makes it jump (f99d1d48; the global press "give" shrank anything placed by a transform toward the screen corner); the toucan logging "Adderall 11am" after midnight no longer fails with "React error #441" (66ed9816; it logs the 11am that has passed, and errors say what went wrong).

Built Nov 9: Settings groups (His look) slide and always toggle (44f887f0; the bird cage came back Nov 6); an event edits its words, details, feeling and time (6fb5abb2); a board's quests in the order you pick (ffef2c0d).

Still to do (id prefix, owner's words shortened):
- Right-click "N items to sort" › Hide › for 30 min / tomorrow / other (f45ec532). Same for the Due soon button (0519a404) and the Evening routine button, plus its visual settings (c5de37c6).
- **Bounty List** banner right of the Evening routine; a purse icon (iterate it until it looks high quality) puts a quest/habit/reward on it with +50 coins, then +100 per press (3c1d887a).
- Calendar: days wider/narrower as a smooth 1–14 slider with partial days (070f6e4d); wrong calendars showing (a038910b, and 59474700 "10/10 top priority": the reschedule tool shows unwanted calendars, let the user choose); temperature under the time (b41a11d3); "Keep it here" on lunch made it disappear (d097fb6f); Gym not clickable, Breakfast not draggable (93380777); "Skip for today" instead of "Remove for today", position draggable (8b9e4b9c); daily staples clickable (2b6d36d1); edit personal Google events in place (1a19edb3); show proposed/confirmed daily habits like meals (7d40055a); auto-schedule shows a tentative outline with Confirm / Change (drag to any slot) (5ec031b1); today's quests at the top of auto-schedule, its button says "Schedule next quest" (be1eafb7); rescheduling from Today put it in the wrong place (a5f87cf1); show when past quests were completed (e300999d); iterate this screen several times, edit and reorder (05a2411d, 3746ef9c).
- Quest editor: when it was made, in no extra space, tap for edit history (055fa52c, 8a4b38d3); gear icons misshapen (11275375); due date picker doesn't work on a board (18c30fb8); XP pill opens too slowly (ef27a8c4); portrait painting offers 3 to choose from (c6c7aeef); edit sub-quest completion in the editor (e9421b64); "Archive" instead of "Delete quest" (fe7c7f39).
- Completing: "Claim your reward", a little wider, rounder buttons (2c9bbf43); choose: complete all sub-quests, partial XP, or complete and leave sub-quests (9144f5cb); completed cards stay on Today until moved to Victories (74b32130); tapping a victory shows its quest card (d7e26713); a button by Celebrate today's wins makes an XP celebration screen (ebb671ef).
- Feedback box: tapping "Feedback submitted" closes it at once (5f0e6b0a); the screenshot still isn't working (66ed9816).
- Insights: the graph waits for a button press (a9e80702): which graph? Ask the owner.

## Habits and the habit editor (repeat ask 15)
- (Nov 3, built: sub-habits in view and draggable, XP/coins, simpler repeats, Other minutes, Close→Save, details as pills, a sub-habit's menu on the card.)
- (Nov 3, built: the cleaning habit's editor lists its spaces and chores from the mess check-in, with a link to change them.)
- Let habits sit in Today's agenda too. The owner asked for ideas first, as a plain message.

## Mess check-in (cleaning)
- (Nov 3, built: coloured icons at the bars' ends, plain words instead of the weather ones, self-sorting rows, no predictor, own emoji, compact editors.)
- Data done (trash & recycling weekly habit, Tuesdays; weed supplies a chore). The owner deletes the old "clean weed supplies" habit (Daily Habits › Not today › ✎ › Delete).

## Quests and the quest editor
- (Nov 4, built: "sub-quests" not "steps"; labelled Done / Share of XP lines with an inline-typed %; a pre-quest takes its quest's place on Today.) Owner to try on the phone: tap a % and type.

## Calendar
- (Nov 3 late, built: the auto-scheduler window + its ✨ Auto-schedule button + Plan my day on the calendar.) Owner to try: drag from the list, ✨ Auto-schedule, drag/resize on the calendar, tap for info. Plan tomorrow's day's own grid still moves a quest by Move › tap a time (no drag yet).
- (Nov 3, built: every calendar listed, Google-hidden ones too and unticked ones start hidden; drag to reorder; archive skips loading.) Confirm on the live app once Google is reconnected.

## Feedback tool (repeat ask 14)
- Built Nov 3 (pictures in the background, recent notes to edit). Confirm on the iPhone.

## Other
- Martin-care quests as a follow-up to scheduling time with Dad (with the agenda feature above).
- (Nov 3, built: the forest background is a fixed layer, no repaint on scroll.) Confirm on the laptop.
- (Nov 3, built: a quest on the calendar lists the quests waiting behind it as "Agenda".) Left: Martin-care quests added behind the Dad quest (which ones: ask). Original ask: Agenda for a visit (owner, Nov 3): once "Schedule time to be with my dad" is on the calendar, the quests waiting behind it (parents' calendars, Dad's computer, Martin-care quests) show as agenda options for that visit. The quests are set up as its sequence (Family board).

## New notes (Nov 3 evening, read Nov 4)
- Welcome screen: the Habits button's contents editable; a fade-in through the mist the first time the screen appears. (Journal button and the check-in button + graph built Nov 4.)
- (Supplements built Nov 4: 💊 in the check-in, charted as events.) Anti-habits: owner asked how to mark one during check-in (answered in chat; build per the answer).
- (Nov 4: touching or scrolling the page outside the feedback box now gives the page its scroll back.) Confirm on the iPhone.
- Morning routines: made as a habit with sub-habits (Nov 4). A Morning Rites screen like the evening's is still open if the owner wants one.
- (Dragging quests in Plan tomorrow's day built Nov 4; Google events there stay fixed.)
- (Boards: any colour from a colour wheel, built Nov 4.)
- (Nov 4, built: calendars of interest, feeds + links; keep in touch list.) Owner to add the temples' feed links if he finds them.
- Anti-habits: like events, tracked with their timing. Owner didn't like the chip idea; more ideas sent Nov 4, waiting on his pick.
