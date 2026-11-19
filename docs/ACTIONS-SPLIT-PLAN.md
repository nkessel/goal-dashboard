# Plan: split `src/app/actions.ts` by area

Planned Nov 18 (Run A of `planning/2026-11-18-chronological-dev-plan.md`, Opus). **Built in Run D (Sonnet), one area per commit.** Nothing visible changes; it ships straight to `main` once the checks below pass.

## Why

`src/app/actions.ts` is 5,223 lines and 319 server actions, and nearly every session opens it. After the split a session reads the one area file it needs (100–750 lines) instead.

## What this Next version allows (checked Nov 18, Next 16.3.4, `next build --webpack`)

The docs (`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`) don't say, so it was tested with a small app built against this repo's `node_modules`:

| `src/app/actions.ts` is… | Result |
|---|---|
| `"use server"` + `export { hello } from "./quests"` | **Build fails:** "Only async functions are allowed to be exported in a "use server" file." |
| `"use server"` + `export * from "./plain"` | **Build fails**, same error. |
| **no directive**, `export { hello } from "./quests"`, `export * from "./plain"`, `export type { … }`, where `quests.ts` and `plain.ts` each start with `"use server"` | **Builds, and works:** a client component imported `hello` and `plainOne` from the barrel and called both (checked in a browser against `next start`). |

So: **`actions.ts` becomes a plain re-export file (no `"use server"`), and each area file is its own `"use server"` file.** The 146 files that import from `@/app/actions` don't change.

## The shape

```
src/app/actions.ts            // NO "use server". Only `export * from "./actions/<area>"` lines and a header comment.
src/app/actions/_shared.ts    // import "server-only"; NO "use server". Helpers used by 2+ areas.
src/app/actions/quests.ts     // "use server"; one file per area (list below)
…
```

Header for the barrel (keep it, word for word):
```ts
// Every server action, re-exported from its area file in ./actions/.
// This file must NOT say "use server" (a "use server" file can't re-export, Next 16.3)
// and must hold only re-exports: add new actions to their area file.
```

## Rules for whoever builds it

1. **Never export a helper from a `"use server"` file.** Every export of a `"use server"` file is a public endpoint anyone signed in can call with any arguments. A sync helper fails the build, but an **async** one (`finishTask(ownerId, taskId)`, `readExtras(ownerId)`, `guideTasks(ownerId)`) would quietly become a hole that lets anyone act on anyone's data. Shared helpers go in `_shared.ts` (`import "server-only"`, no directive); a helper only one area uses stays un-exported in that area's file.
2. **Move code by function, not by section header.** The headers drifted: "Full account data export" holds `createQuestAction` and the art actions; "Quest templates" holds the per-quest extras. The map below is per action.
3. **One area per commit.** `actions.ts` can't keep its own actions and re-export at the same time (it would need `"use server"`, which forbids re-exports), so go through a holding file:
   1. Commit 1: create `src/app/actions/_shared.ts` (helpers below) and `src/app/actions/rest.ts` = the whole current file with `"use server"`, importing the helpers from `_shared`. `actions.ts` becomes the barrel: header + `export * from "./actions/rest"`. Build, check, push. Every action id changes here (the snapshot compare ignores them); nothing else may differ.
   2. Commits 2–14: move one area at a time out of `rest.ts` into its file and add its `export *` line to the barrel. `rest.ts` shrinks to nothing and is deleted in the last commit.
4. Clients that loaded the page before a deploy hold the old action ids and get "Failed to find Server Action" until they reload. That happens on any deploy that touches actions; ship the commits together in one push to make it once.
5. `export *` from two files that export the same name drops the name silently at runtime but `tsc` reports it ("has already exported a member named…"). Run `npx tsc --noEmit -p .` after every move.
6. Cross-area calls between actions import from the area file directly (`import { completeRiteAction } from "./evening"`), not from the barrel (avoids an import cycle through `actions.ts`). Known ones: templates/planning (`deleteTaskAction` ← quests), toucan (`saveNightAction` ← evening), coursework (`completeRiteAction`, `uncompleteRiteAction` ← evening), import-cards (`createQuestAction` ← quests, `createRewardAction` ← rewards, `createRiteAction` ← evening), keep in touch (`completeRiteAction`, `uncompleteRiteAction` ← evening; `tickRiteStepAction` ← coursework).
7. `export type` lines stay in their area file (types are erased; a `"use server"` file may export them). The barrel's `export *` carries them.
8. Leave importers alone. A session that later touches a component may switch it to import from the area file; not required.
9. `revalidatePath` calls move with their action unchanged.

