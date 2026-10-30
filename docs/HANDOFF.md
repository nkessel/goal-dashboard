# Goal Dashboard: living handoff

**Any Claude Code session, on any account, starts here.** This file says what to work on next and how to ship it. It is kept current by whoever ships: see "Keeping this file current" at the bottom. If it disagrees with `git log`, the log wins, and you fix this file.

- **Last updated:** 2026-10-30 night (last screen on sign-in, reward parts; see Recently shipped).
- **Live app:** https://tinyquest.win (also https://goal-dashboard-kappa.vercel.app)
- **Pending in-app feedback:** as of 2026-10-30 19:50 UTC, still open: early bonus: bird removed and pill on the due line done; still wanted: custom XP + coins + a bonus per extra day early, a "Choose early-completion reward" button opening a small popup when none is set (UX teams to place it); calendar Schedule button display and Settings button responsiveness; opening feedback on /settings/inventory reloads the page behind it.

---

## 1. Top priorities

Ranked. Take the first item that isn't blocked on the owner. When you finish one, move it to "Recently shipped" and re-rank.

| # | Work | State | Next step |
|---|---|---|---|
| 1 | **Arrange in context on every screen** (owner ask, Oct 30) | In progress | Welcome, quest editor, quest menu and Today done. Next: boards, calendar, Insights. Pattern in section 5. |
| 1b | **Finish the UX synthesis** (welcome screen polish, quest editor) | In progress | Follow `docs/WIP-ux-synthesis.md` "Still to do". Reviews in `docs/ux/`. |
| 2 | **Ship pending in-app feedback** | Ready | Run the loop in section 3. See the header list. |
| 3 | **Toucan-started feedback builds** | Owner action | Built Oct 28 (`src/lib/data/feedback-run.ts`). The owner must generate the scheduled task's API token and paste it in Settings › App feedback. Then test one real run ("implement my feedback"). |

**Open questions for the owner** (ask when relevant, don't block on them):
- "Allow editing of quests here" on Tomorrow's Quests: tapping a name already opens the editor. Do they want editing in place?
- "No need to display mist items here on this screen" (Oct 22, /boards): unclear what it refers to.

**Known not possible:** reordering the iPhone photo menu (library, camera, files, Drive). iOS draws it, not the app.

**Ideas floated, not asked for:** a cheap DIY wall-calendar tablet tied to the app; growing the Final Boss into a fuller planning screen; the life wheel as the backbone of boards (see `docs/archive/planning-brief-2026-10-18.md`).

**Non-dev, owner side:** choosing a domain (lifequests.win was the next to check; lifequest.win is premium-priced).

---

## 2. Where things live

| | |
|---|---|
| Repo | `github.com/nkessel/goal-dashboard`. **Push to `main` = production deploy** (Vercel). |
| Database | Supabase project `xjokponibpzyzbmypgyb` ("Success Team App"). Use the Supabase connector (`execute_sql`, `apply_migration`) when it's connected. |
| AI | Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, fallback `llama-3.1-8b-instruct-fast`), env already set in Vercel. |
| Cron | `vercel.json`: `/api/cron/reschedule-reminders` daily at 13:00 UTC. |

**Stack:** Next.js 16.3 App Router (this is not the Next.js you know: read `node_modules/next/dist/docs/` before using an unfamiliar API; build with `--webpack`), React 19.2 with React compiler lint rules, Tailwind v4, Supabase via `supabaseAdmin()` (service role, server-only), dnd-kit.

**Code layout:**
- Server actions: `src/app/actions.ts`.
- Data layer: `src/lib/data/*.ts` (all `server-only`).
- Pure logic: `src/lib/*.ts`.
- UI: `src/components/<area>/`.
- Migrations: `supabase/migrations/NNNN_*.sql`. Latest is `0071_reward_sequence.sql`. All have been run on production. Number new ones after the latest on `main`, and apply them before or with the deploy.
- `profiles.life_wheel` (jsonb) is a catch-all for per-profile extras, read through `readExtras()` in `actions.ts`. **Always merge into it, never overwrite it.**
- `app_defaults` table holds "default for all accounts" settings plus server-only `secret.*` keys (never shown as settings).

---

## 3. How to ship (the loop)

The owner's standing rule: **ship straight to the live app. Don't wait for an OK on a preview.** When the owner says "update the site", that means build and ship all pending in-app feedback, then deploy.

