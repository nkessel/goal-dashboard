# Goal Dashboard: living handoff

**Any Claude Code session, on any account, starts here.** This file is the map: the standing rules, how to ship, and where everything else lives. It is loaded into every session, so **keep it short** (see "Keeping this file current"). If it disagrees with `git log`, the log wins, and you fix this file.

- **Last updated:** 2026-11-21 (S2: ui-check fixtures and flow `questextras`; L1: toucan small exports in `toucan/talk.ts` and `Digest.tsx`; Cal 1a: UI check server in UTC by default; When 1: `src/lib/when.ts` helpers and checks; D1 quest columns added; review branches merged; stat XP under the XP slider shipped; calendar events as quests live, XP by length; calendar quest completion fix; stat XP: new-stat field ring fixed, cleanup mockups sent; opening the app steadier: walkthrough taps, no reload after deploys, Today hydration, one startup request; Run B handoff in `docs/RUN-B-HANDOFF.md`; import card: one When pill, Flexible · Fixed; Quest Drop shipped; latest shipped work is the top entry of `docs/SHIPPED.md`). `main` @ see `git log`.
- **Live app:** https://goal-dashboard-kappa.vercel.app (the owner does NOT have tinyquest.win; never send links on it)
- **Pending in-app feedback:** the database is the full list (query in section 3; by screen in `docs/FEEDBACK-BY-SCREEN.md`). 316 open on Nov 12; many are already built but were never marked: check the code and `docs/SHIPPED.md` before building one again, and mark it. If the Supabase connector is missing, ask the owner to connect it (claude.ai Settings › Connectors).

## 0. What to work on, and what to open when

Read these only when you need them. Don't load them all at the start.

| Open | When |
|---|---|
| `docs/PRIORITIES.md` | Choosing what to build: the owner's top dev priorities (Nov 11), the ranked table, his "Next up" queue, the "Needs a real-iPhone look" list. Some items have shipped since; check `docs/SHIPPED.md` first. |
| `docs/RUN-B-HANDOFF.md` | **Starting Run B (Sonnet) of the dev plan, on any account:** status, what's in flight, access, the prompt. The dev plans themselves are copied into `docs/plans/`. |
| `docs/BUILD-PLAN.md` | **Lighter-model sessions work from this, top to bottom.** Next there: task 9 (language window), then 11–16. |
| `docs/REPEAT-ASKS.md` | Before work that touches an ask the owner has made 3+ times (see `CLAUDE.md`). |
| `docs/FEEDBACK-BY-SCREEN.md` | Before changing any screen: its open notes and the `universal` ones (see `CLAUDE.md`). |
| `docs/FEEDBACK-OPEN.md`, `docs/HIGH-EFFORT.md` | The owner's open notes by area (to Nov 5); bigger asks that need a long, high-effort session. |
| `docs/WAITING.md` | **Its top section lists work other sessions have claimed right now: read it before starting, add your own line.** Also section 0a below, parked ideas, reminders. |
| `docs/CALENDAR-PLANNER-DESIGN.md` | Before any calendar scheduling work: causes found, one data model, build order (steps 1–10). |
| `docs/SHIPPED.md` | To learn how a feature was built, which files hold it, or whether an ask is already done. Search it (`grep -n`), don't read it whole. |
| `docs/ui-check.md` | Running or extending the UI check, and its before/after compare (`--snapshot`, `--compare`) for splits. |
| `docs/ACTIONS-SPLIT-PLAN.md` | Before splitting `src/app/actions.ts` (Run D), or adding a server action file. |
| `docs/WIP-ux-synthesis.md`, `docs/ux/` | The UX teams' reviews and what's left from them. |

The owner's Claude project also keeps a priorities list by model (Nov 16) in its project files: `planning/2026-11-16-dev-priorities-by-model.md` (not in this repo).

## 0a. Waiting on the owner: don't build these until he says

Details, wording he has chosen, links and branches are in `docs/WAITING.md`. Read the topic's entry there before touching it. When something new waits on him (a design review, a pick), add it there with its branch, review page link and date, and add its name to this list.

