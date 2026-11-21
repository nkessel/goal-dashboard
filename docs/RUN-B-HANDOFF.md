# Run B handoff (Sonnet 5.5, another Claude account)

Written Nov 19, 2026 (updated Nov 20) for a fresh session on a different Claude account. Everything it needs is in this repo: the plans that used to live only in the owner's Claude project files are copied to `docs/plans/`. If anything here disagrees with `git log origin/main`, the log wins.

## 1. Paste this to start

> Run B of `docs/plans/2026-11-18-chronological-dev-plan.md`, on Sonnet 5.5. Start by reading `docs/RUN-B-HANDOFF.md` in the repo `nkessel/goal-dashboard`; it says what's already done, what's left, what other sessions are touching right now and the rules for shipping. Then follow `CLAUDE.md` (read `docs/HANDOFF.md`, the feedback notes for each screen you touch, `docs/REPEAT-ASKS.md`). Work the Run B list in section 3 of the handoff top to bottom, one step per commit. New UI or design changes go on a `review/<topic>` branch with a mockup review page and wait for my OK. Bug fixes and everything else (docs, data fixes, migrations, scripts, code moves that change no screen) ship straight to `main` after the build and UI check, no review needed. Keep the app's existing design language: reuse the `.qe-fact` pills, panels, scales and flat icons, don't invent new controls. Before each push, `git fetch origin main` and merge it: other sessions ship to `main` several times a day. Give me short progress notes after each step, and ask decisions in plain messages. When the list is done, or the next step needs a different model, stop and tell me which run and model come next.

## 2. Access the other account needs

