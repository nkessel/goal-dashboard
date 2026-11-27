# Dev plan in order (Nov 18)

One path through the open work, ordered to cut technical debt first. Each **run** uses one model. Set the model, give the session the run's list, and when the run's last task is done the session tells you which model to switch to next.

This plan only puts the other plans in order. Each task's details are in its own plan:
- **Split plan** (`planning/2026-11-16-split-plan.md`): step ids S, L, T, W, I, E, C, D.
- **Calendar planner design** (`planning/2026-11-16-calendar-planner-design.md`): "Cal 1a", "Cal 4" and so on.
- **Due and scheduling plan** (`planning/2026-11-17-due-and-scheduling-plan.md`): "When 1" to "When 7".
- **Lighter-in-use handoff** (`planning/2026-11-16-lighter-in-use-handoff.md`): "Light 1" to "Light 8".
- **The by-model list** (`planning/2026-11-16-dev-priorities-by-model.md`): the feature backlog.

**How to start a run:** "Run <letter> of `planning/2026-11-18-chronological-dev-plan.md`. Work the list top to bottom. Follow CLAUDE.md (UI check, design review for new UI or design changes; bug fixes ship straight). When the list is done, or the next task needs a different model, stop and tell me which run and model come next."

## Why this order

1. **Finish or drop what's in flight first.** Four review branches and two active designs touch the same files the splits will cut. Splitting under them makes every merge a hand job.
2. **Safety net next.** A before/after screen compare (S1) and a fix for lost saves (D0) make every later step cheaper and safer.
3. **Then the splits**, cheapest first: small imports, then whole components that only need moving. These make every later session read less, which saves credits on everything after.
4. **Features that touch the split files come after their split.** For example, the new "when" panel goes into the quest editor's scheduling part once that part is its own file. The calendar's undo comes after its one write path exists.
5. **Small feature work fills the cheap runs.**

---

## Run A · Opus 5.5 · now: close what's in flight

Already moving. Finish these before any split starts.

1. **Due and scheduling redesign, design side:** your hard vs soft deadline model and the single complete-by date. Settle the words and the panel layout (When plan, section 7 questions) and update the When plan to match. Build nothing in the quest editor yet: it gets split first (Run D), and the panel goes into it in Run E.
2. **Sub-habit "open in place" layout** (the thread "Brainstorm sub-habit display on habit cards"). Build your pick, then send it for review. It's on `DailyHabits.tsx`, which isn't in the split plan, so it can go ahead.
3. **iPhone keyboard and feedback box** (repeat asks 1 and 16, the thread "Fix iPhone keyboard and feedback box"). This is waiting on your recording or answer. Finish it here, because the welcome-screen split (W4) moves this same code.
4. **S1: the before/after compare for the UI check** (Opus in the split plan). It's the safety net for every split, so it's done early.
5. **Plan the `actions.ts` split** (5,186 lines, read by nearly every session). Plan it only, and check first whether this Next version lets a `"use server"` file re-export actions.
6. **Additional habits** (owner, Nov 18): on Daily Habits, the habits that aren't up today sit in an "Additional habits" fold under the list, like Additional Quests, and can still be ticked. Built on its own, ahead of the one Today list (`planning/2026-11-16-one-list-brainstorm.md`), which can later take this fold as its "not today" part. `DailyHabits.tsx` isn't in the split plan. Review branch `review/additional-habits`.

**Then switch to Sonnet 5.5 (Run B), after your checkpoint below.**

### Your checkpoint (no model needed)

Say OK, give notes, or drop each of these, so the splits don't have to work around them:
- `review/time-ranges-lesson-button` (time ranges, Complete lesson button). It blocks D2 to D4 and Cal 4, 5 and 7.
- `review/import-calendar` (import card A). It blocks the import-screen split (I1 to I6) and When 4.
- `review/prioritize-bars` (taller Prioritize bars). Unchecked since Nov 14; dropping it is fine.
- Cleaning XP (`claude/project-thread-6rvbre`, paused). The XP burst and three tray layouts are saved as a patch.

---

## Run B · Sonnet 5.5 · merge, measure, and the safe groundwork

