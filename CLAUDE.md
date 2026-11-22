@AGENTS.md

# Start here

Read `docs/HANDOFF.md` before doing anything else. It has the current top priorities, how to ship (push to `main` deploys to the live app), the in-app feedback pipeline, and the owner's hard rules.

**Before you change a screen, read its open feedback notes** (and the `universal` ones): every in-app note carries a `screens` tag in the database. The query, the screen keys and how to keep tags right are in `docs/FEEDBACK-BY-SCREEN.md`. Build or respect them in the same push, mark the ones you build, and tag any untagged note you read. The owner shouldn't have to give the same note twice.

Then read `docs/UI-STANDARDS.md` before changing any screen: one way to do each kind of element (pill drawers, ✎, menus, progress, one surface per popup). Follow it, and move what you touch onto it.

Then read `docs/REPEAT-ASKS.md`: the owner's asks that came back 3+ times. Any work touching one of them is done at higher effort, checked on every screen it applies to, and its row updated (count, status) in the same push.

When you ship to `main`, log it in the same push: add an entry at the top of `docs/SHIPPED.md`, update `docs/PRIORITIES.md` and `docs/WAITING.md` for anything finished, new or waiting, and bump "Last updated" in `docs/HANDOFF.md`. Keep `docs/HANDOFF.md` short: it is loaded into every session, so only standing rules and pointers go there (see its "Keeping this file current"). The next session, on any account, picks up from those files.

# Design review before shipping (owner, Nov 19: "We should have design mockup reviews for any new UI/design changes. For other things like bug fixes there's no need for review before shipping.")

**New UI or design changes** (a new screen, section, control or layout, a changed look, new wording on screen) get a design mockup review before they ship. **Everything else ships straight to `main`** after the build and UI check, with no review: bug fixes (including layout bugs and visible fixes that restore the intended design), data fixes, speed, code moves and splits that change no screen, scripts, docs. When unsure whether a change is a fix or a design change, treat it as a design change. This replaces the Nov 14 rule ("nothing that changes what's on screen goes to `main` until the owner has said OK").

For a design change:
1. Build it, run the UI check (below), fix its errors.
2. Push the work to a branch `review/<short-topic>` (never `main`), so any session or account can pick it up.
3. Show the owner the screens: publish (or update) a review page with the UI check's screenshots of every state that changed, phone first, before/after where useful, and one line per change saying what it is. For bigger changes, run the three UX teams (`.claude/agents/ux-team-*`) on the screenshots first and fix what they agree on. For a new design that isn't built yet, mockups on the review page are enough to get his pick before building.
4. Wait for his OK or his notes. Notes: change, re-check, update the same review page. OK: merge to `main`, push, log it in `docs/SHIPPED.md`, mark the feedback notes.
5. List what's waiting in `docs/WAITING.md` ("Waiting on the owner's design review": branch, review page link, date) and add its name to HANDOFF section 0a.

For a bug fix: UI check if it touches a screen, push to `main`, log it in `docs/SHIPPED.md`, and tell the owner in a line what was fixed.

# Before every push to main: run the UI check

The owner should never be the one who finds a layout bug. Before you push anything that changes what's on screen:

1. `npm run ui-check` (about 10–15 minutes; `-- --no-build --only <flow>` to re-run one flow after a fix). It builds the real app against an in-memory fake database (no secrets, nothing real touched), signs in as a test account and walks every screen in `scripts/ui-check/flows.mjs` on a phone (390px), the phone with the iPhone keyboard up (simulated) and a tablet, in the morning and the evening.
2. Read `ui-check-out/report.md` and look at the screenshots of the screens you touched (red boxes = errors, orange = warnings).
3. Fix every **error** on the screens you touched. Don't push with a new error. If one is a false alarm, add it to `scripts/ui-check/known-issues.json` with a reason.
4. New screen, section, popup or flow? Add it to `scripts/ui-check/flows.mjs` in the same push, so the next check covers it.
5. Don't call a layout fix done until the check shows that screen clean. Say in your note to the owner what the check covered and what it can't (real iOS keyboard panning, real data, Google sign-in).

Details and the full list of checks: `docs/ui-check.md`.

@docs/HANDOFF.md