| What | Why | How |
|---|---|---|
| **GitHub** with write access to `nkessel/goal-dashboard` | Every step pushes; a push to `main` deploys | On the other claude.ai account: connect GitHub (claude.ai/connect-github) with a login that can push to the repo (the owner's own, or one he adds as a collaborator), and make sure the Claude GitHub App is installed on the repo. |
| **A Claude Code cloud environment** for that repo | Builds, the UI check (Playwright is preinstalled) | Default network access is enough to `npm ci`. No secrets needed: the UI check runs against an in-memory fake database. |
| **Supabase connector** | Step 1's data step, D0 and D1 migrations, Cal 3, reading and marking feedback notes | Add the Supabase connector in claude.ai Settings › Connectors, signed in to a Supabase account that can see project `xjokponibpzyzbmypgyb` ("Success Team App"). Production SQL is pre-approved by the owner (never "Run without RLS"; verify every change with a SELECT; save schema changes as a migration in the repo). |
| **Vercel** | Not needed | A push to `main` deploys on its own. Never open the environment-variable values page. |

The live app is https://goal-dashboard-kappa.vercel.app. Cloud sessions can't sign in to it (Google sign-in), so say what was checked and how.

## 3. Run B, with today's status

The Run B list from the dev plan, updated with what has happened since it was written (Nov 18).

**0. Bugs first (owner, Nov 21 7:12 AM: "everything is extra buggy now... long welcome screen comes up but disappears on interaction, can't check in sleep, etc etc"; 7:14: fine if not fixed right away, but it must work by some point in the timeline).** Before any other item, take one of these if it isn't claimed: (a) on the live app, the welcome screen opens (the long version) and vanishes on the first tap, so its sleep check-in can't be done; (b) find the other new bugs: run `npm run ui-check` on all flows against `main`, compare with the last clean report, and walk Today, welcome, check-in, Insights and calendar for errors, regressions from the Nov 20–21 merges (check-in work, faces/feel, sequence, time ranges, additional habits) and the overnight D0/D1/L1 changes. Fix each on `main` as a bug fix (no review needed), log it in `docs/SHIPPED.md`, and say in WAITING what you couldn't reproduce. **Also on `main` (Nov 21 check):** React #418 hydration errors on /quests, /plan, /matrix, /journal and / (tablet) in the UI check since it runs the server in UTC (8ee2cb0): fix them as part of (b). **(a) is fixed (Nov 21, c0d2570): stale copy after deploys; see `docs/SHIPPED.md`. Do (b).** Not D0's save path (checked Nov 21: no failed saves in the database, keys match), nor L1's file split (code moved unchanged).

**1. Merge what the owner said OK to (Nov 19, 00:43 UTC: "ok let's do it").** Run A got the OK but stopped on its usage limit before merging most of it. As of this writing:

| Branch | Status | What to do |
|---|---|---|
| `review/import-calendar`, `review/import-landing` | **Live** (import card with one When pill, Nov 19) | Nothing. |
| Calendar 14-day flash fix | **Live** (Nov 19) | Nothing. |
| `review/sub-habits-in-place` | **Live** (Nov 18) | Nothing. |
| `review/time-ranges-lesson-button` | **OK, not merged.** Conflicts with `main` (it predates the import card and calendar fix) | Merge by hand, UI check `today` and `habiteditor` on phone and tablet, ship. Then do its "On his OK" list in `docs/WAITING.md` (Chester Care in `life_wheel.habitTicks.many`, merge into `life_wheel`, never overwrite). The ARC course habit swap is still only asked, not approved. |
| `review/additional-habits` | **OK with a change, not merged.** Owner, Nov 19: "additional habits should be a section within the habits section". The branch's last commit (Nov 18) puts it as its own section under Daily Habits; check whether it now sits inside the Daily Habits card. If not, move it inside, as its own sub-section | Merges clean. UI check `today` + `habiteditor`, ship. |
| `review/prioritize-bars` | **OK if the UI check is clean, not merged** | Merges clean. UI check the Prioritize flow; ship if clean, otherwise tell the owner what it found. |
| `review/cleaning-xp` | **Not approved yet.** Finished Nov 19 (XP burst, three tray looks), conflicts with `main` | Merge `main` into it, UI check, publish a review page with the three tray looks, wait for his pick. |

Waiting on the owner's review, **don't merge** without his OK: `review/boards-nov18` (contains `review/calendar-nov18`) (**except** "Calendar events as quests": shipped to `main` on its own Nov 19 with XP by the event's length, `lib/data/event-quests.ts`, `lib/event-quest-xp.ts`, `EventQuestsSwitch.tsx`; when that branch merges, keep `main`'s versions of those files and drop the branch's `questSeries`/series-look writes from `makeEventQuests` unless the series look is approved too), `review/subquests-sequence`, `review/insights-nov19`. Their entries in `docs/WAITING.md` list the notes to mark when he says OK.

**2. S2, S3** (split plan, `docs/plans/2026-11-16-split-plan.md`): fixtures, baselines, and splitting the UI check's too-long `today` flow (Light 8). S1 (`--snapshot` / `--compare`) is done; use it around every move.

**3. L1, L2:** the toucan's and the quest editor's small exports get their own files. Write down how much Today's and the import page's code shrink. **L2 touches the quest editor, which the pointer-tray thread is changing right now (section 4): do L2 after that lands on `main`.**

**4. D0:** `set_profile_extra` and `writeExtra`, so the catch-all stops losing saves. A real data bug. Migration number: the next free one on `main` (latest was 0089; 0090 is claimed by the calendar design's step 3).

**5. D1:** the new quest columns (`place`, `card_look`, `progress_unit`). Nothing reads them yet.

**6. When 1 (done Nov 21):** `src/lib/when.ts` and its checks (`docs/plans/2026-11-17-due-and-scheduling-plan.md`, section 6 step 1). Nothing visible. The owner approved one "Complete by" date with Flexible / Fixed and the word "Auto-schedule"; nothing else in that plan is approved.

**7. Cal 1a: done Nov 21** (server runs in UTC by default in the UI check). Was: partly done. The UI check has `--server-tz <zone>` and a `first-picture` check in the calendar flow. Left: run it in two time zones by default (UTC server, New York browser) and fail on hydration errors.

**8. Calendar fixes, plus the data copy.** Changed since the plan was written:
- **Cal 1b, 1c: done** (live with the flash fix).
- **Cal 2a, 2b, 2c, 2d: on `main`** (merged Nov 21 with `review/boards-nov18`, owner approved). Don't build them again.
- **Left: Cal 1d** (`cal-ui` cookie for span, zoom, early/late and layers; it fixes the calendar opening on the wrong settings, so it ships straight to `main` after the UI check), and **Cal 3** (migration 0090 and the copy of drives and day holds; nothing visible, verify with SELECTs). Cal 1d touches `WeekView.tsx` and `CalendarLayers.tsx`, which `review/boards-nov18` also changes: build it on top of that branch, or wait until it's merged.

**9. Stats on sub-quests** (owner note 4eb6549b, Nov 16: sub-quests "should be a bit more like quests": time, char stat assignment, scheduling). Not designed yet: brainstorm with mockups first. Reuse the quest's stats tray (`tasks/StatSplitEditor.tsx`).

**Then Run C (Haiku 5.5)**, the list in the dev plan. Its Cal 2a, 2b and 2d are already on `main` (merged Nov 21).

## 4. In flight right now: don't collide

| Who | What | Files | Ships |
|---|---|---|---|
| Thread "Fix buggy app loading" (owner's account) | Tutorial dark area blocks taps; new versions switch over only while the app is in the background; Today's server uses the user's time zone (no redraw); one request on open instead of 10 | `tour/Walkthrough.tsx`, `public/sw.js`, `src/app/page.tsx` and the startup data loaders, likely `actions.ts` | **Shipped Nov 19** (see `docs/SHIPPED.md`) |
| Thread "Design a tray that opens from its pill" (owner's account) | Pointer tray (B) for every `.qe-fact` pill row; the import card gets an Urgency scale beside When, like the quest card | `imports/ImportTriage.tsx`, the quest editor's pill row and panels, the habit editor, `globals.css` | `main` (owner asked to ship it live) |
| Session claude-2d (Opus, owner's account) | **Merged to `main` Nov 20:** `review/insights-timeline` (with `insights-nov19`, `faces-feel`) and `review/subquests-sequence`. L2 is free to start. `review/boards-nov18` stays waiting on his review: don't merge it. | — | done |

`docs/WAITING.md`'s top section is the live list of claimed work: add your own line when you start ("Run B, Sonnet, other account: …"), and remove it when you finish.

## 5. Rules, short

The full rules are in `CLAUDE.md` and `docs/HANDOFF.md`. The ones that matter most for this run:
- **Shipping (owner, Nov 19):** new UI or design changes get a mockup review: `review/<topic>` branch, `npm run ui-check`, review page with phone-first screenshots, the owner's OK, then `main`. Bug fixes and everything else ship straight to `main` (push = deploy) after the build and UI check. Log every push to `main` in `docs/SHIPPED.md`, `docs/PRIORITIES.md`, `docs/WAITING.md`, and bump "Last updated" in `docs/HANDOFF.md`.
- **Design language:** reuse the app's parts (`.qe-fact` pills, `.qe-fact-panel`, `LevelScales`, `GoldCheck`, the drawer); flat single-colour icons, never colour emoji; open in place with a slide, no popups; the owner's exact words for options.
- **`life_wheel`:** always merge into it, never overwrite it.
- **Never** press "Place on the calendar" or "Put these on my calendar" (they write to the owner's real Google Calendar). Never type keys, passwords or tokens into any site. The repo is public: no personal or private data in git.
- **Build checks:** `npx tsc --noEmit -p .`, `npx eslint <files you touched>`, `npx next build --webpack`. This Next.js (16.3) is not the one in your training data: read `node_modules/next/dist/docs/` before an unfamiliar API.
- **Owner's style:** short progress notes after each step; decisions asked in plain messages; "brainstorm" means ideas back to him before building.

## 6. Plans copied from the owner's project files

The other account can't open the owner's Claude project files, so these are copied into `docs/plans/` (Nov 19). The project files stay the originals; if one changes there, copy it again.

- `docs/plans/2026-11-18-chronological-dev-plan.md`: Runs A to H, one model each.
- `docs/plans/2026-11-16-split-plan.md`: step ids S, L, T, W, I, E, C, D and the tick list.
- `docs/plans/2026-11-17-due-and-scheduling-plan.md`: "When 1" to "When 7".
- `docs/plans/2026-11-16-lighter-in-use-handoff.md`: "Light 1" to "Light 8".
- `docs/plans/2026-11-16-dev-priorities-by-model.md`: the feature backlog by model.
- The calendar planner design is already in the repo as `docs/CALENDAR-PLANNER-DESIGN.md` (same text). The `actions.ts` split plan (Run D) is `docs/ACTIONS-SPLIT-PLAN.md`.

Where these plans point at `/mnt/project-files/planning/…`, read the copy in `docs/plans/`.
