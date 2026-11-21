# Board roller "N more" trim: the owner's pick (Nov 20)

**Status:** built and live (Nov 21, merged with `review/boards-nov18`): swoosh 4B by default, Settings › Boards › Roller trim (Ornaments · Lines · Plain, per device). Saved to iterate on later. Review page: https://claude.ai/artifact/L86rUKwmQQJGTd2asBY99i#swoosh (decisions at `#roller`, `#roller2`, `#trim`).

## What it is
The bottom roller of a board's scroll (`ScrollPull` in `src/components/boards/BoardGrid.tsx`, `.scroll-pull-count` in `globals.css`) says how many quests are still rolled up: "↓ 3 more". A tap unrolls three more.

## The owner's pick: swoosh 4B, "Woven swoosh"
Engraved small-caps lettering ("1 MORE", letter-spacing .14em, 10.5px, dark brown `#4a3410` with a light under-edge) with a calligraphic woven swoosh either side: two strokes weaving over and under each other, sweeping out to the roller ends, mirrored on the right. Chosen over diamonds, fleur-de-lis, leaf sprig, sparkle, curl, and four other swooshes (4a loose knot, 4c curly q, 4d double loop, 4e spiral tail). He wanted "calligraphic swooshes or curly q's that swoosh left and right in a sort of beautiful loose knot".

SVG (viewBox `0 0 60 18`, drawn about 58x18, stroke `currentColor`, width 1.5, round caps and joins, the right-hand copy mirrored with `scaleX(-1)`; ornament colour `#6b3f12`, opacity .9):

```
M2 10C12 1 20 1 29 10S46 19 58 9M2 10C12 19 20 19 29 10S46 1 58 11
```

Possible tweaks he may ask for: looser, more loops, thinner, longer.

## Asked for, not yet decided
**Setting "Roller trim": Ornaments · Lines · Plain** (his idea: the hairline look, mockup 2b, as an option). Ornaments = the swoosh above (default), Lines = fine engraved hairlines from the words to the roller ends, Plain = just "↓ 1 more". Per device, like the pulled-open state. Shown in Settings › Boards and by the roller's ✎ on the board. Waiting on his OK of the names.

## Where it goes in
On `review/boards-nov18` with that branch's other boards work, after his OK of the review page.
