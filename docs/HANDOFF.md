# Goal Dashboard: living handoff

**Any Claude Code session, on any account, starts here.** This file is the map: the standing rules, how to ship, and where everything else lives. It is loaded into every session, so **keep it short** (see "Keeping this file current"). If it disagrees with `git log`, the log wins, and you fix this file.

- **Last updated:** 2026-11-16 (handoff split into linked docs; latest shipped work is the top entry of `docs/SHIPPED.md`). `main` @ see `git log`.
- **Live app:** https://goal-dashboard-kappa.vercel.app (the owner does NOT have tinyquest.win; never send links on it)
- **Pending in-app feedback:** the database is the full list (query in section 3; by screen in `docs/FEEDBACK-BY-SCREEN.md`). 316 open on Nov 12; many are already built but were never marked: check the code and `docs/SHIPPED.md` before building one again, and mark it. If the Supabase connector is missing, ask the owner to connect it (claude.ai Settings › Connectors).

## 0. What to work on, and what to open when

Read these only when you need them. Don't load them all at the start.

| Open | When |
|---|---|
| `docs/PRIORITIES.md` | Choosing what to build: the owner's top dev priorities (Nov 11), the ranked table, his "Next up" queue, the "Needs a real-iPhone look" list. Some items have shipped since; check `docs/SHIPPED.md` first. |
| `docs/BUILD-PLAN.md` | **Lighter-model sessions work from this, top to bottom.** Next there: task 9 (language window), then 11–16. |
| `docs/REPEAT-ASKS.md` | Before work that touches an ask the owner has made 3+ times (see `CLAUDE.md`). |
| `docs/FEEDBACK-BY-SCREEN.md` | Before changing any screen: its open notes and the `universal` ones (see `CLAUDE.md`). |
| `docs/FEEDBACK-OPEN.md`, `docs/HIGH-EFFORT.md` | The owner's open notes by area (to Nov 5); bigger asks that need a long, high-effort session. |
| `docs/WAITING.md` | Before touching anything in section 0a below, and for parked ideas and things to remind the owner of. |
| `docs/SHIPPED.md` | To learn how a feature was built, which files hold it, or whether an ask is already done. Search it (`grep -n`), don't read it whole. |
| `docs/ui-check.md` | Running or extending the UI check. |
| `docs/WIP-ux-synthesis.md`, `docs/ux/` | The UX teams' reviews and what's left from them. |

The owner's Claude project also keeps a priorities list by model (Nov 16) in its project files: `planning/2026-11-16-dev-priorities-by-model.md` (not in this repo).

## 0a. Waiting on the owner: don't build these until he says

Details, wording he has chosen, links and branches are in `docs/WAITING.md`. Read the topic's entry there before touching it. When something new waits on him (a design review, a pick), add it there with its branch, review page link and date, and add its name to this list.

- `review/prioritize-bars` (taller Prioritize bars): built Nov 14, not UI-checked or reviewed.
- `review/walkthrough-v2` (the rebuilt walkthrough): built Nov 15, review page sent, waiting on his OK or notes.
- Import card screen: his pick of mockup A, B or C.
- Daily coursework as a habit: options A–D sent Nov 11.
- Habits in the daily plan, part 2: not built yet (plan in WAITING).
- Merging Daily Habits and Today's Quests on Today: brainstorm with him first.
- The email to Daniel about his Champion title: needs his OK and wording.
- Waiting on his iPhone: a list of things cloud sessions can't check (in `docs/WAITING.md` and `docs/PRIORITIES.md`).
- When weekly / monthly / yearly reviews are built: remind him of the lines he saved (in `docs/WAITING.md`).

## 1. Owner's working preferences