1. Merge what you said OK to at the checkpoint, and delete what you dropped.
2. **S2, S3:** fixtures, baselines, and splitting the UI check's too-long `today` flow (Light 8).
3. **L1, L2:** the toucan's and quest editor's small exports get their own files. This should shrink Today's and the import page's code; write down by how much.
4. **D0:** stop the catch-all from losing saves (one key per write). This is a real data bug today.
5. **D1:** add the new quest columns. Nothing reads them yet.
6. **When 1:** `lib/when.ts` and its checks. Nothing visible.
7. **Cal 1a:** run the UI check in two time zones and fail on hydration errors.
8. **Cal 1b, 1c, 1d, 2c, 3:** the calendar fixes you can see, on one review branch, plus the data copy.

**Then switch to Haiku 5.5 (Run C).**

## Run C · Haiku 5.5 · small and mechanical

1. **L3:** `useNowMinute` and `WelcomeAward` get their own files.
2. **Cal 1e, 2a, 2b, 2d:** no bottom-bar prefetch of the calendar, the picker's day chips, the Google write order, settings saved as a merge.
3. **T2, T3, T4:** the toucan's note, chat cards and planners move to their own files.
4. **W1, W3:** the welcome screen's shared helpers and finished parts move to their own files.
5. Tick the split plan's list and update `docs/SHIPPED.md`.

**Then switch to Sonnet 5.5 (Run D).**

## Run D · Sonnet 5.5 · the big filing jobs

**Status Nov 22 (first Run D session):** done: actions.ts split, T1, T5, W2, C1, E1, E2 (tags only), D2, D3. Not done (ran long): E2 Stats/Template/BoardTray, E3, E5, E8, I1-I6, Light 5 and 7 (the two Light items need `npm run perf` to measure and to prove nothing changes on screen).

1. **The `actions.ts` split**, done the way Run A planned it, one area per commit. This goes first because every later session reads that file.
2. **T1, T5:** the toucan's stores and chat sheet (T1 holds module state: one copy only).
3. **W2:** the welcome toucan.
4. **C1:** the calendar's lower third (controls, daily blocks, weather).
5. **E1, E2, E3, E5, E8:** the quest editor's styles, islands, place and look, form parts, and frame.
6. **D2, D3:** copy the per-quest extras into the new columns (with a backup in the database), then read the columns and write both.
7. **I1 to I6:** the import screen, if `review/import-calendar` is merged or dropped by now.
8. **Light 5, Light 7:** the boards' dream cloud and the welcome sky motes. Both are small rendering fixes.

**Then switch to Opus 5.5 (Run E).**

## Run E · Opus 5.5 · the hard cuts, then the new "when"

1. **E4, E6, E7:** the editor's progress, steps (hook first) and scheduling parts.
2. **When 2:** the new when panel goes into `EditorScheduling`, with your hard/soft deadline model from Run A. Review page.
3. **When 3:** `MiniCalendar`, the real calendar in a small size. This is the risky step, so run it at high effort. Review page, and it needs your iPhone.
4. **Cal 4 with C2:** one calendar item list that every view reads (pixel-compare before and after).
5. **Cal 5:** one write path for every calendar change, with opposites, so undo becomes possible.
6. **T7, W4, W5:** the toucan's timed nudges and the welcome screen's keyboard hooks (repeat-ask code: moved whole) become hooks.
7. **E9:** make the editor lighter, measured. An XP tap should redraw only the XP part [ef27a8c4].

**Then switch to Sonnet 5.5 (Run F).**

## Run F · Sonnet 5.5 · finish the "when" and the calendar basics

1. **When 4, 5:** the import card and the quest menu, Prioritize and the auto-scheduler use the one panel. Delete the old pickers.
2. **When 7:** "when" changes go through the calendar write path, which gives them Undo.
3. **Cal 6:** undo and redo buttons, Ctrl+Z and Ctrl+Y.
4. **Cal 7b, Cal 8:** "Add a different quest here", daily-event polish, and travel time for every item.
5. **C4:** the calendar grid's pieces.
6. **D4:** stop writing the old keys. Do this only a week or more after D3, with no trouble reported.
7. **Light 4 (profile only), Light 6:** profile the feedback box's open with `--trace`, and fix the perf tool's XP-tap step.

