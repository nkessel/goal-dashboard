# Build plan for lighter models (Nov 14)

Written by the planning session for Sonnet 5.5 / Opus 5.5 sessions to carry out. Take tasks top to bottom
unless one is blocked. Each task is self-contained: read its notes, build, check, ship, mark.

## Rules that apply to every task (read first)

- **Design review before shipping** (owner, Nov 14): screen changes go to a `review/<topic>` branch and a review page of screenshots, and reach `main` only after the owner's OK (`CLAUDE.md` › "Design review before shipping").
- Follow `CLAUDE.md` and `docs/HANDOFF.md` (sections 3 and 4) exactly: `npm run ui-check` for the
  flows you touched before every push, fix every **error** on your screens, add new screens/popups to
  `scripts/ui-check/flows.mjs`, update HANDOFF "Recently shipped" in the same push.
- Read the open notes before changing a screen: the `screens` query in `docs/FEEDBACK-BY-SCREEN.md`.
  Read each note in full: `select body from journal_entries where id::text like '<prefix>%'`.
- Mark what you built: `update journal_entries set auto_shipped_at = now() where id::text like '<prefix>%'`
  (only notes you fully built; say "part" in HANDOFF for partial ones and leave them open).
- Hard rules (HANDOFF section 4): no keys/passwords typed anywhere; never press "Place on the calendar" /
  "Put these on my calendar"; production SQL OK but never "Run without RLS", verify with a SELECT, save schema
  changes as a migration; bulk changes to the owner's quests need his OK first. The repo is public.
- UI: reuse existing parts (`.qe-fact` pills, `.qe-fact-panel`, `Fold`, `LevelScales`, `CloseIcon`, `GoldCheck`);
  no popups for short choices (inline `Fold`); everything animates in and out; owner's exact words for labels.
- One ui-check at a time (`pgrep -f ui-check`); start it with `setsid` (see HANDOFF). Don't edit `src` while it compiles.
- Run: `npx tsc --noEmit -p .` and `npx eslint <your files>` before the ui-check.
- When unsure what the owner means, build nothing for that part: list it under "Ask the owner" in your note.
- Debrief to the owner in a few lines: what shipped, what the check covered, what needs his iPhone.

**Model per task:** **S** = Sonnet 5.5 is enough (contained UI/text). **O** = use Opus 5.5 (cross-cutting,
gesture/keyboard/positioning work, data model changes, or many screens at once).

---

## Task list

### 1. Quest failure, the rest — S (Archive choice, FailQuest, slam shipped Nov 14 night; left: editor ⋯ item, Failed seal in lists)
Shipped Nov 14: `tasks.failed_at`, `fail_reason` (migration 0088, applied), `failTaskAction`, calendar card menu
"✕ Quest failure" / "Undo quest failure", red X on failed calendar cards, failed quests left out of Victories.
Left:
- The quest card's Archive (⋯ menu in `tasks/QuestActionMenu.tsx` / `TaskRow.tsx`) asks inline: **Fail /
  Archive (default) / Delete** [441501e4]. Fail calls `failTaskAction` (optional reason line), Delete keeps the
  existing confirm. Inline `Fold`, no popup.
- Quest editor ⋯: "Quest failure" item too.
- Failed quests in a board/All Quests list: a small red "Failed" seal instead of the victory seal.
- ui-check: add steps to the `today` flow (open ⋯ › Archive, see three choices).
- Mark 43ee3855, 441501e4 when done; 856cbdf3 only after task 2.

### 2. Calendar card "slam" — S (shipped Nov 14 night)
[856cbdf3, rest] When a quest is completed or failed from the calendar card menu, a gold ✓ (or red ✕) stamps onto
the card: scale 1.6 → 1 with a small bounce and a brief shadow, ~350ms (`CalendarTaskChip.tsx`, a CSS keyframe in
`globals.css`, `prefers-reduced-motion` off). Mark 856cbdf3.

### 3. Small wording/spacing notes — S (shipped Nov 14 night)
Each is a few lines; read the note first.
- "+25" in the party says "+25 XP" [89c05f2c].
- Move icon is a folder [457bea7b]; "Remove from Additional Quests" → "Move…" like Today's [2dc2a33d].
- Less space between Due soon and Daily Habits on Today [6a5acc13].
- Snooze icon only (no word) on quest cards [b7e92978].
- Insights: "two days ago" wording and a quieter "add time" [9e99c650].
- Links clickable in the quest editor's description and sub-quests [0b194484] (reuse `ui/Linked.tsx`
  when not editing).
ui-check: today, insights, pages.

### 4. Journal prompts — S
[a6138ad1, e8404a56, 64a404e0 rest] Welcome › Journal: the button shows the chosen prompt; a prompt can be edited,
hidden, deleted by holding it; "+ My own prompt"; written text shows two lines with "Show more". Files:
`xp/WelcomeCard.tsx` (journal part), `lib/journal-prompts.ts`. ui-check: welcome.