**"Brainstorm" means design ideas reported back for the owner's approval before anything is built** (owner, Nov 6: "this should be remembered across all my app-building initiatives"); **new UI reuses the app's existing parts** (the quest editor's `.qe-fact` pills, `.qe-fact-panel`, XP bar, Due/Time picks, `LevelScales`/`IconScale`, the `/design` glyphs) before inventing new controls (owner, Nov 6), and uses the owner's exact words for options; short progress notes after each step; decisions asked in plain messages (no decision cards, no making them go to other screens); "make not overwhelming the user a design priority (and also not hindering the user with too many button walls) — balance is key". Personal task context may be in this file (owner OK), but never secrets: passwords, keys, ID numbers, medical or relationship notes. The repo is public: private files go in the `attachments` table, never in git.

<<<<<<< Updated upstream
- **Waiting on the owner's design review** (branch · review page · date): `review/prioritize-bars` (taller Prioritize bars, owner's artifact comment; unchecked, not shipped) · Nov 14. `review/walkthrough-v2` (the rebuilt walkthrough: welcome + name, character painter, starter quests Explore the realm +15 XP/1 coin and Create your first quest +25 XP/2 coins, Today's parts, three looks in Settings › Help; ui-check tour/today 0 errors) · https://claude.ai/artifact/DCG4eCaQiT1DugUrPqU3VR · Nov 15. **Time wheels look:** owner chose the current design (Nov 15): no change. (Owner, Nov 14 evening: "Let's keep going, no need to confirm": for the rest of that session batches merge after the UI check, each still with a review page he can look at.)
- **Walkthrough redesign (on hold, owner Nov 14)**: workshop page https://claude.ai/artifact/HRreCiT4av1adpEfKhUCD9 (looks A / B / Blend 2 / Blend 3, the toucan floating at the card's corner liked; flow: name → character → two starter quests "Explore the realm" and "Create your first quest"; Snooze + "Skip this step" lower left). **Chosen:** his first words: "Ah, a new traveller at the forest's edge — welcome! I'm the Great Toucan Spirit, and I'll be your guide here. This is a magical place where we turn your most important goals into quests to conquer so you can lead your most fulfilling and adventurous life. Before we set forth: by what name shall I call you?" (reworded Nov 15). **Look (owner, Nov 15 evening, replaces the earlier pick):** "A with the narrator" (Original A's teal spirit bubble, gold rim, no tail, the toucan floating at its top-left corner) is the default; Original A and Blend 3 are offered as backups in Settings. **Wording chosen (owner, Nov 15 night):** character step: "This is where you make your character, your persona in this game of real-life quests. Be a calm monk, a brave warrior, a skilled night elf, or anything else that calls to you. There's no wrong choice, and you can change it any time. Describe your character below, and watch them come to life." (the painter's description field sits on the same card, under these words). First quest: "This is where you add your first quest. A quest can be big or small, and should be something that matters to you. I recommend starting with something you can finish today, so you can begin with a victory under your belt. You can add additional quests at any time." **Also show the Today screen's parts** (owner): Today's Quests = today's priorities (keep it to as few as you can realistically finish, most or all, by the end of the day); Additional Quests = ones you'd like to do that aren't needed today; Victories Today. Starter rewards set to the proposed +15 XP/1 coin and +25 XP/2 coins. **Built Nov 15 on `review/walkthrough-v2`, waiting on his review.**

- **Make the app load faster**: shipped Nov 12 (see Recently shipped). Needs the owner's iPhone look (Home Screen app): opening should show the last screen at once.
- **Habit editor aligned with the quest editor**: owner picked B and reviewed a draft (Nov 14); shipped Nov 14 (see Recently shipped). Left from B: the editor's gear arranges it in place (it still opens Settings).
- **Habits in the daily plan** (owner, Nov 14; picked from a brainstorm: lanes At a time / Sometime today / Rest today, choose habits in the morning and evening like quests, core habits that look different; hold off on bundling and habits of the week). **Part 1 shipped Nov 14** (see Recently shipped). **Part 2, not built yet:** when planning tomorrow (and today), place the chosen habits on the calendar along with the quests and around the non-negotiables (lunch etc.; the auto-scheduler's Habits section and day holds `h:<id>` are the start: list only chosen + core habits there), a "by when" time for a habit that floats (like Gym's window), and the toucan offering a habit when you have a gap or just finished a quest, **with an on/off switch in Toucan Spirit settings**.
- **Daily coursework as a habit** (brainstorm sent Nov 11, waiting): likely the Mastering Facilitation course. Options offered: A a daily habit "Facilitation practice 📘" with sub-habits (10 min of the course, one line of notes, where to start tomorrow) and a 2-minute Morning routine stone; B a "📘 This week's lesson" pill on that habit card (like the 🎧 pill) opening the course board's next step; C growth edges as lantern focusing questions plus a journal prompt; D the owner names 1–3 growth edges first. Don't build until the owner picks.
- **Auto-scheduler leftovers** (from the Nov 6 UX review): counts disagree (header 9 vs its sections; Habits "5" vs "✨ All 4"), habit rows show no portrait and only "30m", Folders should number soonest first.
- **Calendar default hour, sideways swipe, one auto-schedule button**: shipped Nov 12 (see Recently shipped); needs the owner's iPhone look.
- **Waiting on the owner's iPhone** (cloud sessions can't check these): Due pill date picking and Find a time in the quest editor; hold-and-drag reordering in packing lists; the /import pills; long-press on calendar cards and sideways swipe on the hours; plus the "Needs a real-iPhone look" list at the end of section 0.