**Then switch to Opus 5.5 (Run G).**

## Run G · Opus 5.5 · deeper fixes and the bigger features

1. **Cal 7a:** essentials as real events: they float, are never covered, and you can drag them. First case: Call Dad, any time 8 AM to 8:30 PM, preferred 2:30 to 7:15 PM (owner, Nov 27). Built with PRIORITIES item 16: drag a habit or essential into a quest, and non-[bracketed] events shown as quests, all from the Opus design pass's coded page (made after the WH/MC merge), only on his codes.
2. **C3:** one hook per calendar gesture. It's simpler now that Cal 5 exists.
3. **Light 1, Light 2:** the Evening Routine stars, and ticking a habit redrawing 450 rows.
4. **D5:** quest cards read their place and colour on first paint. Review page.
5. **Cal 10a, 10c:** repeating events and quests. The Google side needs your real calendar.
6. From the by-model list:
   - ~~undo-completion bugs~~ (done Nov 23)
   - the sequence and sub-quest merge [dafe3364]
   - the screenshot tool
   - right-click menus as popups app-wide
   - a smaller toucan chat (the toucan is split by now)
   - the Insights, boards and anti-habits batches
   - **the Insights timeline** (round 3 on the chart page, once the owner OKs it; spec in `docs/WAITING.md` › Insights chart): merged chart by default, split as an option, and **zooming in and out of the dates** (owner, Nov 19): pinch on a phone, trackpad pinch or Ctrl+scroll on a computer, and the range picker; times on the axis only once zoomed in. Plus the "How do you feel?" faces on celebrations, fails, logged events, journal entries, tracked events and habit ticks
   - **the FAB's check-in** [5156ffbe] (owner, Nov 16: "should be more developed… doesn't even have an option to add your own metrics"): the same check-in as on Insights (your own metrics, + metric, journal, faces), with the Insights check-in notes [a6fdd579, bd692d57, 78004f71] since they share the code. Asked about again Nov 19.
   - **the toucan's question can carry parts of the full welcome screen** (owner, Nov 20): its gear (settings in context) offers the big welcome screen's sections (sleep check-in, mood check-in, and the rest), each added as a button on the toucan's screen in the order chosen there (drag to order, eye to hide, as in `WelcomeArrange`). Builds on `review/faces-feel`'s `ToucanQuestion`.
   - habits in the day's plan, part 2
   - ~~tests for the XP and coin math~~ (done Nov 23, `scripts/test-xp-math.mjs`)

**Then switch to Sonnet 5.5 (Run H).**

## Run H · Sonnet 5.5, then Haiku 5.5 · backlog and polish

1. **Sonnet:**
   - Cal 10b (the repeat control)
   - Cal 9 (the Google check)
   - the language window
   - flat icons
   - the small boards items
   - the journal prompt
   - the auto-scheduler counts
   - calendar text clipping
   - marking feedback that's already built
2. **Haiku:**
   - When 6 (the words sweep)
   - consistent capitalization
   - docs upkeep
   - D4's cleanup a month later (drop the backup table)

**After that:** back to the by-model list for anything new, or start the next plan.

---

## Saved for Fable (when you have it again)

These are the tasks where the top model is worth the allowance. Nothing above needs it.
- **The social side, built:** invites, shared quests, split XP. The design is done; building it touches permissions and data across the app.
- **One list for the day:** the merged Today list (`planning/2026-11-16-one-list-brainstorm.md`). Build it after Runs E and F, because it leans on the new "when".
- **A whole-app lightness pass** after the splits, using the click log to rank the most-used screens.

## Waiting on you any time

- **Pick the import card mockup (A, B or C).** It's already in the checkpoint above.
- **Your iPhone checks:** list in `docs/WAITING.md`.
- **The email to Daniel:** after the app has a domain email address.
- **The character screen brainstorm:** whenever you want it. Opus, any run.


## Note (Nov 18): music
Celebration screen music, when built, gets the same "My music" setting as the falling-quests game: the user pastes a song/playlist link that opens in their music app; the app ships no copyrighted audio.