1. **Sync.** `git fetch origin main` and start from the latest `main`. Other sessions ship to it several times a day.
2. **Read pending feedback** (in-app notes live in `journal_entries` with `kind = 'feedback'`):
   ```sql
   select id, created_at, body, review_status
   from journal_entries
   where kind = 'feedback' and auto_shipped_at is null
     and created_at > '2026-10-27T19:21:30Z'
     and (review_status is null or review_status <> 'skipped')
   order by created_at;
   ```
   The admin page `/feedback-review` shows the same queue in the app. Screenshots attached to notes are often unreachable from a cloud container; work from the words and say so.
3. **Build.** `npx tsc --noEmit -p .`, `npx eslint <files you touched>`, then `npx next build --webpack`. A few server pages have pre-existing `Date.now()` lint errors; keep only your own files clean.
4. **Look at it.** Run without a real database and screenshot with Playwright:
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=x AUTH_SECRET=devsecretdevsecretdevsecret npx next dev --webpack -p 3100
   node scripts/shot.mjs <url> <out.png> <width> <height> <fullPage 0|1> '<actions>'
   ```
   Actions are joined by ` ;; `: `click:<sel>`, `wait:<ms>`, `eval:<js>`. Server actions fail offline; check layout only. `src/app/dev-preview/` is git-ignored; recreate small harness pages with mock props when needed.
5. **Ship.** Commit to `main` and push. Vercel deploys in a few minutes.
6. **Mark the feedback shipped:** `update journal_entries set auto_shipped_at = now() where id in (...)`.
7. **Update this file** (section 1 and "Recently shipped"), in the same push or right after.
8. Tell the owner in a few lines what changed. Cloud sessions can't sign in to the live app (Google sign-in), so say what you checked and how.

**Commits:** one line saying what the user sees, then your session's attribution trailers.

**Feedback builds from the app:** the toucan ("implement my feedback") or Settings › App feedback › Build now fires the owner's Claude scheduled task "Build app feedback (toucan)" (`src/lib/data/feedback-run.ts`). That run follows this same loop. Without a token the app writes `secret.feedback_build_requested` in `app_defaults`; the task runs hourly (:37), exits at once unless that row exists, and deletes it when it starts. With a token (`secret.feedback_run_token`) it fires the task's API at once; 15-minute cooldown via `secret.feedback_run_last`.

---

## 4. Hard rules from the owner

- Never type API keys, passwords or tokens into any site. Don't open the Vercel environment-variable values page. Don't reuse credentials pasted in old chats or passcodes seen in emails.
- Google sign-ins and OAuth grants are done by the owner.
- Never press "Place on the calendar" or "Put these on my calendar" (they write to the owner's real Google Calendar).
- Production SQL is pre-approved, but never "Run without RLS". Verify every change with a separate SELECT, and save schema changes as a migration in the repo.
- Bulk changes to the owner's own quests (like moving many due dates) get a confirmation first, with a record of the old values.

## 5. Product taste

**Design teams (the owner's standing UX reviewers):** three agent definitions in `.claude/agents/`: `ux-team-calm-craft` (reduction, hierarchy), `ux-team-game-feel` (game UI, delight), `ux-team-thumb-first` (mobile ergonomics, speed, accessibility). For any "make this screen easier/better" mission, give all three the screenshots and the component files, then synthesize their proposals (agreements first) before building. Their Oct 30 reviews of the welcome screen and quest editor are in `docs/ux/`.


- **Look:** RPG / storybook. Parchment, gold, dark forest green, `font-display` serif headings. Nothing that feels like Windows (no grey title bars, no grip dots). Use the `--t-*` CSS variables; there are 8 palettes (`src/lib/palettes.ts`). New interactive elements get the matching custom cursor.
- **Motivating, never shaming:** no "0/3" counters; celebrate what's done and what's next.
- **Settings in context (universal design decision, Oct 30):** a screen's gear doesn't open a menu; it turns on editing right on that screen. Anything that isn't part of the screen itself (when it opens, confetti, …) sits in a panel **above** it. On the screen, **every component gets a ✎ beside it** (by the text itself, never dropped below it) that opens its finer options; its **hide button sits in the component's top-right corner**; and **order changes by dragging the item itself** (dragging is assumed: no drag bars, no grip icons, never ↑/↓ arrows; use dnd-kit with a small distance/delay activation so taps still work). Things drawn in a scene get their ✎ right beside them (the castle's sits at its upper right). The welcome screen is the reference build (`src/components/xp/WelcomeArrange.tsx`); the quest editor (gear → `tasks/EditorArrange.tsx`, a draggable "Under More" line) and the quest ⋯ menu (gear → drag rows, eye on the right) follow it. **Every screen gets this** (owner, Oct 30: "screen ordering and display settings should show in context"): Today is done (`TodayArrange`); boards, calendar, Insights and the rest are still to do. The same controls also stay listed in Settings, where fine settings fold away behind a caret, closed by default. Settings can be offered as "default for all accounts".
- **Use screen space wisely (universal):** compact by default: tight spacing, 32px controls inside trays and panels (44px only for primary actions), short labels, one line where one line will do. Show what's useful straight away (e.g. upcoming chores) instead of folding it; fold only the rarely needed.
- **Everything that opens, slides (universal):** every drawer, tray, fold and popup animates open *and* closed. Use the app's drawer (`.drawer-body[data-open]` > `.drawer-inner`, as in Additional Quests, Daily Habits and Due soon) for trays, `reveal`/`card-pop-in` for popups. A bar that opens a tray is one big button: the whole bar opens it; its extra chips (Edit, reach, gear) sit on it as siblings, never as the only tap target. Gears on headers show on hover (faint on touch screens).
- **Scales (importance, urgency, difficulty, energy…):** use `LevelScales` (`components/ui/LevelScales.tsx`): rows of icons or vertical bars with the icon at each bar's foot, toggled beside the group.
- **Edit buttons (✎):** small (24px), no border, pencil in the soft gold ink of the surroundings; a light gold wash when open.
- **Checkboxes:** use the gilded `GoldCheck` (`WelcomeArrange.tsx`), not plain browser checkboxes, in new work.
- **Menus:** every ⋯ menu also opens on right-click; menus close on outside clicks except on the feedback box (`[data-feedback-root]`). Opening feedback must never change anything else on screen.
- **Editors:** Ctrl/⌘+Enter and Ctrl/⌘+S save any dialog; × at top right; the quest editor autosaves when editing.
- **The Great Toucan Spirit** (`components/toucan/`): a wise, compassionate guide. Never call it a "coach" or use clinical terms. Modes: simple, lite, full.
- **Phones matter:** the owner uses an iPhone a lot. The page must not resize when the keyboard opens.
- **React compiler lint:** no `Date.now()`/`Math.random()` in render (use `freshKey()` in `lib/quest-drafts.ts` or handlers); no components defined inside components; `setState` in an effect needs an eslint-disable with a reason; no Tailwind `translate-*` on elements whose keyframes animate `transform`.

---

## 6. Recently shipped

Newest first. Keep about 10 lines; `git log origin/main` is the full record.

- Oct 30 (night): Today arranges in place: a gear at Today's top right (hover; faint on phones) opens "Arrange Today" (`components/today/TodayArrange.tsx`, `lib/today-layout.ts`): every part drags, the eye hides it, hidden parts wait as + chips, Reset. The board's parts (Due soon, Today's Quests, Daily Habits, Additional Quests) move as a group and keep their own order (the old `today-section-order` is carried over; dragging closed sections still works). Quest cards: the early bonus is a small "+N XP early" pill (no bird).
- Oct 30 (night): Arrange in context, round 2: the quest editor's gear arranges it in place (`EditorArrange.tsx`: drag parts, the eye tucks one under More, drag the "Under More" line, Reset); the quest ⋯ menu's gear turns the menu itself into a draggable list with an eye on each row (no popup).
- Oct 30 (night): Laundry run (`components/habits/LaundryRun.tsx`): Laundry panel › "🧺 Start a load" steps through Load (reminders: house towels, bed sheets, gently used clothes), Wash, Dry, Fold; each has a gilded dial timer (start/pause, ±5 min, glows and buzzes when done; minutes remembered); moving on starts the next timer; Fold records the load. Kept in localStorage `laundry-run`, so a timer survives closing the app. The cleaning tray opens on Laundry on laundry days or mid-load. "✓ Did one" still counts a load without the run.
- Oct 30 (night): Toucan notes (when he isn't on screen) now come from the bird: he flies in and speaks from a bubble beside him (`NudgeNote` in `ToucanGuide.tsx`, `.nudge-bird`/`.nudge-bubble`). Freeing him from the cage in the menu: he hops out and lands beside the cage over the menu drawer (z 48), says thanks, and goes back to normal layering when you move on (`over` in `PerchedOwl.tsx`).
- Oct 30 (night): Signing in returns you to the screen you were last on (`components/ui/LastScreen.tsx` keeps a `last-path` cookie; the sign-in in `app/page.tsx` reads it). Opening the app fresh still lands on Today for the welcome screen. A reward has a quest sequence (reward editor › "Add quests before or after"): quests before it (`prereq_title` + `rewards.prereq_more`) and after it (`rewards.followups`, migrations 0070–0071); accepting creates them chained by `locked_by_task_id`, the reward quest in its place. Steps tray redesigned (`StepsTray.tsx`): gilded progress bar, folding groups with progress rings (the one with your next step opens), a Next marker, gold checks; slides open and closed. Welcome Due soon uses compact cards (narrower portrait and XP columns so titles get room). Hover brightening toned down (buttons 1.06, tray bars 1.03, softer card glow).
- Oct 30 (evening): Logged events keep their line breaks (cap 400; `tidyNote` in `lib/data/energy.ts`); Insights › Events shows them whole and edits them in a box (Shift+Enter for a new line); check-in chips show the first line. Feedback pictures upload in the background (`lib/feedback-uploads.ts`, 3 tries, then Retry): sending never waits, a late picture joins the saved note via `/api/feedback/attach`; a small closable bar bottom right shows progress (`UploadBar` in `FeedbackDock.tsx`). Before this, sending mid-upload dropped the picture (the Oct 29 event note).
- Oct 30 (evening): "Vitamins before 12pm" added to the owner's Right Effort (Factors of sleep) and to the defaults.
- Oct 30 (evening): Welcome toucan: right-click (or tap) opens his menu, now with Toucan settings; drag him anywhere (remembered, `welcome-toucan-at`); his bubble's ‹ › step through what he could ask (`TOUCAN_PROMPTS` in `lib/welcome.ts`) and its ⋯ gives thumbs (👍 asks it first, 👎 never again; `toucan-prompt-votes` in localStorage). Toucan "Not now…": 15 min, 30 min, 1 hour, Other… (2 hrs, 3 hrs, this evening, tomorrow, or a time); closing Other goes back to the choices. Settings cage no longer says "Resting".
- Oct 30 (evening): Habits polish: gilded habit cards on a green velvet tray, gilded check circles; the house cleaning habit reads "…: 🍳 Kitchen" and its title opens the mess check-in tray (slides; priority list, then Spaces/Laundry/Chores; opens on Spaces when fewer than 2 spaces); spaces and laundry are compact sliders (clean end sparkles); chores can repeat on a weekday (`weekday` in `lib/cleaning.ts`; the owner's trash & recycling is set to Tuesdays); Coming up chores show by default; editors say Close, not Done (chores, spaces, quest editor, sequence, power-ups); whole check-in UI tighter.
- Oct 30 (evening): Due soon on Today rebuilt as a real drawer like Additional Quests (the whole bar opens it, the tray slides open and closed, Edit and the reach sit on the bar); the welcome screen's Due soon tray slides too and its reach picker opens over everything (no longer cut off); the Daily Habits gear shows on hover (faint on phones).
- Oct 30 (evening): Quest editor: a Due chip on the surface with Today / Tomorrow / This Friday / In a week and a date picker (due row left Scheduling); an Early bonus chip once it has a due date (Automatic, None, or your own XP for finishing any time before it's due; `tasks.early_bonus_xp`, migration 0069, `earlyBirdBonus` in `lib/next-action.ts`); Tiny task in one place under the portrait (🌱 header toggle gone); "Add steps"; "More" fold with a one-line list of what's in it; footer: no Cancel when creating (× closes), Already done quietly on the left, no "✓ Saved", Delete behind ⋯ (right-click too).
- Oct 30 (evening): Level bars are the default scale style everywhere, quest cards included (icon once + a small 5-step bar; `IconRun` in `TaskRow.tsx`); welcome arranging has one Done (bottom), hidden parts as + chips, no doubled Top priority label, "Today's intention" as that part's name, XP and coins on one line.
- Oct 30 (evening): Top priority keeps your line breaks (cap 400), wraps long words/links, shows one ◆ item per line in a parchment box that taps to edit, ✎ by its label, "When there's space" list for the others (three-team synthesis in `docs/ux/2026-10-30-top-priority.md`); the welcome screen's bottom button saves priority, intention and check-in together (no per-field Save); check-in −/+ beside each slider; Due soon chevron points down.
- Oct 30 (late afternoon): Welcome screen "Plan my day" part removed (stored orders drop it); the toucan lands on every visit, not just welcome back, and tapping him offers Plan my day, Talk to me, a wise saying, or changing what he asks first (`welcomeToucanAsk`, `toucanAsk()` in `lib/welcome.ts`); the wise line's thumbs sit in a right-hand column so they never drop below it on phones.
- Oct 30 (late afternoon): Treasure Chest (drag to reorder, compact cards, quiet coin count, "Reward cost", default 3 coins, prerequisite and bonus behind buttons, new rewards drop in); habits repeating every week/month/year or every N days/weeks/months/years from a start date (migration 0068, `lib/habit-repeat.ts`; up until done or skipped), Not today list, snooze until tomorrow; generated spire castle (Generate castle); greeting ✎ at its upper right with true-layout editing; only the bottom-right button leaves the welcome screen; Last night rebuilt (`NightFields.tsx`: time tokens + parchment time dial, Wheel of Time, Factors of sleep chips); Daily Habits gear top right with + options; feedback Tab → XP (arrows) → Submit.
- Oct 30 (afternoon): Welcome screen per the in-context design rule (panel above for when it opens and confetti; ✎ by every part; hide top-right; drag bars; castle ✎ by the castle); tap the greeting to write your own (asks to keep it in rotation and retire the original); Complete check-in bottom right; Snooze spreads its times in a line (15 min, 30 min, 1 hr, Other… → 2 hrs, 3 hrs, this evening, tomorrow, minutes); top priority box grows, "Other priorities" opens a 65% box with "Secondary Priorities"; check-in folds with a caret; quiet thumbs beside the wise line; one wise-lines list with a gold "+ My own words"; editable questions; smaller Due soon pill with its reach on it; fog on phone hide and on return so Today never shows before the mist.
- Oct 30: Mess check-in under the "20 mins of house cleaning" habit (`components/habits/CleaningCheckIn.tsx`, `lib/cleaning.ts`, stored in `life_wheel.cleaning`): today's 20-min pick from the messiest space, a due laundry load or a due chore; Spaces (one-tap rating, 5 styles also in Settings › Mess check-in, custom spaces, optional drift), Laundry bin fill with next-load prediction, Chore deck with snooze (day, week, custom). Bring from home: a gilded button on the backpack's right opens a side-drawer packing list (place name, tick-offs, clear packed or keep for next time). Stored in `life_wheel.inventory.bring`; the owner's list starts with Coconut milk and Energy tinctures for Natick until first saved (`withOwnerBringSeed` in `lib/inventory.ts`).
- Oct 30: Welcome screen settings in context: its gear arranges the screen in place (each part gets show/hide, up/down and its own options where it sits; a strip on top for when it opens, the castle and confetti; greetings under the heading). `src/components/xp/WelcomeArrange.tsx`; the wise-line and greeting lists moved to `settings/LineLists.tsx`. Settings › Welcome Screen still has the same controls.
- Oct 30: AR class homework now stands for the Mastering Facilitation board (follows the current week's quest and its due date; tapping "Now: Week …" on the card opens that board).
- Oct 30: AR class (Mastering Facilitation) due dates moved back one week, old values and undo in `docs/data-changes/2026-10-30-mastering-facilitation-due-dates.md`.
- Oct 30: Welcome screen out of the mist (fairytale castle with 4 designs to pick in Settings › Welcome Screen › The castle, birds, toucan lands on welcome back, single greetings list, fog hides Today from first paint, dive into the forest on Continue; signpost removed); Due soon look-ahead setting and ranking (due next first, past due last; reach picked from the chip on its header, kept in the `due-soon-hours` cookie, `src/lib/due-soon.ts`); on the welcome screen Due soon is a gilded button that opens a drawer of real quest cards (`DueSoonDrawer`; the screen drops to z-49 while it's open so a card's editor shows over it); folded Settings groups show their value; stand-in quests keep their own due date; Check in button icons.
- Oct 29: Feedback batches (check-in card, invite wording themes, life wheel readout, Insights XP columns and pinch zoom); dreams cloud on boards; invite popup; toucan "Not now" snoozes; welcome screen top priority.
- Oct 28: Gear shortcuts and settings popups; sleep and wake log on the Wheel of Time; toucan-started feedback builds; toucan creates entries on command.
- Oct 27: Daily check-in returns until closed; quest editor folds (steps, scheduling, Advanced); board chip and picker.
- Oct 26: Tiny tasks; keyboard resize fix; feedback audit (`/mnt/project-files/feedback-audit/` in the Claude project).

Older history: `docs/archive/HANDOFF-2026-10-21.md`.

---

## Keeping this file current

Whoever ships to `main` updates this file:
1. Bump "Last updated" with the date and the new `main` short SHA.
2. Move finished work from section 1 to section 6, add new asks to section 1 in priority order, and note what each is waiting on.
3. Refresh the pending feedback count with the query in section 3.
4. Keep it short. Detail belongs in commit messages and code; this file is the map.
