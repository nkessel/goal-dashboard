# Splitting the five big screen files, and moving per-quest extras into columns

Written Nov 16 by Fable as a plan only: nothing here is built. It is meant to be worked through by cheaper models, one step per session, top to bottom. Line numbers are from `main` at `9c4d0f7`; they will drift, so find things by name.

**Why:** five screen files hold 12,000 lines between them. Every session that touches one reads all of it, one tap redraws all of it, and one slip breaks all of it. Per-quest extras sit in a shared catch-all where two saves close together can lose one. Both get more expensive to fix the longer they wait.

**The rule for every step in sections 3 to 8: nothing on screen changes.** A step that needs a visible change is the wrong step: stop and write it up instead.

---

## 0. Questions only the owner can answer

1. **Two review branches still touch the files to be split** (`review/walkthrough-v2` merged on Nov 17). The owner's go-ahead on `review/time-ranges-lesson-button` and `review/import-calendar` unblocks the data move (section 9) and the import screen's split (section 6). Everything else can start without it.
2. ~~Shared quests' card look~~ **Answered (owner, Nov 17):** a team quest shows both teammates' avatars on its card; its colour and all its settings are shared; the XP share for each person is set in the quest editor. So place, card look and progress count all live on the shared quest, not per person.

Everything else below needed no answer from you.

## 1. What was found

| File | Lines | Shape today |
|---|---|---|
| `tasks/QuestEditorDialog.tsx` | 3,156 | **One function of 2,870 lines** (224 to 3093) with 85 `useState`, 18 effects. The hard one. |
| `toucan/ToucanGuide.tsx` | 2,251 | Main function 570 lines; the rest is 15 separate components already, just sharing a file. |
| `imports/ImportTriage.tsx` | 2,225 | Main function 490 lines; about 40 separate components and helpers sharing a file. |
| `xp/WelcomeCard.tsx` | 2,209 | Main function 870 lines with 81 `useState`; the lower half is 10 separate components. |
| `calendar/WeekView.tsx` | 2,089 | **One function of 1,500 lines** (78 to 1594): five gestures, lanes, and the grid in one. The risky one. |

So three of the five are mostly a filing job (move finished components into their own files), and two need real cuts.

Four more findings that shape the plan:

1. **Small imports drag whole big files along.** `BossLine` (on Today), `SchedulingList` and `WelcomeCard` import `talkToToucan` from `ToucanGuide.tsx`, so the "lazily loaded" toucan file is very likely inside Today's own code after all. `ImportTriage` imports four small helpers from `QuestEditorDialog.tsx`, so the import page carries the whole editor. `DayView` imports `useNowMinute` from `WeekView.tsx`. Moving those small things into small files is the cheapest win here (section 3). Not measured yet: step S3 measures before and after.
2. **The per-quest extras are almost empty in production today** (checked in the database, Nov 16): 1 card look, 0 places, 0 drive times, 0 progress counts. Moving them now is nearly free. It will not stay that way.
3. **The catch-all can lose saves.** About 40 server actions read all of `profiles.life_wheel`, change one key and write the whole thing back. Two saves close together (a toucan note and a cleaning tick, say) and the second writes back a stale copy of the first's key. The biggest key is the toucan's notes (`coach`, 12 KB), rewritten on every unrelated save. Step D0 closes this for every key, not only the per-quest ones.
4. **There is no "did the screen change?" tool.** The UI check finds layout bugs; it does not compare before with after. A split needs exactly that, so it is built first (S1). There are no dependencies installed in a fresh container (`npm ci` first), and no unit test runner.

React's compiler is not switched on (only its lint rules are), so a component moved into its own file does not stop re-rendering by itself. Filing comes first because it is safe; render savings are separate, measured steps (E9, and the handoff's items).

## 2. Ground rules for every step