- Insights on one graph for every metric (owner, Nov 16): not built. The toucan offering habits: on hold (both in WAITING).
- Merging Daily Habits and Today's Quests on Today: brainstorm with him first.
- The email to Daniel about his Champion title: needs his OK and wording.
- Waiting on his iPhone: a list of things cloud sessions can't check (in `docs/WAITING.md` and `docs/PRIORITIES.md`).
- When weekly / monthly / yearly reviews are built: remind him of the lines he saved (in `docs/WAITING.md`).

## 1. Owner's working preferences

**"Brainstorm" means design ideas reported back for the owner's approval before anything is built** (owner, Nov 6: "this should be remembered across all my app-building initiatives"); **new UI reuses the app's existing parts** (the quest editor's `.qe-fact` pills, `.qe-fact-panel`, XP bar, Due/Time picks, `LevelScales`/`IconScale`, the `/design` glyphs) before inventing new controls (owner, Nov 6), and uses the owner's exact words for options; short progress notes after each step; decisions asked in plain messages (no decision cards, no making them go to other screens); **arrange work in waves by model to save credits** (owner, Nov 20): plan it in runs, each on the cheapest model that can do it well (Haiku and Sonnet for mechanical moves, docs and polish; Opus for design, deeper fixes and the bigger features), as in `docs/plans/` and `docs/RUN-B-HANDOFF.md`, and leave every run ready for another account to pick up (work pushed, `docs/WAITING.md` current); **for every design decision, link to the exact part of the mockup to look at (an `#anchor` on the review page) and mark the decision on the mockup itself, with its question written right beside the marked spot, not gathered at the top of the page** (owner, Nov 20; numbered orange outlines with a short callout next to each, as on the quest editor review page); **every mention of a design review, a mockup or a comment "thread" comes with its direct link** (the review page URL plus the `#anchor` of the exact mockup or the spot the comment sits on; never just "in the thread" or "on the review page") (owner, Nov 20: "so I don't have to stress about finding what you're talking about"); "make not overwhelming the user a design priority (and also not hindering the user with too many button walls) — balance is key". Personal task context may be in this file (owner OK), but never secrets: passwords, keys, ID numbers, medical or relationship notes. The repo is public: private files go in the `attachments` table, never in git.

**Open questions for the owner:** none.

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
- Migrations: `supabase/migrations/NNNN_*.sql`. Latest is `0094_quest_extras_columns.sql`. All have been run on production. Number new ones after the latest on `main`, and apply them before or with the deploy.
- `profiles.life_wheel` (jsonb) is a catch-all for per-profile extras, read through `readExtras()` in `actions.ts`. **Write it only through `writeExtra(ownerId, key, value)` (`lib/data/extras.ts`, one key per call); never write the whole object.** A trigger keeps top-level keys a write leaves out and logs them in `life_wheel_drops` (check it if settings vanish).
- `app_defaults` table holds "default for all accounts" settings plus server-only `secret.*` keys (never shown as settings).

---

## 3. How to ship (the loop)

**Design review for design changes only (owner, Nov 19, replaces the Nov 14 rule):** new UI or design changes wait on a `review/<topic>` branch with a mockup/screenshot review page until the owner says OK; then merge to `main`. Bug fixes and everything else ship straight to `main` after the build and UI check. Steps in `CLAUDE.md` › "Design review before shipping". When the owner says "update the site", ship the pending feedback's fixes straight and send its design changes for review.

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

**Docs-only pushes don't deploy** (`vercel.json` `ignoreCommand`: only `docs/` and `*.md` changed → no build).

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
- **Light in use (owner, Nov 16):** a `<Link>` to the current route with other search params gets `prefetch={false}` (it re-fetches in a loop otherwise); always-running animations go on an HTML element or a whole `<svg>`, never a shape inside one, with no `filter` on an ancestor. Measure with `npm run perf` (see `docs/SHIPPED.md`, Nov 16).
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
