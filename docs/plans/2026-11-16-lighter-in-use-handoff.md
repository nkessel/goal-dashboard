# Lighter in use: what's done and what's left (Nov 16)

For whichever model continues this. Rounds 1 and 2 are in pull request 6 on `nkessel/goal-dashboard`. The full technical entry is the top "Nov 16: Lighter in use" item in `docs/SHIPPED.md`.

## Done

1. The Menu no longer replays the page's entrance under it when it opens and closes.
2. The toucan and the welcome sky run as their own layers, so the page rests when idle.
3. Calendar and Plan stopped re-fetching themselves in a loop.
4. The Evening Routine button's stars pause while the button is out of view.
5. `npm run perf`: a measuring tool (see below).

## How to measure (always before and after)

```
PERF_NAMES=1 npx next build --webpack     # env as in scripts/ui-check/run.mjs
npm run perf -- --only today --throttle 4 --out before.json
npm run perf -- --diff before.json after.json
npm run perf -- --only today --trace      # also lists running animations
```

Scenarios are in `scripts/perf/scenarios.mjs` (today, toucan, editor, calendar, boards, welcome). Numbers are noisy between runs: trust differences over about 30 percent, and re-run once. Results change with the time of day (the evening side of Today has more animation).

Two rules learned, now in `docs/HANDOFF.md`: a Link to the current route with other search params needs `prefetch={false}`; always-running animations go on an HTML element or a whole `<svg>` with no `filter` on an ancestor.

One trap: never leave a `webpack` key in `next.config.ts` unconditionally. The live build uses Turbopack and refuses to build with it.

## Left, in cost order

| # | What | What was found | Suggested model |
|---|---|---|---|
| 1 | Evening Routine stars while the button is on screen (from 5pm it sits at the top of Today) | 60 animations worked out on the page thread every frame, about half of a slowed phone's time. They don't run on the graphics card. Ruled out as the single cause: `var()` in keyframes, the percent translate, `will-change`, long negative delays. All stars with the same literal timing do run there. Next try: draw the sky on one canvas, or as two or three stacked layers that each twinkle as a group. Must look the same. | Opus |
| 2 | Ticking a habit | About 450 components redraw after the server answers, because every quest row on Today gets new props from the refresh. Needs stable props or a compare function on `TaskRow` / `SortableQuest`. About 180ms of script at 4x slowdown. | Opus |
| 3 | Opening the quest editor | About 240ms of script at 4x. One 174 KB component renders as a block. Splitting it is priorities item 6. | Opus (Fable if splitting the file) |
| 4 | Opening feedback | 190 to 270ms to the first frame at 4x, mostly style work, not React. | Sonnet to profile with `--trace`, Opus to fix |
| 5 | Boards' dream cloud | A filter over drifting puffs redraws the page 55 to 75 times per 2s idle. Same cure as the toucan: move the shadow onto each puff, or drop the ancestor filter. | Sonnet |
| 6 | The XP pill in the quest editor [ef27a8c4] | Not measured: the tool's "5 XP more" tap doesn't find the button. Fix the scenario first, then measure. | Sonnet |
| 7 | Welcome sky motes | Still about 45 page redraws per 2s. | Sonnet |
| 8 | The UI check's `today` flow | Runs past its 4-minute limit on `main`, so its last steps go unchecked. Split it into two flows in `scripts/ui-check/flows.mjs`. | Sonnet |

## Can't be checked from a cloud session

A real iPhone, the owner's real data sizes, and whether the calendar re-fetch loop also ran on the live app. Worth one look by the owner after the merge: open and close the Menu on Boards, and leave the calendar open for a minute.
