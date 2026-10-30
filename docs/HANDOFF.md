# Goal Dashboard: living handoff

**Any Claude Code session, on any account, starts here.** This file says what to work on next and how to ship it. It is kept current by whoever ships: see "Keeping this file current" at the bottom. If it disagrees with `git log`, the log wins, and you fix this file.

- **Last updated:** 2026-10-30, `main` @ `34fba11` (welcome screen settings in context)
- **Live app:** https://tinyquest.win (also https://goal-dashboard-kappa.vercel.app)
- **Pending in-app feedback:** 25 notes not marked shipped (as of 2026-10-30 16:40 UTC, query below). Some may already have been built through chat requests without being marked.

---

## 1. Top priorities

Ranked. Take the first item that isn't blocked on the owner. When you finish one, move it to "Recently shipped" and re-rank.

| # | Work | State | Next step |
|---|---|---|---|
| 1 | **Ship pending in-app feedback** | Ready | Run the feedback loop in section 3. Last batch shipped Oct 29 02:37 UTC. |
| 2 | **Mess check-in for the 20-min cleaning habit** ("Mess weather") | Owner deciding the final shape | Proposed: one-tap calm/cloudy/stormy rating per space; the messiest becomes today's 20-min focus. Plus a style picker in Settings (weather, jars, garden, critters, piles), spaces Desk, Art desk, Bedside box + clothing, Bathroom, **Kitchen**, and "+ Add a space"; a 🧺 laundry bin fill gauge that predicts the next load; a **chore deck** (vacuum, sheets, fridge, dust, recycling, each "every N days") that feeds due chores into the 20-min pick. Build once the owner says go. |
| 3 | **Bring-from-home list** | Owner to confirm the design | A leather side pocket on the backpack/inventory, labelled "Bring from home", nameable for a place (e.g. "Natick"). Tick-off lines; clear ticked or keep for next time. Seed it with Coconut milk and Energy tinctures. |
| 4 | **Toucan-started feedback builds** | Owner action | Built Oct 28 (`src/lib/data/feedback-run.ts`). The owner must generate the scheduled task's API token and paste it in Settings › App feedback. Then test one real run ("implement my feedback"). |

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
- Migrations: `supabase/migrations/NNNN_*.sql`. Latest is `0067_tiny_tasks.sql`. All have been run on production. Number new ones after the latest on `main`, and apply them before or with the deploy.
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

**Feedback builds from the app:** the toucan ("implement my feedback") or Settings › App feedback › Build now fires the owner's Claude scheduled task "Build app feedback (toucan)" (`src/lib/data/feedback-run.ts`). That run follows this same loop. Token and last-run time are in `app_defaults` (`secret.feedback_run_token`, `secret.feedback_run_last`); 15-minute cooldown.

---

## 4. Hard rules from the owner

- Never type API keys, passwords or tokens into any site. Don't open the Vercel environment-variable values page. Don't reuse credentials pasted in old chats or passcodes seen in emails.
- Google sign-ins and OAuth grants are done by the owner.
- Never press "Place on the calendar" or "Put these on my calendar" (they write to the owner's real Google Calendar).
- Production SQL is pre-approved, but never "Run without RLS". Verify every change with a separate SELECT, and save schema changes as a migration in the repo.
- Bulk changes to the owner's own quests (like moving many due dates) get a confirmation first, with a record of the old values.

## 5. Product taste

- **Look:** RPG / storybook. Parchment, gold, dark forest green, `font-display` serif headings. Nothing that feels like Windows (no grey title bars, no grip dots). Use the `--t-*` CSS variables; there are 8 palettes (`src/lib/palettes.ts`). New interactive elements get the matching custom cursor.
- **Motivating, never shaming:** no "0/3" counters; celebrate what's done and what's next.
- **Settings:** fine settings fold away behind a caret, closed by default. A gear beside the thing opens its settings in a popup, and the same controls are also listed in Settings. Settings can be offered as "default for all accounts".
- **Menus:** every ⋯ menu also opens on right-click; menus close on outside clicks except on the feedback box (`[data-feedback-root]`). Opening feedback must never change anything else on screen.
- **Editors:** Ctrl/⌘+Enter and Ctrl/⌘+S save any dialog; × at top right; the quest editor autosaves when editing.
- **The Great Toucan Spirit** (`components/toucan/`): a wise, compassionate guide. Never call it a "coach" or use clinical terms. Modes: simple, lite, full.
- **Phones matter:** the owner uses an iPhone a lot. The page must not resize when the keyboard opens.
- **React compiler lint:** no `Date.now()`/`Math.random()` in render (use `freshKey()` in `lib/quest-drafts.ts` or handlers); no components defined inside components; `setState` in an effect needs an eslint-disable with a reason; no Tailwind `translate-*` on elements whose keyframes animate `transform`.

---

## 6. Recently shipped

Newest first. Keep about 10 lines; `git log origin/main` is the full record.

- Oct 30: Welcome screen settings in context: its gear arranges the screen in place (each part gets show/hide, up/down and its own options where it sits; a strip on top for when it opens, the castle and confetti; greetings under the heading). `src/components/xp/WelcomeArrange.tsx`; the wise-line and greeting lists moved to `settings/LineLists.tsx`. Settings › Welcome Screen still has the same controls.
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