## 1. Top priorities

Ranked. Take the first item that isn't blocked on the owner. When you finish one, move it to "Recently shipped" and re-rank.

| # | Work | State | Next step |
|---|---|---|---|
| 0000 | **docs/FEEDBACK-OPEN.md** (the owner's open notes, by area) | Ready | Build a group at a time; repeat asks first. |
| 000 | **docs/REPEAT-ASKS.md, open rows** (owner, Nov 2: do repeated asks comprehensively) | Ready | Work the open rows there first, highest count first: seamless calendar scroll (12), feedback tool lag (14), habit editor (15). |
| 00 | **Plan my day follow-ups** (owner's notes, Nov 2) | Ready | Shipped (below). Left: mobile long-press on the Today's Quests header for a menu (the header's long press is the section drag on iPhone, so ✨ shows while the section is open instead); habits placed as real calendar blocks (now only room kept, 🌿); "🎧 something to listen to" as an icon in the planner to pick today's learning video (note); the owner's ask to plan Alliance Jiu Jitsu soon and Shaolin within 45 days (create as quests with plan_by; needs DB or the app); Martin-care quests as follow-ups when scheduling time with Dad; the morning exercise blocks on the owner's calendar go once the Gym habit holds the time. |
| 0 | **Import scheduling: follow-ups** | Ready | Shipped Nov 1 (below). Left: a one-tap "Breakfast today" on Today/check-in only matters if breakfast is turned off; essentials' ideal times aren't editable yet (only ranges and lengths, in Auto-schedule › Daily essentials); accepted placements go straight on the calendar (no separate tentative state in the database). |
| 1 | **Arrange in context on every screen** (owner ask, Oct 30) | In progress | Welcome, quest editor, quest menu, Today, Insights, a board and the calendar done (`ui/ScreenArrange.tsx` + `lib/screen-layout.ts` for any new screen). Next: boards list, Treasure Chest, Settings pages, plan. |
| 1b | **Finish the UX synthesis** (welcome screen polish, quest editor) | In progress | Follow `docs/WIP-ux-synthesis.md` "Still to do". Reviews in `docs/ux/`. Left: consistent capitalization, pinned editor footer. The UX teams can now read real click timings from `ui_clicks`. |
| 2 | **Owner's queue (Nov 1)** | In progress | Work through "Next up, in order" right below this table, top to bottom. |
| 1c | **UI check: keep it covering everything** (owner, Nov 2: "so I don't find a bug at every screen") | Ongoing | `npm run ui-check` before every push (see CLAUDE.md, `docs/ui-check.md`). Findings log with status: `/mnt/project-files/ui-audit/2026-11-02-findings.md` (Claude project files). Next: flows for boards (a board's arrange mode), Treasure Chest editors, the quest editor's folds, the toucan chat, the feedback box itself; a "layout viewport shrinks" keyboard mode (Chrome on iPhone) in `fakeKeyboard`. |
| 2b | **Smoothness audit follow-ups** | Ready | Audit method: in the signed-in browser pane, a layout-shift + DOM observer script opens every toggle and fakes the keyboard by overriding `visualViewport.height` (Oct 31 night). Left: a real-iPhone keyboard pass (the simulation can't show iOS panning); (Insights' Last night and the remaining exits were done Nov 1.) |
| 3 | **Toucan-started feedback builds** | Owner action | Built Oct 28 (`src/lib/data/feedback-run.ts`). The owner must generate the scheduled task's API token and paste it in Settings › App feedback. Then test one real run ("implement my feedback"). |

### Next up, in order (owner's queue as of Nov 1 evening)

Each item is the owner's own ask. Take them top to bottom; mark done here and move to Recently shipped.

1. **Check two one-time cleanups ran** (`src/lib/data/cleanups.ts`, run from AppShell's `after()` on the owner's next page load, each recorded in `profiles.life_wheel.cleanups`):
   - `sleep-quality-dupes-2026-11-01`: **ran Nov 1 (verified: 1 row left)**. It should leave **1** 'Sleep quality' row in `check_ins` for 2026-11-01 (there were 558). Check: `select count(*) from check_ins where owner_id='42ed6196-bfb0-474d-96a9-1a6cd6807b8b' and metric='Sleep quality' and created_at::date='2026-11-01';`
   - `forms-on-cards-2026-11-01`: puts the uploaded PDFs on import cards "Claim unclaimed MA money from the Treasurer" (1 file) and "Apply for subway performer permit" (blank + filled). Check `select title, attachments from import_cards where id in ('13b3a450-7045-40d6-b27a-0298aa225349','d23f2e67-fd71-4301-b42c-a36fe5d0aef7');`
   - The temporary upload function `tmp_handoff_attachment` is closed (Nov 1: replaced by a stub that always raises, execute revoked from everyone; the real password is refused). Dropping it is optional tidying: `drop function if exists public.tmp_handoff_attachment(text,text,text,text);` (needs a connector approval).
2. **Page-change lag, the rest:** Today, Insights and the calendar (Google events alongside the quests) now load in one wave. Plan, matrix, the Guild Hall (/feed) and a friend's page load in one wave too (Nov 2; Treasure Chest, Settings and /import already did). Left: measure on the live app; if a screen still lags, look inside its components: put independent queries in one `Promise.all`, stream slow extras with `Suspense`. Measure with a signed-in session if possible.
3. **Queued in-app feedback notes** (40 on Nov 1; query in section 3). Batch 1 shipped Nov 1 (see Recently shipped). Marked shipped (verified): 7db714b0, 1312c8cf, 5bfca9fc, a0d361cd, c028825d, 49ebadea, 1cab0c69, d78e903f, 5e3b3c36, 87af3830, 69d2f921, c39a347a, 9ea4eb26, 86769211, c5fcedd8, 0cb3e071, 9a91631f (id prefixes). Still to do, by note: XP −/+ left and right of the bar with the total at its right (d2f54e0b); no wasted line break in today's wise words (99d73687); "Choose today's quests" uses the regular quest cards (b75f0442); swipe a check-in section left to snooze it a day (8baeafef); switching quest type keeps title and details (db9d9f75); quest done: celebration only after pressing Done (0aff9fa6); edited XP shows in the celebration (38b70e05); long-press/right-click a victory to edit it (068109c7); toucan menu cut off + a gear (top right) and × in his menu, settings as an in-context popup from the welcome screen, chevron under him (ed9b805c, af4647d3); keyboard: black band behind it on close (ed9b805c); 3 visible re-layouts after submitting feedback (eb0f2695); toucan respond field lower (25% overlap), centred, coloured when idle and off-white while typing (07f1e90d); bubble shows × to close it, ✎ only on long-press/right-click (aca19398); type a time by tapping the time field (0be9b53e); a Submit button bottom right of the sleep check-in (dd8690bf); tapping a pill in edit mode edits it (ba79a598); folded sleep check-in previews what was entered (cb22d80e); events: split by commas/semicolons + report other smooth input ideas to the owner (ea3e02ed); smiley-face option for emotional check-in metrics, toggled by long-press/right-click on the name (8b08e46d); the wise-saying "what would make it better" field is covered by the keyboard (f7f8033e); long-press a portrait image to delete it (92ce2ca5). One note ("Wtf is this?", d91dcff1) had only a screenshot at 390×347 (keyboard up): likely the keyboard band; ask the owner if unclear.
4. ~~To buy cards: per-item reward~~ shipped Nov 1.
5. **Online learning videos list**: 🎧 pill shipped Nov 1 (under a walk/drive/dog habit still to do, e.g. "Chester Care 🐶"; `LISTEN_HABIT` in `DailyHabits.tsx`, board found by title /learning videos|listen/). Later maybe: the calendar marks listening windows (commutes, dog walks) and suggests a video; dog walks should show on the calendar (owner, Nov 1). (Board "Online learning videos" made Nov 1, id ef1193ff-f30e-402e-bda0-758b7bc1859a, with the Facing Fragility quest off Today; links in quest descriptions are clickable now). Left: the reminder, once the owner picks one: a list (e.g. a board or a Settings › Lists entry) of videos for walks and car rides, seeded with https://spiraljourneyworkthatreconnects.org/facing-fragility/ ("Facing Fragility", Spiral Journey / Work That Reconnects). The owner needs reminding it exists: offer light options in a plain message and let them pick (e.g. the toucan mentions it when a walk/drive habit is checked, a weekly nudge, a welcome-screen pill, a + sheet shortcut). Don't overwhelm; no button walls.
6. ~~Welcome-screen habit pills: Learn a language~~ shipped Nov 1 (`xp/LearnLanguage.tsx`, `lib/languages.ts`, `translatePhraseAction`). Next pill ideas welcome; add to `HABIT_PILLS`.
7. **Quest Game note items** (owner picked these):
   - ~~"How to support me" on the profile~~ shipped Nov 1 (a "💛 How to support me" button in the Guild Hall /feed that opens the note in place, `SupportButton` in `settings/SupportNote.tsx`; the owner wants it in the party area, not Settings, `life_wheel.support`, shown on /friends/<id>).
   - Zoom in/out on boards with light animation; a single sub-quest fills the width.
   - Longer, smoother victory sparkles; the quest title fully visible on the victory screen. (Checked Nov 1: the title already wraps in full, `QuestComplete.tsx` h2 `break-words`; sparkles linger 6.5s after the bar fills. Ask the owner what still feels short before changing.)
   - A simpler XP burst for habits, rites and mini-quests.
   - A shimmering border on reward cards. (Already there: `.reward-shimmer` on Treasure Chest cards, two passes on load; maybe the owner wants it continuous or on the border only. Ask.)
   - Check the "+ board" chip on a Martin board quest (looks wrong; investigate).
8. ~~Rituals of connection tracking~~ shipped Nov 1 (owner, Nov 1): each ritual (e.g. couples covenant, wheel of consent) shows how long since it was last done and a log of when; also in Insights like Streaks. Light: no button walls. Plan: rituals as rites with `kind = 'ritual'` (kept off the daily habit list), an Insights section "Rituals of connection" with days-since, a "Did it ✓" and the history.
9. **Message anyone in the party** (owner, Nov 1, later): the recipient gets an email notification with the whole message in it.
10. **Calendar listening windows** (owner, Nov 1, later): the calendar spots commutes/dog walks and suggests a video from the learning list; dog walks show on the calendar.
11. Then the rest of section 1 (arrange in context on remaining screens, UX synthesis polish).

**Owner's working preferences:** **"Brainstorm" means design ideas reported back for the owner's approval before anything is built** (owner, Nov 6: "this should be remembered across all my app-building initiatives"); **new UI reuses the app's existing parts** (the quest editor's `.qe-fact` pills, `.qe-fact-panel`, XP bar, Due/Time picks, `LevelScales`/`IconScale`, the `/design` glyphs) before inventing new controls (owner, Nov 6), and uses the owner's exact words for options; short progress notes after each step; decisions asked in plain messages (no decision cards, no making them go to other screens); "make not overwhelming the user a design priority (and also not hindering the user with too many button walls) — balance is key". Personal task context may be in this file (owner OK), but never secrets: passwords, keys, ID numbers, medical or relationship notes. The repo is public: private files go in the `attachments` table, never in git.

**Open questions for the owner:** none (the Oct 22 notes were settled by the owner, Oct 31).
=======
**Open questions for the owner:** none.
>>>>>>> Stashed changes

**Known not possible:** reordering the iPhone photo menu (library, camera, files, Drive). iOS draws it, not the app.

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
- Migrations: `supabase/migrations/NNNN_*.sql`. Latest is `0089_event_faces.sql`. All have been run on production. Number new ones after the latest on `main`, and apply them before or with the deploy.
- `profiles.life_wheel` (jsonb) is a catch-all for per-profile extras, read through `readExtras()` in `actions.ts`. **Always merge into it, never overwrite it.**
- `app_defaults` table holds "default for all accounts" settings plus server-only `secret.*` keys (never shown as settings).

---

## 3. How to ship (the loop)

**Design review first (owner, Nov 14, replaces "ship straight to the live app"):** anything that changes what's on screen waits on a `review/<topic>` branch until the owner has seen its screenshots on a review page and said OK; then merge to `main`. Steps in `CLAUDE.md` › "Design review before shipping". Changes with nothing visible still ship straight. When the owner says "update the site", build the pending feedback, then send it for review.

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
   **By screen:** every note has `screens` (text[]; keys in `src/lib/feedback-screens.ts`, `universal` = app-wide). Before changing a screen add `and screens && array['<key>','universal']`; tag untagged notes as you read them (`and screens is null`). Details: `docs/FEEDBACK-BY-SCREEN.md`.
   The admin page `/feedback-review` shows the same queue in the app. Screenshots attached to notes are often unreachable from a cloud container; work from the words and say so.
3. **Build.** `npx tsc --noEmit -p .`, `npx eslint <files you touched>`, then `npx next build --webpack`. A few server pages have pre-existing `Date.now()` lint errors; keep only your own files clean.
4. **Run the UI check** (required before every push that changes what's on screen): `npm run ui-check`, then read `ui-check-out/report.md` and the screenshots of what you touched. Fix every error on your screens; add any new screen or section to `scripts/ui-check/flows.mjs`. See `docs/ui-check.md`. For a one-off look at a single state, the old way still works:
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=x AUTH_SECRET=devsecretdevsecretdevsecret npx next dev --webpack -p 3100
   node scripts/shot.mjs <url> <out.png> <width> <height> <fullPage 0|1> '<actions>'
   ```
5. **Ship.** Commit to `main` and push. Vercel deploys in a few minutes.
6. **Mark the feedback shipped:** `update journal_entries set auto_shipped_at = now() where id in (...)`.
7. **Log it:** add an entry at the top of `docs/SHIPPED.md`, and update this file only if a rule, a pointer or section 0a changed (see "Keeping this file current"), in the same push or right after.
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
- **Every change animates (universal, owner Oct 31: "like all transitions in the entire app"):** things that appear in a list (a widened Due soon, a new card, a new row) slide/fade in (`.due-in`, `reveal`), things that leave fade out; nothing pops in or vanishes abruptly.
- **No unnecessary popups (universal, owner Nov 1):** choices that fit in a line or two open inline, in place (a Fold under the button), never as a popup or a separate screen. Popups are only for long content worth keeping open or saving (e.g. the language sheet, the full snooze picker's "Other…"). Apply this whenever you touch a screen.
- **Everything that opens, slides (universal):** every drawer, tray, fold and popup animates open *and* closed. Use the app's drawer (`.drawer-body[data-open]` > `.drawer-inner`, as in Additional Quests, Daily Habits and Due soon) for trays, `reveal`/`card-pop-in` for popups. A bar that opens a tray is one big button: the whole bar opens it; its extra chips (Edit, reach, gear) sit on it as siblings, never as the only tap target. Gears on headers show on hover (faint on touch screens).
- **Icons (universal, owner Nov 14: "why are you shipping colored icons still?"):** flat, single-colour line icons in the surrounding ink or gold, never colour emoji (📅 ✨ 🖼 📷 🎨 …) or coloured circles behind ✓/↻, in anything new or touched. Faces and scales use one ink colour unless the owner says otherwise. Known leftovers to convert: the inventory item sheet (✨ Custom portrait, 🖼 Painted before, 📷, 🎨), the item menu's red ↻ / green ✓ circles, the five coloured event faces (`ui/FaceRating.tsx`), Prioritize's 📅.
- **Scales (importance, urgency, difficulty, energy…):** use `LevelScales` (`components/ui/LevelScales.tsx`): rows of icons or vertical bars with the icon at each bar's foot, toggled beside the group.
- **Editing text in place (universal, owner Nov 5):** a field that edits words where they sit (a sub-quest's name, a % on a line, a greeting) keeps the same look while you type: no background wash, no box; at most a thin gold line under it. Use `bare-input` and no focus background.
- **Edit buttons (✎):** small (24px), no border, pencil in the soft gold ink of the surroundings; a light gold wash when open.
- **Checkboxes:** use the gilded `GoldCheck` (`WelcomeArrange.tsx`), not plain browser checkboxes, in new work.
- **Menus:** every ⋯ menu also opens on right-click; menus close on outside clicks except on the feedback box (`[data-feedback-root]`). Opening feedback must never change anything else on screen.
- **Editors:** Ctrl/⌘+Enter and Ctrl/⌘+S save any dialog; × at top right; the quest editor autosaves when editing.
- **The Great Toucan Spirit** (`components/toucan/`): a wise, compassionate guide. Never call it a "coach" or use clinical terms. Modes: simple, lite, full.
- **Phones matter:** the owner uses an iPhone a lot. The page must not resize when the keyboard opens.
- **React compiler lint:** no `Date.now()`/`Math.random()` in render (use `freshKey()` in `lib/quest-drafts.ts` or handlers); no components defined inside components; `setState` in an effect needs an eslint-disable with a reason; no Tailwind `translate-*` on elements whose keyframes animate `transform`.

---

## 6. Recently shipped

Moved to `docs/SHIPPED.md` (newest first). Add new entries there, not here.

---

## Keeping this file current

This file is read by every session, so every line here costs credits on every run. Whoever ships to `main`:
1. Adds the entry for what shipped to the top of `docs/SHIPPED.md` (not here), and bumps "Last updated" above with the date only.
2. Updates `docs/PRIORITIES.md` (finished work out, new asks in, in priority order) and `docs/WAITING.md` (what's waiting on the owner), and keeps section 0a's one-line list in step.
3. Adds to this file only what every future session must know: a new standing rule or preference from the owner, a new hard rule, a new doc to point at, a change to how to ship. One or two lines each. How a feature works belongs in `docs/SHIPPED.md` and the code.
4. If a merge brings a long entry back into this file, move it to the right doc in the same push.