- **One step, one commit, one push.** Never two steps in one commit: if a screen changes, the step that did it must be obvious.
- **Move, don't rewrite.** Cut and paste whole functions. No renames, no tidying, no "while I'm here". The only new lines are `import`, `export`, and a props list. Check with `git diff --color-moved=zebra --color-moved-ws=allow-indentation-change`: everything except those lines should show as moved.
- **A piece of state moves into a child only if nothing outside that child reads it.** Before moving a `useState`, `grep` its name and its setter in the parent. If either appears in what is left behind (in the quest editor: `fields`, `draftNow`, `draftSig`, `persist`, `save`), the state stays in the parent and goes down as props.
- **Props are values and `setState` functions.** Don't pass new inline arrow functions to a part that will later be memoized; if a handler needs several pieces of parent state, leave that handler's logic in the parent for now and note it.
- **Keep the old import paths working for one step.** When a thing moves, change its importers in the same commit; don't leave a re-export behind in a `"use client"` big file (that is how finding 1 happened).
- **Checks for every step,** in this order: `npx tsc --noEmit -p .`, `npx eslint <files touched>`, `npx next build --webpack`, then `npm run ui-check -- --no-build --only <flows in the step's row>` with the snapshot compare from S1 showing no differences, then the build's chunk sizes against the last step's (S3). A difference in the compare means stop, find it, fix it; never update the saved "before" to make a step pass.
- **These steps show nothing new, so they ship straight to `main`** (CLAUDE.md's rule for invisible changes), each logged as one line in `docs/SHIPPED.md` under a single "Split plan" entry, and ticked off in section 10 of this file.
- **Repeat asks:** the welcome screen's keyboard code (W4) and anything near the feedback box are repeat-ask territory (`docs/REPEAT-ASKS.md` 1 and 16). Those steps run the phone-with-keyboard device and say in the note that a real iPhone was not checked.
- **Stop rule:** if a step turns out to need more than about 300 lines of non-moved change, stop and write down why under the step. A wrong split costs more than a late one.

## 3. Phase S and L: the safety net, then the small imports

Do these first, in order. None is blocked by any branch.

| Step | What | Check | Model |
|---|---|---|---|
| **S1** | **Before/after compare for the UI check.** Add `--snapshot <dir>` to `scripts/ui-check/run.mjs`: at every `check()` write the page's normalized HTML (strip React ids like `:r1:` and `_R_…`, `data-reactroot`, inline `style` values that are animation-driven, anything inside `[data-clock]`; freeze the clock with Playwright's `page.clock` so "now" is the same in both runs). Add `--compare <dir>`: report the steps whose HTML differs, with the first differing element. Also save the screenshots so a person can look. Document it in `docs/ui-check.md`. | Run it twice on `main` with no change: zero differences. Then change one class by hand: it is reported. | Opus 5.5 |
| **S2** | **Fixtures for what is about to move.** In `scripts/ui-check/fixtures.mjs` give the test account's `life_wheel` a `questPlaces`, `calCardLooks`, `questDrives` and `progressUnits` entry on quests that Today, a board and the calendar show. Add a `check()` after opening that quest's editor panels (place, look, drive, progress) in `flows.mjs`. | The new shots show a place, a coloured card, a drive time, "12 of 32 pages". | Sonnet 5.5 |
| **S3** | **Baselines.** Split the `today` flow in two (it runs past its 4-minute limit, so its last steps go unchecked: handoff item 8). Save a full `--snapshot` of `main`, `npm run perf` for `editor`, `toucan`, `calendar`, `welcome`, `today`, and the build's per-route "First Load JS" table, into `ui-check-out/baseline/` (git-ignored) and paste the size table and perf numbers into section 10 here. | Table in section 10. | Sonnet 5.5 |
| **L1** | **Toucan's small exports.** New `src/components/toucan/talk.ts`: `PlanTarget`, `Mode`, `talkToToucan`, `PLAN_DAY`, the mode store (`readMode`, `subscribeMode`, `useToucanMode`, `GuideMode`). New `toucan/Digest.tsx`: `Digest`. Repoint `BossLine.tsx`, `SchedulingList.tsx`, `WelcomeCard.tsx`, and anything else that imports them. `talkToToucan` only fires a window event today; check that it has no hidden dependency on the big file's module state before moving it, and if it does, move that state with it. | Flows `today`, `welcome`, `calendar`. Today's First Load JS should drop; write down by how much. | Sonnet 5.5 |
| **L2** | **Quest editor's small exports.** New `src/components/tasks/editor/dates.ts`: `pad`, `localDate`, `localTime`, `shortTime`, `slotWords`, `planByIn`, `dueIso`, `dueChipLabel`, `dueQuickPicks`, `ESTIMATE_PICKS`. New `tasks/editor/glyphs.tsx`: `StepsGlyph`, `PinGlyph`, `FactCaret`. New `tasks/editor/types.ts`: `QuestDraft`, `QuestEditorMode`. Repoint `ImportTriage.tsx` and every `import type { QuestEditorMode }`. (`review/import-calendar` exports `shortTime` and `slotWords` from the big file: see 9.) | Flows `import`, `create`, `today`. The import page's First Load JS should drop. | Sonnet 5.5 |
| **L3** | **Two more.** `useNowMinute` to `src/lib/use-now-minute.ts` (repoint `DayView.tsx`, `WeekView.tsx`); `WelcomeAward` type to `src/components/xp/welcome/types.ts` (repoint `DailyLogin.tsx`). | Flows `calendar`, `todaycal`, `welcome`. | Haiku 5.5 |

