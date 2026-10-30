# WIP: UX synthesis (welcome screen + quest editor) — handoff

Work continues on `main` in small shipped batches (batch 1 shipped Oct 30 evening: top priority display, one-button save, check-in −/+). Read `docs/HANDOFF.md` first, then this. When "Still to do" is empty, delete this file and update HANDOFF in the same push.

## What the owner asked
1. "Do a real expert UX review and upgrade mission" with the three standing teams (`.claude/agents/ux-team-*.md`), on the **welcome screen** and **quest editor**. Reviews are done and committed: `docs/ux/2026-10-30-{calm-craft,game-feel,thumb-first}.md`. Next: synthesize (agreements first) into `docs/ux/2026-10-30-synthesis.md`, then build.
2. **SHIPPED (see `docs/ux/2026-10-30-top-priority.md`):** "the top priority entered in the welcome screen is not displayed correctly — lines are not separated, spillover text doesn't continue on the next line, and the font size and styling seems off — pls have UX experts look at it." The saved view is in `TopPriority` in `src/components/xp/WelcomeCard.tsx` (`<p>{saved.text} <button>Change</button></p>`, 16px, centered): no `whitespace-pre-wrap`/`break-words`, and "Change" sits inline in the text. Give the three teams a screenshot of a long multi-line priority (dev harness, see HANDOFF §3 step 4; `src/app/dev-preview/` is git-excluded, recreate a harness page with mock props) plus the file, synthesize, fix. Check where else the priority shows (Today, toucan context) with `grep -rn "priority" src`.

## Shipped in batch 1
- `EnergyCheck.tsx` (welcome `simple` mode): no hidden 58px Save column, no inner "Submit check-in" (the screen's bottom button saves), −/+ step buttons beside each slider (`.ec-step` in `globals.css`, 44px touch area), metric labels capitalized.
- `WelcomeCard.tsx`: **one commit**: the bottom-right button (`complete()`) awaits the top priority and intention savers (registered via `register` props, `savers` ref), stays on screen if one fails (each shows its own error), then submits the check-in and leaves. Shows "Saving…". Per-field Save buttons removed from TopPriority and Intention; "Same as before" now fills the box instead of saving.

## Still to do (agreed by all three reviews)
Welcome screen:
- (Shipped batch 2: compact reward line, one Done, hidden parts as chips, no doubled label.) Left: consistent capitalization (thumbs' tap area done Oct 30 night).
- Keep: the "+ Other priorities" seal and the "Complete check-in" label (owner's choices).

Quest editor: shipped in batch 3 (see HANDOFF "Recently shipped"). Left on purpose: "Shows in" stays a chip (the owner chose the one row of chips this afternoon, after the reviews); pinned footer not done.

Then: check new in-app feedback (HANDOFF §3 query; about 9 pending, list in HANDOFF header), build, screenshot, merge to `main`, push, mark feedback shipped, update HANDOFF, concise debrief (owner wants debriefs short).

## Gotchas
- Production SQL runs through the Supabase dashboard in the browser pane if no Supabase connector (set Monaco value, Run; read `.rdg`; use `string_agg` since rows virtualize).
- Another session pushes to `main` often: `git fetch && git rebase origin/main`; HANDOFF and `celebration-fx.ts` conflicts → keep both sides.
- Commit trailers: your own session's attribution lines.