## Shared helpers → `src/app/actions/_shared.ts`

Used by two or more areas (found by name, Nov 18):
- `requireProfileId`, `requireIdentity`, `requireSessionMaybeGoogle` (top of the file)
- `readExtras` (now under Quest templates; used by 15 areas). D0 adds `writeExtra` beside it here.
- `finishTask` with `finishTaskItself`, `releaseNext`, `customCoinAdjustment` (Tasks; used by rewards, journal, planning rituals, import cards, walkthrough)
- `attachCalendarEvent`, `moveSession` (Pull-to-calendar; used by art/export, planning tomorrow, auto-scheduler)
- `assertFamilyFriendly` (art; used by mess check-in), `assertDay` (evening; used by Wheel of Time, coursework, keep in touch)
- `bossStep` (planning tomorrow; used by Tasks), `cleanPriorities` + type `Priority` (Wheel of Time; used by the toucan), `addRitual` (streaks; used by import cards), `guideTasks` (toucan; used by Wheel of Time and coursework), `cleanRepeatInput` (app defaults; used by evening)

Re-check with a grep before the first commit; helpers may have been added since.

## Area files and their actions (order = commit order)

Line counts are by section, before the per-action moves; every file ends up under about 750 lines.

- **`src/app/actions/quests.ts`** (about 739 lines before overrides; 41 actions): `createBoardAction`, `createBoardQuickAction`, `updateBoardAction`, `nestBoardAction`, `setBoardDreamAction`, `createDreamBoardAction`, `reorderBoardsAction`, `createGoalAction`, `reorderGoalsAction`, `updateGoalProgressAction`, `createTaskAction`, `createPriorityTaskAction`, `toggleManualPriorityAction`, `addToTopOfTodayAction`, `reorderTasksAction`, `updateTaskPriorityAction`, `setMatrixStateAction`, `placeOnMatrixAction`, `addToMatrixAction`, `collapseBoardOnMatrixAction`, `expandBoardOnMatrixAction`, `updateBoardMatrixAction`, `completeTaskAction`, `updateTaskAction`, `createBoardFromEditorAction`, `boardFolderAction`, `listBoardOptionsAction`, `setEarlyBonusAction`, `setTaskProgressAction`, `listQuestStepsAction`, `saveQuestStepsAction`, `deleteTaskAction`, `archiveTaskAction`, `listArchivedQuestsAction`, `restoreArchivedQuestAction`, `failTaskAction`, `reopenTaskAction`, `createQuestAction`, `rateSparkAction`, `freshStartAction`, `setNextStepAction`
- **`src/app/actions/calendar.ts`** (about 550 lines before overrides; 30 actions): `suggestSlotsAction`, `scheduleTaskAction`, `addTaskSessionAction`, `listSchedulableTasksAction`, `createScheduledTaskAction`, `convertCalendarEventToTaskAction`, `listSchedulingAction`, `reorderSchedulingAction`, `setSchedulingAction`, `setSchedulingFoldersAction`, `moveSchedulingFolderAction`, `renameSchedulingFolderAction`, `deleteSchedulingFolderAction`, `rsvpGoogleEventAction`, `updateGoogleEventAction`, `schedulerContextAction`, `deleteGoogleEventAction`, `resolveOptionalEventAction`, `listenBoardAction`, `planDayTasksAction`, `autoSchedulerSectionsAction`, `moveToSchedulingAction`, `setTaskPlanByAction`, `moveOffSchedulingAction`, `saveSchedulerSettingsAction`, `applyAutoScheduleAction`, `setChapterTitleAction`, `interestCalendarsAction`, `saveInterestCalendarsAction`, `findFeedAction`
- **`src/app/actions/social.ts`** (about 569 lines before overrides; 46 actions): `sendFriendRequestAction`, `respondFriendRequestAction`, `removePartyMemberAction`, `removeFriendAction`, `acceptInviteAction`, `addReactionAction`, `removeReactionAction`, `addCommentAction`, `markNotificationReadAction`, `snoozeNotificationAction`, `markNotificationUnreadAction`, `deleteNotificationAction`, `markAllNotificationsReadAction`, `createForumThreadAction`, `replyForumAction`, `voteForumAction`, `deleteForumThreadAction`, `deleteForumPostAction`, `setIdeaStatusAction`, `setShareSettingsAction`, `saveSupportNoteAction`, `setTaskPrivateAction`, `setBoardPrivateAction`, `callForSupportAction`, `messageThreadAction`, `sendMessageAction`, `settingsPopupContextAction`, `setNotifyPrefsAction`, `setBoardSharedAction`, `addQuestToSharedBoardAction`, `takeOnSharedQuestAction`, `recentNotificationsAction`, `newNotificationsAction`, `uploadFeedbackImageAction`, `keepInTouchAction`, `saveKeepInTouchAction`, `checkInChartAction`, `welcomePartsXpAction`, `trackedEventsAction`, `saveTrackedEventsAction`, `focusQuestionsAction`, `saveFocusQuestionsAction`, `dawnAction`, `saveDawnAction`, `dawnDayAction`, `tickDawnAction`
- **`src/app/actions/profile.ts`** (about 568 lines before overrides; 32 actions): `dailyCheckInAction`, `exportAccountDataAction`, `getStatsAction`, `setStatsAction`, `setTaskStatSplitAction`, `setDisplayLevelAction`, `buyToucanAddonAction`, `equipToucanAction`, `saveSecretMissionsAction`, `addMissionStepAction`, `sendMissionStepToTodayAction`, `editMissionStepAction`, `setStandsForAction`, `setTaskTagsAction`, `listTagsAction`, `orderMissionStepsAction`, `releaseMissionStepsAction`, `setLifeWheelTopicsAction`, `saveLifeWheelAction`, `appDefaultsAction`, `setAppDefaultsAction`, `dueSoonCardsAction`, `reorderRewardsAction`, `tourAction`, `tourNameAction`, `saveTourAction`, `tourPracticeQuestAction`, `tourStarterQuestsAction`, `tourPinQuestAction`, `tourAvatarAction`, `tourNewQuestAction`, `tourCompletePracticeAction`
- **`src/app/actions/art.ts`** (about 111 lines before overrides; 16 actions): `updateThemeAction`, `pickAvatarFromLibraryAction`, `updateProfilePrivacyAction`, `setTaskIconAction`, `listTaskIconLibraryAction`, `pickTaskIconFromLibraryAction`, `generateAvatarImageAction`, `clearAvatarImageAction`, `updateProfileNameAction`, `generateTaskIconAction`, `removeAvatarFromLibraryAction`, `countTodayWithoutArtAction`, `paintNextTodayArtAction`, `generateQuestIconImageAction`, `ensureStyleExamplesAction`, `removeTaskIconFromLibraryAction`
- **`src/app/actions/rewards.ts`** (about 240 lines before overrides; 12 actions): `createRewardAction`, `updateRewardAction`, `deleteRewardAction`, `listAvailableRewardsAction`, `claimRewardAction`, `completeRewardAction`, `uncompleteRewardAction`, `unclaimRewardAction`, `setTaskGrantsRewardAction`, `listImportsAction`, `confirmImportAction`, `generateNextImportIconAction`
- **`src/app/actions/evening.ts`** (about 688 lines before overrides; 44 actions): `setRiteDoneTimeAction`, `completeRiteAction`, `uncompleteRiteAction`, `createRiteAction`, `updateRiteAction`, `reorderRitesAction`, `removeRiteAction`, `restoreRiteAction`, `skipHabitAction`, `unskipHabitAction`, `listRecentWinsAction`, `getDayPlanAction`, `planQuestAtAction`, `planQuickEventAction`, `unscheduleTaskAction`, `getQuickEventsAction`, `saveQuickEventsAction`, `moveTaskToBoardAction`, `setTaskPlacementAction`, `bossProgressAction`, `listBossQuestsAction`, `listQuestOptionsAction`, `linkQuestToBossAction`, `createBossQuestAction`, `setBossAction`, `getQuestForEditAction`, `logEnergyAction`, `listTakeoffQuestsAction`, `saveCheckInAction`, `wheelOfTimeAction`, `saveNightAction`, `setWheelOfTimeAction`, `welcomeContextAction`, `welcomeHabitsAction`, `setTopPriorityAction`, `getCheckMetricsAction`, `quickCheckInAction`, `setCheckMetricsAction`, `connectGoogleCalendarAction`, `savePlanDraftAction`, `processSeedsAction`, `setBigRocksAction`, `reviewQuestAction`, `completePlanAction`
- **`src/app/actions/journal.ts`** (about 329 lines before overrides; 21 actions): `logDoingNowAction`, `listJournalAction`, `addJournalEntryAction`, `addFeedbackAttachmentAction`, `reviewFeedbackAction`, `editFeedbackAction`, `deleteJournalEntryAction`, `setTomorrowQueueAction`, `prioritizeAction`, `rateForDayAction`, `unrateForDayAction`, `habitPlanAction`, `setHabitForDayAction`, `setCoreHabitAction`, `snoozeQuestAction`, `snoozeQuestUntilAction`, `undoSnoozeUntilAction`, `undoSnoozeAction`, `addCheckNoteAction`, `logEventAction`, `deleteCheckNoteAction`
- **`src/app/actions/extras.ts`** (about 226 lines before overrides; 14 actions): `saveStreaksAction`, `saveRitualsAction`, `logSlipAction`, `saveInventoryAction`, `packingListsAction`, `savePackingListsAction`, `saveCleaningAction`, `fightMessAction`, `paintInventoryItemAction`, `makeRefillQuestAction`, `setTaskAlsoOnAction`, `inventoryPhotoAction`, `updateCheckNoteAction`, `saveWeatherPlaceAction`
- **`src/app/actions/quest-extras.ts`** (about 183 lines before overrides; 14 actions): `progressUnitsAction`, `setProgressUnitAction`, `questPlacesAction`, `setQuestPlaceAction`, `questCalExtrasAction`, `setQuestDriveAction`, `setCalCardLookAction`, `rewardGemsAction`, `setRewardGemAction`, `setBoardMistAction`, `saveBoardOrderAction`, `listQuestTemplatesAction`, `saveQuestTemplateAction`, `deleteQuestTemplateAction`
- **`src/app/actions/toucan.ts`** (about 353 lines before overrides; 18 actions): `toucanWatchAction`, `answerDeadlineGuessAction`, `snoozeToucanAction`, `setQuestEstimateAction`, `coachStateAction`, `coachAction`, `coachClearAction`, `coachForgetAction`, `coachPromiseAction`, `coachAddStepsAction`, `coachNewQuestAction`, `coachSetDueAction`, `coachShipFeedbackAction`, `saveFeedbackRunTokenAction`, `coachCheckInAction`, `coachUndoCheckInAction`, `coachLogNightAction`, `coachUndoNightAction`
- **`src/app/actions/coursework.ts`** (about 316 lines before overrides; 20 actions): `courseworkAction`, `applyCatchUpAction`, `saveToucanPrefsAction`, `toucanPrefsAction`, `saveToucanStyleAction`, `savePaletteAction`, `saveMapPrefsAction`, `sequenceOfAction`, `questForEditAction`, `findQuestsAction`, `sequenceLinkAction`, `stepsToSequenceAction`, `sequenceDetachAction`, `sequenceReorderAction`, `sequenceMoveAction`, `setRiteStepsAction`, `tickRiteStepAction`, `tickAllRiteStepsAction`, `bossPlanAction`, `saveBossPlanAction`
- **`src/app/actions/import-cards.ts`** (about 278 lines before overrides; 11 actions): `listImportCardsAction`, `decideImportCardAction`, `editImportCardAction`, `markImportCardImportedAction`, `importCardAction`, `getOwnWordsAction`, `saveOwnWordsAction`, `saveNavOrderAction`, `getWelcomeLayoutAction`, `saveWelcomeLayoutAction`, `translatePhraseAction`

## Checks for every commit

1. `npx tsc --noEmit -p .` and `npx eslint src/app/actions.ts src/app/actions/`.
2. `grep -c "^export async function" src/app/actions.ts src/app/actions/*.ts`: the total stays 319 (or whatever it was at the start).
3. `grep -n "^export" src/app/actions/_shared.ts` lists only helpers, and `head -1 src/app/actions/_shared.ts` is not `"use server"`.
4. `npx next build --webpack`.
5. `npm run ui-check -- --no-build --compare ui-check-out/before` (a `--snapshot ui-check-out/before` taken on `main` before commit 1): **zero differences**, then a click through `savekeys`, `create`, `today` and `import`, which call the most actions. A difference means stop and find it; never re-take the "before" to make it pass.

## Done when

`actions.ts` is only the header and `export *` lines, `rest.ts` is gone, the checks pass, and `docs/HANDOFF.md` section 2 says "Server actions: `src/app/actions/<area>.ts` (re-exported from `src/app/actions.ts`)".