## 4. Phase T: the toucan (`toucan/ToucanGuide.tsx`)

Not blocked by any branch. Do it before "a smaller toucan chat" (Opus item 10 in the priorities list), which edits `GuideSheet`.

Target: a `toucan/` folder where the largest file is under 600 lines.

| Step | What moves where | Model |
|---|---|---|
| **T1** | Stores and timers, no JSX: `toucan/snooze-store.ts` (`SnoozeNote`, `SNOOZE_KEY`, `readSnoozed`, `writeSnoozed`, `tomorrowMorning`, `readCheckins`, `writeCheckins`, `todayKey`), `toucan/watch.ts` (`lastActive`, `watchingActivity`, `busyNow`, `whenFree`, `whenNoWelcome`, `watchCache`, `stillDueToday`, `stillOpen`, `sharedWatch`, `beginQuest`). These hold module-level variables: each must end up in exactly one file, imported everywhere else, or there will be two copies of the state. | Sonnet 5.5 |
| **T2** | The note: `toucan/NudgeNote.tsx` (`NoteAction`, `laterChoices`, `PickTime`, `NudgeNote`, `NoteReply`). | Haiku 5.5 |
| **T3** | The chat's cards: `toucan/ActionCards.tsx` (`UserWords`, `ActionCard`, `Made`, `stampISO`, `clock12`, `MadeCard`, `ShipCard`, `PromiseOffer`, `OfferCard`, `Pill`, `eventWhen`, `when`, `completeQuestFromNote`, `beginPromise`). | Haiku 5.5 |
| **T4** | The planners: `toucan/CatchUpPlanner.tsx`, `toucan/PlanIt.tsx` (with `MINUTES`, `slotLabel`, `hiddenCalendars`). | Haiku 5.5 |
| **T5** | The chat sheet: `toucan/GuideSheet.tsx` (`GuideSheet`, `PROMPTS`, `Msg`). | Sonnet 5.5 |
| **T6** | *(optional, measure first)* Load `GuideSheet` only when the chat first opens, warmed at idle the way `warmQuestEditor` does it, so the first open is still instant. Keep only if `npm run perf -- --only toucan` and the size table both improve; a first open that waits visibly is a failure. | Sonnet 5.5 |
| **T7** | The three long effects in the main function (arriving on Today, 408 to 582; due today, 584 to 642; promises with a time, 643 to 734) become hooks in `toucan/nudges.ts` taking `raise` and the refs they use. These lean on `raiseRef`, `actionsRef`, `snoozeForRef` and `styleRef`, kept fresh by small effects: the order those effects run in must not change. | Opus 5.5 |

