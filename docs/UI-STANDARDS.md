# UI standards: one way to do each thing

**Read this before you change any screen** (owner, Nov 22: "What do we need to get some standards for our UI elements that are high and consistent among all the elements on the app?"; he OK'd STD-1 to STD-3). Each entry: the rule, the owner's words, the one component to use. If a screen does it differently, move it onto the standard when you touch it. A new kind of element goes on the design-system page for his OK first (STD-4), then here.

The UI check enforces the rules marked **[checked]** (`scripts/ui-check/audit.mjs`); a push that breaks one fails.

## Layout and surfaces

- **One surface, not nested cards.** A popup (the quest editor, the habit editor) is the card; what's inside it sits flat on it. Never more than one framed box inside a popup, and never a frame inside a frame (owner, Nov 22: "four nested cards here which is terrible UI/UX … the habit editor (like the quest editor) is a popup, not a drawer"). Pass `bare` to parts that draw their own frame (`WhenPicker bare`).
- **Use screen space wisely:** compact, 32px controls inside trays and panels, 44px only for primary actions, short labels, one line where one will do.
- **No unnecessary popups:** choices that fit in a line or two open in place. Popups only for long content.
- **Everything that opens, slides** (opening and closing): `.drawer-body[data-open] > .drawer-inner`, `reveal`, `card-pop-in`.

## Pills and their drawers

- **Pill → drawer, one way everywhere.** Tapping a `.qe-fact` pill opens a drawer that **slides down right under the pill's own row**, with its **point touching that pill** (`.pill-tray-box`, `--tray-x` at the pill's centre). No floating trays, no tray below all the other pills, no tray far from its pill (owner, Nov 19: "weird to have a button that reveals a section so far away from the button"; Nov 22: "a drawer sliding down, with a carat pointing to the pill of the drawer … No floating drawers far away from pills").
  - In a wrapping row of pills: `ui/PillTrays.tsx`.
  - In a single row (a sub-quest's card): the drawer right after the row, as `tasks/StepCardEditor.tsx` does.
  - A drawer may run wider than the row (the When calendar does) but its point still sits on its pill.
- **Pills show only when editing.** A list item shows its name and its key facts; its pills (time, XP, stats, when, …) appear only after its ✎ (owner, Nov 22: "the fields should be editable when you click the edit button for the sub-quest, not an ever-present pill cluttering up the UI").
- Use the owner's exact words for options.

## Editing

- **✎ edit buttons:** 24px, no border, the soft gold pencil (`#a88a3f`), beside the text it edits; a light gold wash while open.
- **Settings in context:** a screen's gear turns on editing on that screen; anything that isn't part of the screen sits in a panel above it; every component gets a ✎ beside it; its hide button sits at its top-right; order changes by dragging the item itself (no grips, no arrows). Reference: `xp/WelcomeArrange.tsx`, `tasks/EditorArrange.tsx`, `calendar/CalMenuArrange.tsx`.
- **Editing text in place:** same look while typing (`bare-input`, no wash, at most a thin gold underline).
- **One stat assigner:** `tasks/StatSplitEditor.tsx` everywhere stats are assigned (quests, sub-quests, and any future habit, rite or reward). No second picker (owner, Nov 21).
- **One time picker on the calendar:** `calendar/WhenPicker.tsx`, drawn like the calendar screen (parchment, serif hours, dashed events, the item as a calendar card).

## Menus

- Every ⋯ menu also opens on right-click (and long-press on touch); it closes on outside clicks. Menus with more than a few rows get the gear → drag, eye, rename arrangement (`CalMenuArrange`).
- A hold or right-click on a small thing (a quote, a chip) opens its own small menu next to it (`useLongPress`).

## Progress and numbers

- **No 0% anywhere [checked]:** no bar, number or "0% done" until there is progress; show what's there instead ("3 sub-quests") or nothing (owner, 4 times: "the 0% indicators are demotivating and need to stop"). A real setting that can be 0 (a share, see-through) is marked `data-allow-zero`.
- **Motivating, never shaming:** no "0/3" counters; celebrate what's done and what's next (`lib/progress-words.ts`).

## Look

- RPG / storybook: parchment, gold, dark forest green, `font-display` serif headings, `--t-*` variables. Nothing that looks like Windows.
- **Icons:** flat, single-colour line icons in the surrounding ink or gold; no colour emoji or coloured circles in anything new or touched. Pictured objects point the right way (an arrow is struck into a target, feathers at its tail).
- **Checkboxes:** the gilded `GoldCheck`; sub-quest and quest checks are circles.
- **Scales:** `ui/LevelScales.tsx`.

## Decisions for the owner

- Every decision on a review page has a code (`SQ-1`, `TQ-2`) in an orange badge beside its marked spot, with an anchor; messages name the same codes with their links.
