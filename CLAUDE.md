@AGENTS.md

# Start here

Read `docs/HANDOFF.md` before doing anything else. It has the current top priorities, how to ship (push to `main` deploys to the live app), the in-app feedback pipeline, and the owner's hard rules.

When you ship to `main`, update `docs/HANDOFF.md` in the same push: bump "Last updated", move finished work to "Recently shipped", and add or re-rank anything new. The next session, on any account, picks up from that file.

# Before every push to main: run the UI check

The owner should never be the one who finds a layout bug. Before you push anything that changes what's on screen:

1. `npm run ui-check` (about 10–15 minutes; `-- --no-build --only <flow>` to re-run one flow after a fix). It builds the real app against an in-memory fake database (no secrets, nothing real touched), signs in as a test account and walks every screen in `scripts/ui-check/flows.mjs` on a phone (390px), the phone with the iPhone keyboard up (simulated) and a tablet, in the morning and the evening.
2. Read `ui-check-out/report.md` and look at the screenshots of the screens you touched (red boxes = errors, orange = warnings).
3. Fix every **error** on the screens you touched. Don't push with a new error. If one is a false alarm, add it to `scripts/ui-check/known-issues.json` with a reason.
4. New screen, section, popup or flow? Add it to `scripts/ui-check/flows.mjs` in the same push, so the next check covers it.
5. Don't call a layout fix done until the check shows that screen clean. Say in your note to the owner what the check covered and what it can't (real iOS keyboard panning, real data, Google sign-in).

Details and the full list of checks: `docs/ui-check.md`.

@docs/HANDOFF.md