Check for every T step: flows `today`, `welcome`, `feedback`, `pages` (the toucan perches on all of them), morning and evening. What the UI check cannot see: nudges that fire on a timer (3 hours before something is due, a promise's time). T7 needs a hand test with the clock moved: say so in the note.

## 5. Phase W: the welcome screen (`xp/WelcomeCard.tsx`)

Not blocked. `review/walkthrough-v2` does not touch this file.

New folder `src/components/xp/welcome/`. `WelcomeCard.tsx` stays where it is (it is imported by `DailyLogin` and by Settings' preview).

| Step | What moves where | Model |
|---|---|---|
| **W1** | `welcome/shared.ts`: `GILT`, `PILL`, `FIELD`, `readJson`, `writeJson`, `SNOOZE_MAIN`, `snoozeOther`, `greetingSize`, the `REPLY_*` numbers, `PartKey`, `ButtonKey`, `isPartKey`, `isButtonKey`, `BUTTON_NAMES`, `EMPTY`, `SNOOZE_PARTS_KEY`, `localDay`, `readSnoozedParts`, `revealThroughMist`, the confetti `PIECES`. | Haiku 5.5 |
| **W2** | `welcome/WelcomeToucan.tsx`: `WelcomeToucan` with everything only it uses (`TOUCAN_AT`, `readToucanAt`, `toucanLanded`, `LANDED_KEY`, `landedBefore`, `markLanded`, `resetToucanFlight`, `Box`, `toucanBox`, `PERCH_BAND`, `clearSpot`, `onScreen`). `toucanLanded` is module state: one copy only. | Sonnet 5.5 |
| **W3** | `welcome/TopPriority.tsx`, `welcome/WelcomeJournal.tsx` (with `PromptPill`, `JournalPromptsEditor`), `welcome/Buttons.tsx` (`ButtonShell`, `ButtonEditor`), `welcome/Lines.tsx` (`LineVote`, `ReflectLine`, `CheckinPanel`). | Haiku 5.5 |
| **W4** | From the main function, hooks that own their state and refs: `useHeldScreen` (the screen height held still under the keyboard, 335 to 409: **repeat-ask code, move it whole and unchanged**), `useCardPlacement` (where the card sits and how wide, drag and resize, 228 to 254), `usePinnedPaper` (`alignFoot`, 141 to 166), `useHeldScroll` (`holdScroll`, `giveBack`, 167 to 199). | Opus 5.5 |
| **W5** | From the main function, parts with their own state: `GreetingLine` (rewrite in place, thumbs, why, 126 to 140 and 266 to 308) and `WiseLine` (the day's line, ‹ ›, thumbs, 104 to 126). Apply the "nothing outside reads it" rule; `complete()` reads the savers through `savers.current`, which stays in the parent. | Opus 5.5 |

Check for every W step: flow `welcome` on phone, phone with keyboard and tablet, morning and evening, plus `settings` (the preview in Celebration settings). What the check cannot see: real iOS keyboard panning. W4's note to the owner says so.

## 6. Phase I: the import screen (`imports/ImportTriage.tsx`)

**Blocked until `review/import-calendar` is merged or dropped** (it changes 17 places across this file, and the owner has not yet picked the card mockup). When it is, everything here is filing: all Sonnet 5.5 or Haiku 5.5.

New folder `src/components/imports/triage/`:

| Step | File | Holds |
|---|---|---|
| **I1** | `types.ts` | `BoardOpt`, `Step`, `Kind`, `KINDS`, `KIND_ONE`, `SERVER_KIND`, `Draft`, `Attrs`, `AttrKey`, `ATTRS`, the defaults and keys, colour constants, date helpers (`keyOf`, `inDays`, `nextDow`, `dayLabel`, `minutesLabel`), `findBoard`, `draftFor`, `chip`, `pickOn`, `pickOff`, `fieldStyle`, `readJSON`, `writeJSON`, `tinyAttrs`, `TINY`, `withAttrs`, `questExtras`, `importWhere`, `importLabel`, `addLabel`, `planOptions`, `rateable`, `planLabel`, `oftenLabel`, `BoardsCtx`. |
| **I2** | `AttrPills.tsx` | `Glyph`, `AttrPills`, `AttrLayout` (250 lines, the biggest single piece). |
| **I3** | `SubQuests.tsx` | `useStepsShown`, `SubQuests`, `StepRow`. |
| **I4** | `Boards.tsx` | `boardOf`, `PortraitBoard`, `BoardFold`, `BoardTree`, `BoardStep`. |
| **I5** | `Card.tsx`, `List.tsx` | `CardView`, `ImportFoot`, `TrashIcon`, `LaterRow`, `InlineCardText`, `KindBadge`, `KindPicker`; `ListView`, `ListRow`, `SetAside`. |
| **I6** | `Wizard.tsx` | `Question`, `Choices`, `Choice`, `MattersStep`, `OftenStep`, `DayPicker`, `TimeStep`, `Review`, `StepsList`, `Field`, `AllAtOnce`, `PlanStep`, with `MATTERS`, `OFTEN`, `TIMES`, `URGENCY`. |

The main function (490 lines) stays as it is. Check: flow `import` on every device. Later, not now: the import card's sub-quests and the quest editor's steps draw the same thing twice; making them one component is a visible change and its own review.

## 7. Phase E: the quest editor (`tasks/QuestEditorDialog.tsx`)

The most valuable split and the one with real judgment in it. **Do it before the social side's build starts** (its step 2 adds a "With" panel to this editor) and before any other feature work in the editor.

Branches: three review branches change 24 lines here between them. Either they merge first (question 1), or their lines are re-applied by hand afterwards (9).

### The seams

The function is laid out as: state (224 to 700), saving (700 to 1200), a table of parts `partNodes` (1349 to 2251, one entry per `EditorPart`), then the frame that places them (2348 to 3093). The seams follow who owns each piece of state:

- **Islands:** parts that save themselves with their own action and whose state nothing else reads. They move out whole, state and all, and stop re-rendering the rest for free. Tags; the board tray's "stands for" and "also on"; character stats; the place, card look and drive pills (already on shared stores); templates; progress.
- **Form parts:** parts that only show and set fields of the form (title, XP, coins, scales, time, due). Their state stays in the dialog, because autosave, drafts and Save all read it. They move out as components taking values and setters.
- **The spine:** `fields`, `persist`, `save`, the drafts, `completeExisting`, `remove`, `requestClose`. **This stays in the dialog and is not split.** It is 600 lines of ordering-sensitive code (a promise chain, `deleted` and `finished` flags, saved-versus-opened snapshots) and moving it buys little. After the steps below the dialog should be about 1,300 lines: state, the spine, and the layout.

New folder `src/components/tasks/editor/` (L2 started it).

| Step | What | Model |
|---|---|---|
| **E1** | `editor/AutoGrowText.tsx`; `editor/style.ts` for the shared looks used by several parts (`fieldStyle`, `chipBorder`, `labelCls`, `smallBtn`), turned into a function of `isAdventure` where they depend on it. | Sonnet 5.5 |
| **E2** | Islands, one commit each: `EditorTags` (state 577 to 593, part `tags`), `EditorStats` (327 to 345, part `stats`), `EditorTemplate` (423 to 460, parts `template` and the templates tray at 2604; applying a template goes up through one `onApply(t)`), `EditorBoardTray` (`standsFor`, `alsoOn`, 464 and 593, parts 2166 to 2238 and the tray at 2580; `boardId` itself is a form field and stays). Apply the "nothing outside reads it" rule to each state first. | Sonnet 5.5 |
| **E3** | `EditorPlaceLook`: the place, card look and drive pills and their panels (2730 to 2800). They read the shared stores by quest id; "which pill is open" (`factOpen`) stays in the dialog and comes down as `open` and `onToggle`, because only one opens at a time. | Sonnet 5.5 |
| **E4** | `EditorProgress` (state 474 to 487, `commitProgress` at 810, part `progress`). `commitProgress` celebrates and may complete the quest: check what it reads from the spine before moving it; if it needs `persist`, keep the function in the dialog and pass it down. | Opus 5.5 |
| **E5** | Form parts, one commit each: `EditorXp` (part `xp`, with `EarlyBonusFields` and the XP guide), `EditorTime` (part `time`), `EditorShowsIn` (part `showsIn`), `EditorScales` (`SCALES`, `scaleNode`, the four scale parts), `EditorMatrix`, `EditorSequence` (part `sequence`, 100 lines). | Sonnet 5.5 |
| **E6** | **Steps**, the biggest part (state 489 to 500, logic 633 to 700, 320 lines of JSX at 1586). First a hook in `editor/use-quest-steps.ts` holding the list and its operations (`updateStep`, `setStepDone`, `addSubStep`, `addStep`, `renameStep`, `removeStep`, the derived `holders`, `stepsDone`, `stepsLive`), called from the dialog so the spine still reads `steps`. Then `EditorSteps` taking what the hook returns. Two commits. | Opus 5.5 |
| **E7** | Scheduling: `EditorScheduling` (`slot`, `pickWhen`, `takeOffCalendar`, `rateWithin`, `schedulingBlock` at 1279, the due panel at 2796). `slot` is read by Save for a new quest: it stays in the dialog. | Opus 5.5 |
| **E8** | The frame: `EditorHeader` (sticky title, gear, close, review progress, 2417 to 2457), `EditorPortrait` (portrait, tiny switch, board tag, 2457 to 2580), `EditorFooter` (private lock, archive and delete, Complete, Done, 2905 to 3090), `EditorPresets` (2636 to 2694). | Sonnet 5.5 |
| **E9** | **Now make it lighter**, measured. First fix the perf scenario's "5 XP more" tap (handoff item 6) and record the editor's numbers. Then wrap the parts in `memo` and see which still redraw on an XP tap (React DevTools' "why did this render", or the perf tool's component counts); fix the props that change needlessly. Alternative worth one try: React's compiler in annotation mode on `editor/` only (read `node_modules/next/dist/docs/` for `reactCompiler` in this Next version first; the code already follows its lint rules; the live build is Turbopack, so confirm it builds there before keeping it). Done when an XP tap redraws the XP part and the footer, not the whole editor [ef27a8c4]. | Opus 5.5 |

Check for every E step: flows `create`, `today`, `sequence`, `savekeys`, `tour`, `import` (it opens the editor in review mode), `calendar` (adding from a time slot), on phone, phone with keyboard and tablet. What the compare cannot prove is that saving still works, so every E step also does this by hand against the fake database: make a quest with steps, reopen it, change the title and one step, close, reopen; the change is there. Complete one. Archive one. Leave a new quest half written, close, reopen the +: the draft is offered.

## 8. Phase C: the calendar week view (`calendar/WeekView.tsx`)

**Tied to the calendar planner design** (pull request 7, `planning/2026-11-16-calendar-planner-design.md`). That design's steps 1b, 1c, 2c, 4, 7 and 8 all edit this file, and its step 4 changes how the views read their items. Splitting the main function before step 4 would be done twice. So:

| Step | What | When | Model |
|---|---|---|---|
| **C1** | The lower third, already separate: `calendar/week/controls.tsx` (`DaysZoom`, `HoursButton`, `GoToday`, `TodayCrest`, `spanWords`), `calendar/week/DailyBlocks.tsx` (`DailyBlocks`, `HoldTarget`, `holdMenuAt`, the looks store `readLooks`, `subscribeLooks`, `setLook`: module state, one copy), `calendar/week/weather.tsx` (`RainPct`, `RainCloud`), `calendar/week/zoom-store.ts` (the `*_PX` and `*_KEY` constants, `savedCalHour`). | Any time: it sits below line 1594, so the line numbers the calendar design quotes (392 to 424, 1212, 1252) don't move. | Sonnet 5.5 |
| **C2** | Pure layout out of the render: `calendar/week/lanes.ts` with the item list and lane working-out (1039 to 1096) as functions of `(tasks, events, days, dragState)`. | **Inside the calendar design's step 4**, by the same session, as part of introducing `CalItem`. | Opus 5.5 |
| **C3** | One hook per gesture, each owning its refs: `useHourZoom` (121 to 165, 322 to 327, pinch at 516), `useDaySpan` (208 to 224, 404 to 515, 556 to 660), `useSlotPick` (234 to 318), `useItemDrag` (891 to 1038), `useCarriedDrop` (197 to 204, 1096 to 1150). They share `scrollRef`, `boxRef`, `HOUR_PX`, `H0`: pass those in, don't duplicate them. | After the calendar design's step 5 (every time change goes through one function), when `useItemDrag` gets much simpler anyway. | Opus 5.5 |
| **C4** | The grid's pieces: `DayHead` and the pinned heading row (748 to 806, 1195), `TimeColumn` (`hourLabel`, `zoomSlider`, 662 to 733), `ItemsLayer` (1455 on). | After C3. | Sonnet 5.5 |

Check: flows `calendar`, `todaycal`, and the plan rituals (`PlanRitual`, `PairRitual` and `TodayDayCalendar` all draw `WeekView`), with `--devices phone,tablet,desktop`. The UI check does not drag, pinch or wheel-zoom: C3 needs a Playwright hand script that drags an item to another day, resizes one, drags out a new slot and pinches the hours, run before and after, with the resulting times compared. The calendar design's step 1a (two time zones) should exist before C2.

## 9. Phase D: per-quest extras out of `life_wheel`

**Blocked until `review/time-ranges-lesson-button` is merged or dropped** for D2 onward: it rewrites `questCalExtrasAction` and `use-quest-cal.ts` and adds two new keys (`questWindows`, `habitTicks`). D0 and D1 are not blocked.

### What moves, and what does not

| Today (`life_wheel.` key, by quest id) | Becomes | Note |
|---|---|---|
| `questPlaces` (text, 80 chars) | `tasks.place text` | |
| `calCardLooks` (`{ color?, image? }`) | `tasks.card_look jsonb` | Same shape `cleanLook` already checks. |
| `progressUnits` (`{ total, unit, done }`) | `tasks.progress_unit jsonb` | Same shape `cleanUnit` checks; `tasks.progress` (percent) stays the source for XP. |
| `questDrives` (minutes each way) | **Not here.** The calendar design's migration (its section 2b) turns it into `travel_before_min` / `travel_after_min` on `tasks` and `task_sessions`. | One owner per key. Until that ships it stays where it is. |
| `questWindows` (on the review branch) | `tasks.time_window jsonb`, as a follow-up step once that branch is on `main`. | |

Everything else in `life_wheel` (toucan notes, inventory, cleaning, welcome layout and so on) is per-account, not per-quest, and stays. D0 makes it safe to leave there.

jsonb columns rather than several plain ones because each value is read and written whole, already has a cleaning function, and nothing sorts or filters by its insides.

Shared quests (the social design): a teammate's handle is its own `tasks` row. The owner decided (Nov 17) that a team quest's colour and every setting are shared, so `place`, `card_look` and `progress_unit` are always read from and written to the host row, never the handle. The social build's `resolveHost` is the place to do that.

Migration number: the next free one on `main` when the step runs. There are two files numbered 0088, and the calendar design has claimed 0090.

### Steps

| Step | What | Rollback | Model |
|---|---|---|---|
| **D0** | **Stop the catch-all losing saves.** A migration adds a function `set_profile_extra(p_owner uuid, p_key text, p_value jsonb)` that does `update profiles set life_wheel = coalesce(life_wheel, '{}') || jsonb_build_object(p_key, p_value) where id = p_owner` (and removes the key when the value is null), `security definer`, executable by the service role only. In `actions.ts` add `writeExtra(ownerId, key, value)` beside `readExtras` and change every `update({ life_wheel: { ...extras, key: value } })` to it (about 45 places; also `lib/data/cleanups.ts` and the inventory writes). One key per call, so two different keys can no longer overwrite each other. Teach `scripts/ui-check/fake-db.mjs` the function. Two saves of the *same* key can still race; that is what columns fix for the per-quest ones. | Revert the code commit; the function can stay, unused. | Sonnet 5.5 |
| **D1** | **Add the columns** (migration: `alter table tasks add column place text, add column card_look jsonb, add column progress_unit jsonb;`, all nullable, no defaults). Apply to production before the push. Nothing reads them yet. Verify with a SELECT on `information_schema.columns`. | `alter table tasks drop column …` (nothing depends on them yet). | Haiku 5.5 |
| **D2** | **Copy, with a backup.** In one migration: create `life_wheel_backup (profile_id uuid, key text, value jsonb, taken_at timestamptz default now())` with row level security on and no policies, and copy the three keys of every profile into it. **The backup goes in the database, never in the repo: the repo is public and places are personal.** Then fill the columns from the keys, only where the quest exists and `tasks.owner_id` is that profile. Verify with SELECTs: rows in the backup, and for each key the count of entries equals the count of non-null columns plus the entries whose quest no longer exists (list those ids in the note). On Nov 16 this is one row. | `update tasks set place = null, card_look = null, progress_unit = null;` then re-run. The keys are untouched. | Sonnet 5.5 |
| **D3** | **Read the columns, write both.** In `src/lib/data/tasks.ts` add `listQuestExtras(ownerId)` (`select id, place, card_look, progress_unit … where owner_id = … and (place is not null or …)`) and `setQuestPlace`, `setQuestCardLook`, `setQuestProgressUnit` (each `update … where id = … and owner_id = …`: the old actions never checked the quest was yours; these must). `questPlacesAction`, `questCalExtrasAction` (looks only) and `progressUnitsAction` read from `listQuestExtras`; the three `set…Action`s write the column **and**, for this release, the old key through `writeExtra`. The client hooks (`use-quest-places.ts`, `use-quest-cal.ts`, `use-progress-units.ts`) and every screen stay exactly as they are. Move S2's fixtures onto the columns in the same commit. | Revert the commit: the old code reads the keys, which were kept up to date. This is why both are written. | Sonnet 5.5 |
| **D4** | **A week later, with no trouble reported: stop writing the keys** and remove the three keys from every profile with `life_wheel - 'questPlaces' - 'calCardLooks' - 'progressUnits'` (the backup table has them). Verify with a SELECT. Update the comments in the three hook files and `progress-units.ts` that say "until it earns columns". Drop `life_wheel_backup` a month after that. | Restore the keys from `life_wheel_backup`. | Haiku 5.5 |
| **D5** | *(optional, small visible gain, so it takes a review page)* Quest cards read `task.place`, `task.card_look`, `task.progress_unit` straight from the quest they already have (`select("*")` brings the columns, and the kept copy for instant opening has them too), so the place and colour are there on first paint instead of arriving a moment later, and three server round trips per page load go. The stores remain only for the instant update after an edit. Touches `TaskRow`, `CalendarTaskChip`, `CalendarItemMenu`, `CardLookPicker`: pair it with the handoff's item 2 (stable props on `TaskRow`). | Revert. | Opus 5.5 |

**After D3, a standing rule for `docs/HANDOFF.md`:** anything kept per quest gets a column on `tasks`; `life_wheel` is for per-account settings only, written through `writeExtra`.

Check for D steps: the S2 shots (place, look, drive time, progress count) identical before and after; a hand test against the fake database that sets and clears each one and reloads; and on production after D3, one SELECT per column after the owner (or a session, on the test account) changes a value.

## 10. Order, what blocks what, and the tick list

Start anywhere a row says "nothing". One step per session keeps each cheap.

| Order | Steps | Waits for |
|---|---|---|
| 1 | S1, S2, S3 | nothing |
| 2 | L1, L2, L3 | S1, S3 |
| 3 | D0, D1 | S1 |
| 4 | T1 to T5, W1 to W3, C1 | L steps |
| 5 | E1 to E8 | L2; ideally the three review branches merged (else see below) |
| 6 | D2 to D4 | `review/time-ranges-lesson-button` merged or dropped |
| 7 | I1 to I6 | `review/import-calendar` merged or dropped |
| 8 | T6, T7, W4, W5, E9 | their phase's earlier steps |
| 9 | C2 to C4 | the calendar design's steps 4 and 5 |
| 10 | D5 | D4, and a design review |

**If the review branches are still waiting when phase E starts,** split anyway and re-apply their editor lines by hand when each merges (a rebase will not follow lines into new files):

- `review/time-ranges-lesson-button`: `useQuestWindow(task?.id)` and the "Time of day" block with `TimeRangePick` go into `EditorScheduling` (E7); the extra line in `dueChipWords` stays in the dialog; three imports.
- `review/import-calendar`: `shortTime` and `slotWords` are exported from `editor/dates.ts` after L2 already; point its import there.
- `review/walkthrough-v2`: merged on Nov 17, so its lines are already in the editor; nothing to re-apply.

Add a line to each branch's entry in `docs/WAITING.md` saying so when phase E starts.

**Not in this plan, worth its own:** `src/app/actions.ts` is 5,186 lines, bigger than any screen file, and nearly every session opens it. Splitting it by area (quests, calendar, habits, toucan, extras, inventory) would save more reading than any split above. It needs one check first: whether a `"use server"` file in this Next version may re-export actions from other files (read `node_modules/next/dist/docs/`), or whether every importer must be repointed. Opus 5.5 to plan, Sonnet 5.5 to do.

### Tick list (update as steps ship)

Baselines from S3 (Nov 22, `main` at the Cal 3 commit, clean `next build --webpack`):

**First Load JS per route.** Next 16 prints no size table in `next build`, so `node scripts/perf/first-load.mjs` (after a build made against the UI check's fake database) fetches each route's server-drawn page and sums the gzip size of its script tags. Compare each step's numbers against this table.

| Route | gzip | raw | script files |
|---|---|---|---|
| `/` | 550 kB | gzip kB | kB |
| `/calendar` | 416 kB | gzip kB | kB |
| `/quests` | 300 kB | gzip kB | kB |
| `/boards` | 387 kB | gzip kB | kB |
| `/insights` | 385 kB | gzip kB | kB |
| `/plan` | 379 kB | gzip kB | kB |
| `/matrix` | 401 kB | gzip kB | kB |
| `/journal` | 331 kB | gzip kB | kB |
| `/feed` | 346 kB | gzip kB | kB |
| `/settings` | 473 kB | gzip kB | kB |
| `/import` | 335 kB | gzip kB | kB |
| `/rewards` | 333 kB | gzip kB | kB |
| `/summit` | 385 kB | gzip kB | kB |
| `/notifications` | 310 kB | gzip kB | kB |
| `/power-ups` | 333 kB | gzip kB | kB |

**Tap-cost perf (`npm run perf`) for editor, toucan, calendar, welcome, today: not captured.** This cloud session has no Playwright browser installed (`/opt/pw-browsers` is missing) and browsers may not be installed from a shell, so neither `npm run perf` nor the UI check could run here. To fill in: `PERF_NAMES=1 npx next build --webpack` with the UI check's env, then `node scripts/perf/taps.mjs --only editor,toucan,calendar,welcome,today --throttle 4 --out ui-check-out/baseline/perf.json`, and paste the table here.

- [x] S1 (Nov 18, `--snapshot` / `--compare`, see docs/ui-check.md) · [x] S2 (Nov 21, flow `questextras`) · [~] S3 (Nov 22: `today` split into `today` + `today2`; size table done; perf numbers still to do, needs a session with a browser)
- [x] L1 (Nov 21) · [x] L2 (Nov 22) · [ ] L3
- [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 · [ ] T5 · [ ] T6 · [ ] T7
- [ ] W1 · [ ] W2 · [ ] W3 · [ ] W4 · [ ] W5
- [ ] I1 · [ ] I2 · [ ] I3 · [ ] I4 · [ ] I5 · [ ] I6
- [ ] E1 · [ ] E2 · [ ] E3 · [ ] E4 · [ ] E5 · [ ] E6 · [ ] E7 · [ ] E8 · [ ] E9
- [ ] C1 · [ ] C2 · [ ] C3 · [ ] C4
- [x] D0 (Nov 21) · [x] D1 (Nov 21) · [ ] D2 · [ ] D3 · [ ] D4 · [ ] D5

By model: Haiku 5.5 takes 8 steps, Sonnet 5.5 takes 24, Opus 5.5 takes 11. None needs Fable.

## 11. What a cloud session cannot confirm

A real iPhone's keyboard on the welcome screen and the quest editor (W4, E steps); drag, pinch and wheel gestures on the calendar beyond the hand script (C3); the toucan's timed nudges (T7); whether Today's code really shrinks on the live Turbopack build as it does on the webpack one (L1: compare Vercel's build output once after it ships).