### 5. Five-face rating for journal entries and events — S
[85ebdc3a rest, a8c139db, 8ad7c288] Reuse the Sleep quality faces (`xp/SleepCheckIn.tsx`) as a small component;
add it under the event box (Insights › Events, check-in) and the journal entry. Stored on the event's existing
`tone`/a new field: read the notes; if a column is needed, migration 0089. ui-check: insights, welcome.

### 6. Edit times after the fact — S
- A habit's completion time can be edited (hold the done habit → time wheels, `ui/TimeWheels.tsx`) [c12d59cf rest].
- A logged event opens its edit on a press [431c686d] (`insights/EventLog.tsx` already has `EventEdit`).
- Complete in the quest editor asks "Done now / Earlier…" with the time wheels [0c17c4c9].
ui-check: today, insights.

### 7. Due soon and Prioritize — S
- Take a quest out of Due soon (× in Edit, or swipe) [11e52f4e]; hold a Due soon quest for its menu [144dcaa0].
- Prioritize: tap a card for a short preview, a second tap (or "Edit") opens the editor [469594c1].
ui-check: today.

### 8. Inventory — S
[896ea7e1, 5e9cb5e8, dd185e39, e53c4d19] Refill icon + green check; reuse already painted pictures (library
pick before painting); Bring from home movable and wider (`FloatingWindow`); the seam is a visible button.
ui-check: inventory.

### 9. Language window — S
[c084cb95, d6ad55e1, 34a34b07] Read the three notes; `xp/LearnLanguage.tsx`. ui-check: language.

### 10. Party — S
Remove a party member (with a confirm inline) [d9a74c0f]; XP confirmation after the emotional check-in [b5b83086].
ui-check: pages.

### 11. Undo completion problems — O
[8f515d40, a8cbfbe4, 013f5984] Read all three; reproduce in the ui-check fake DB first (`today` flow: complete,
then Undo). Touches `settleCompletion` in `lib/offline.ts`, `reopenTaskAction`, rewards/XP reversal.

### 12. Insights batch — O
[388c0f4e] a log of today's check-ins with a range drop-down; the check-in section's gear and the page's gear
in the right shape and place; [10a509a0, f3cca214] sleep/wake times and notes on the chart; [a4df137c] thumbs-up a
check-in; [bb5ca474] Wheel of Time spun by dragging, no turn count; [565812ea, 61806de0] read first.
ui-check: insights (phone and tablet).

### 13. Boards batch — O
[071a1c62] drag-to-resize scrolls; [9d19bd85] board title opens the board; [0425a9bc] long-press menu on a board;
[aadeefd1] view transitions; [0c79cf53] show the sort being used; [b289b823] past-due filter.
ui-check: pages, plus a new boards flow.

### 14. Right-click / long-press menus as popups, app-wide — O
[841971c2] Quest card ⋯ / right-click, habits, rites open as a floating popup menu at the pointer, not an inline
tray. One shared component; then switch each caller. Check every caller with ui-check today, evening, pages.

### 15. Anti-habits and streaks — O
[b07ee9eb, 3d5ccb0e, 2388f419, 57384f3c] Log without the word "slip", show them like habits, edit the habits in
Streaks, add one in the past simply, tracked-event options shown. Read all four first; data lives in
`life_wheel` (tracked events, streaks).

### 16. Sequence and sub-quests in the creator — O
[dafe3364] Read the note; the quest editor's sub-quests and the sequence window. Large file
(`QuestEditorDialog.tsx`): change only the parts named.

### 17. Smaller ones — S
- Toucan settings sit with the cage icon in Settings [89fd58c4].
- Edit things in Celebrate today's wins (evening) [ef01814f].
- Toucan flies backwards [bbaf7d59] (flip the sprite on the return flight).
- Cleaning XP shows at once [ce1eda24].
- Feedback tool: the current draft above past notes, past notes in distinct bubbles [2cf6858f]; "Cancel"
  instead of "Keep it as it was" [a5453c54]. **O** if it touches the box's placement code in `FeedbackDock.tsx`.
- Welcome section headers and the Habits part [29018ed3] (read first).

### 18. Load speed, measured — O
After the Nov 14 fix (forest background + "Opening your quest log…" instead of a black screen; the day's
first welcome opens from the last data the device saw after 1.5s), measure the first open of the day in Safari
on the live app if any signed-in browser is available; otherwise look for the next server wait on `/` and
`/api/welcome` (Vercel cold start, Google token refresh) and stream it.

---

## Needs the owner first (don't build)

- Character info at the top of Settings / a character screen [98a2c58f]: brainstorm, report back.
- Email to Daniel about his Champion title [13b4b2d4]: his OK and wording.
- Habit editor A/B/C, daily coursework as a habit, import card mockups A/B/C (HANDOFF section 0a).
- What "more visual balance" means on the quest popup.
- Email sending: needs a domain the owner owns for Resend (`RESEND_API_KEY`, `EMAIL_FROM` set by the owner in Vercel).
- Prioritize swipe right (paused by the owner, Nov 12).
- Walkthrough changes: the owner is reviewing the screens (Nov 14).
