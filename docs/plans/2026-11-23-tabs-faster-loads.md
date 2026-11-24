# Tabs that load faster: measured, step 2

Owner, Nov 22: "make sure faster loading is on the plan, and also doing the screen transition animation before loading the next page, so it's clear it's loading the next page instead of just being super laggy with the navbar page shift." Step 1 (the slide plays at once, a quiet stand-in per tab) is `review/tabs-instant`, waiting on his review (TI-1..TI-4). This is step 2: the server's wait itself. Run E (Opus), Nov 23.

## How it was measured (no browser needed)

`node scripts/perf/tab-waits.mjs` (new). It starts the app built against the UI check's fake database and puts a small proxy in front of that database that holds **every database request for 40 ms**, about one Vercel-to-Supabase round trip. The in-memory fake answers in under a millisecond, which hides the real cost: waits that have to happen one after another. With the proxy, a page's time is roughly (database waits in a row) × 40 ms plus the render.

For each bottom-bar tab it times a **tap** (a client navigation: the RSC request the bottom bar sends, with a router tree and a matching `_rsc`) and a **full load**, median of 5 to 7 runs:
- **screen**: when the app shell reaches the browser (the shell is drawn once the page's own data is in; the unread badge and the portrait painter stream in after it behind Suspense);
- **done**: the end of the stream;
- the database requests and, with `--log`, each one with when it started and ended, which shows the loaders that wait on each other as steps.

Options: `--latency 40`, `--runs 5`, `--only /,/calendar`, `--log`, `--server-log`, `--json`. Note: a request's `after()` work (the imports notification, the one-time cleanups) runs into the next request's first 100 ms in this tool, because the runs follow each other at once; those rows (`HEAD tasks needs_review`, `HEAD rewards needs_review`, `notifications kind=import`, `profiles select=life_wheel` at the very start) belong to the run before.

Real numbers on the owner's phone will be larger (Supabase round trips from Vercel are often 50 to 150 ms, plus the phone's own network), but the order and the savings carry over: each wait removed saves one round trip on every tap.

## Numbers (tap → screen, 40 ms per database wait)

| Tab | Before | After | Database waits in a row (before → after) | What was slow |
|---|---|---|---|---|
| Calendar `/calendar` | 429 ms | **218 ms** | ~10 → ~5 | profile, habits and the admin check waited before everything else; the agenda (quests waiting behind each calendar quest) waited for every other loader; the sequence links waited for the quest list; the shell's level cap waited for the whole page |
| Today `/` | 325 ms | **190–233 ms** | ~8 → ~5 | the open quests' board titles, stand-ins, sequence links (two waits) and sub-quest counts ran one after another |
| All Quests `/boards` | 112 ms | **66 ms** | 3 → 2 | the shell's level cap waited for the page |
| Priority `/matrix` | 198 ms | **156 ms** | 5 → 4 | the sequence links waited for the quest list |
| Insights `/insights` | 182 ms | **119 ms** | 4 → 3 | the shell's level cap waited for the page |
| Friends `/feed` | 112 ms | 112 ms | 3 → 3 | already one wave; the shell's level cap now joins it |

The page itself looks the same: the server-drawn HTML of all six tabs, before and after, differs only in the clock-relative due times ("Due today, 9:54 PM" vs "9:53 PM", the minute that passed between the two runs), the server-action key and the order two streamed chunks arrive in (checked with the fake database, IDs normalized).

## What shipped (Nov 23, straight to `main`: speed, nothing on screen)

1. **`preloadShell(profileId)`** (`components/layout/AppShell.tsx`): Calendar, All Quests, Insights and Friends start the shell's profile and level-cap reads right after the sign-in check. Within one render the same requests are shared, so the shell no longer adds a wait after the page. (Today and Priority already load both themselves.)
2. **Calendar** (`app/calendar/page.tsx`): the profile, habits and admin check load with the main loaders (one wave instead of two); the agenda is asked as soon as the calendar's quests are in, beside the auto-scheduler's sections, and quests just made from calendar events get theirs in a second request only when there are any.
3. **Open quests** (`lib/data/tasks.ts`): `decorate` runs the stand-ins and the sequence links side by side; `listOpenTasksForOwner`, `listOpenTasksForOwnerWithCategory` and `listOpenTasksWithBoardForOwner` start the sequence links beside their own query (`loadSequenceState` / `applySequences` in `lib/data/sequences.ts`, `attachSequences` kept for the other callers); Today's list loads its board titles, stand-ins and sequences, and sub-quest counts at once (`stepCountsFor` / `withStepCounts` in `lib/data/steps.ts`, `attachStepCounts` kept).

## What's left, in order of what it would save (not built)

1. **The shell's streamed parts add two waits to "done" on every tab** (~90 ms here): `countUnread` first wakes snoozed notifications (a PATCH) and only then counts (a HEAD), and the portrait painter's two counts start only after the page. They don't delay the screen (Suspense), but they keep the stream open and use a connection. Fix: run the wake in `after()` and count unread with `snoozed_until <= now` folded in, or start both with `preloadShell`. Sonnet, nothing visible.
2. **Today, the inner waterfalls** after the main wave: `promoteQueuedQuests` holds the open-quest list for one wave; a `set_profile_extra` write happens during the render (find which loader writes, move it to `after()`); the sequences of the tomorrow queue and the step counts of other lists each add one. Opus (needs care: Today's order of moves into Today's Quests depends on `promoted`).
3. **Calendar, the auto-scheduler's sections** (`autoSchedulerSectionsAction`: tasks, then habits' completions and skips) run three waits; they could load with the page's own rites (already loaded) instead of re-reading. Sonnet.
4. **Priority**: `attachNextSteps` waits for the decorated list; it needs only the ids, like the step counts. Sonnet.
5. **One profile read per page.** Many loaders read `profiles` again with their own `select` (`life_wheel`, `scheduler`, `schedule_folders`, `is_admin`, `check_metrics`): five separate requests on the calendar, all in the same wave, so they cost connections rather than time. A per-request `cache()` of `select *` that they read from would remove them. Sonnet, after D4.
6. **Measure on the live app** (needs the owner's browser or Vercel's function timings): the cold start of a serverless function adds to the first tap after a while away; `npm run perf` in a session with a browser for the client side (hydration, the slide).

Step 1 (`review/tabs-instant`) and step 2 together answer the owner's ask: the slide plays at once with a stand-in, and the real screen arrives about half as late on the Calendar and a third sooner on Today.
