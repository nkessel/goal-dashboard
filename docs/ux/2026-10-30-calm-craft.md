# Calm Craft review: Welcome screen and Quest editor (Oct 30)

Calm Craft (reduction, hierarchy). From the 10 offline screenshots plus the component code. No code changed.

---

## A. Welcome screen

### 1. Verdict
The welcome card asks you to commit **four times**: Save, Save, and Complete check-in, plus the check-in's own Submit. Gold is spread across four buttons, so nothing reads as *the* button. The exit says "Complete check-in" even when you never opened the check-in, and it **drops a typed priority** that wasn't saved first. In settings mode, each part carries its title twice and there are three ways out.

### 2. Top problems (ranked)
1. **Typed words are lost.** In `WelcomeCard.tsx`, `TopPriority` and `Intention` keep their text in local state. The exit button (around line 393) only calls `submitCheckin`, then `leave()`, so text typed without pressing Save disappears.
2. **Too many commit buttons.** On phone, 12 controls are visible and 4 of them commit (two Saves, Submit check-in, Complete check-in). The priority Save sits alone on its own right-aligned row, which wastes about 44px.
3. **Gold means nothing.** Check in, + Other priorities, Due soon and Complete check-in are all gilded. "Other priorities" also overlaps the textarea's border, so it reads as the main action.
4. **With the check-in open, the exit falls off a 390×844 phone** (see `welcome-checkin-open-phone.png`). The sliders are only about 100px wide because of a hidden 58px Save column (`EnergyCheck.tsx` around line 471, `visibility:hidden`) and a 20px caret spacer. Labels mix case ("Energy" / "mood"). Two "+" controls sit side by side (an unlabelled `+` for a metric, and `+ Tag / event`). "Add sleep & wake times" for *other* nights has no place on a greeting.
5. **"Last night" stacks three heading levels in one small card** (LAST NIGHT / Factors of sleep / RIGHT EFFORT · YESTERDAY). The factor chips alone take about 150px on the first visit (`NightFields.tsx`).
6. **The reward area takes 4 rows** (streak, bar and caption, +XP, coins), about 150px for one idea: "you earned something."
7. **Settings mode.**
   - Three exits: Done in the panel, the ✓ gear, and Done at the bottom.
   - Each part card repeats its own question ("TODAY IS ABOUT…" then "Today is about…"), about 34px × 7 parts.
   - The ✎ sits by the caps label, not "by the text itself" as HANDOFF §5 asks.
   - The stepper is buried mid-sentence ("…then again after [− 5 hrs +] away"), and "away" wraps alone on phone.
   - Confetti shares a row with an unrelated header.
   - The check-in's two options are **plain browser checkboxes, each on its own line** (`WelcomeArrange.tsx` lines 353–363), which breaks the GoldCheck rule.

### 3. Redesign: phone (390px)

```
    🐦 ( Shall we plan your day together? )
┌──────────────────────────────────────── ⚙┐
│          Huzzah! Here you are!  ✎          │ 25px display
│                                            │
│              ( ☀ Check in ▾ )              │ 40px gilded, unchanged
│                                            │
│  What are your top priorities today?       │ 15px semibold
│  ┌──────────────────────────────────────┐ │
│  │ What is most important now?          │ │ 72px, grows
│  └──────────────────────────────────────┘ │
│  + Other priorities                        │ 28px text link, gold ink, no fill
│                                            │
│  Today is about…                           │
│  [ e.g. Steady and kind to myself       ]  │ 40px, no Save button
│                                            │
│      Breathe. Then the next small thing. 👍👎│
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░  +10 XP · 🪙 +2           │ bar + count-up on one row
│  Level 4 · 1,960 / 2,500 · 🔥 8-day streak  │ 12.5px caption
│                                            │
│  ( ☾ Snooze )            ( Begin the day › )│ only gilded fill besides Check in
└────────────────────────────────────────────┘
```

**Rules**
- **Begin the day saves everything:** priority, other priorities, intention and check-in. Enter or blur also saves each field quietly, with a ✓ fading in at the field's right. The label is always **"Begin the day"**.
- **Gold fill is for Check in and Begin the day only.** Due soon becomes an outline pill. When nothing is due it is hidden, unless you are arranging.
- **The check-in panel, opened:**
  - No phantom Save column, so the sliders use the full row (about 200px).
  - Metric names are shown in Title Case.
  - One `+ Event or #tag` chip.
  - Adding a metric moves to the check-in's ✎ while arranging.
  - "Add sleep & wake times" for other nights is dropped here; it stays in Insights.
- **Last night:** Slept → Woke tokens stay. "Factors of sleep" folds into one chip, `✦ What helped or hindered ▸ (2)`, closed by default. Inside, the effort and hindrance chips sit under a single caps label each, and the "Factors of sleep" heading goes.

**Settings mode (gear)**

```
┌ Welcome screen ─────────────────── (Done) ┐
│ Comes back after          [ − 5 hrs + ]   │ label left, control right
│ Confetti on first visit        [ On ]     │ same row pattern
│ Castle   [thumb]          ✦ Generate       │ phone only
└────────────────────────────────────────────┘
┌──────────────────────────────────────── ✓┐
│ ┌ What are your top priorities today? ✎ ⊘┐│ ✎ by the text, hide top-right
│ │  [preview box]                          ││ no duplicate caps label
│ └──────────────────────────────────────────┘│
│ ┌ CHECK-IN ✎                              ⊘┐│ caps label only for parts
│ │  ( ☀ Check in ▾ )                       ││ without their own words
│ │  Includes  [☾ Last night] [Mood & more] ││ ← two toggle chips, one row
│ └──────────────────────────────────────────┘│
│ … (drag the part itself; Hidden list at end)│
└────────────────────────────────────────────┘
```

- Remove the bottom Done and the "✎ by each part for more" hint.
- At 0 hours the stepper reads **Only first visit**.
- Check-in options:
  - "The button" style radios stay.
  - "Its words" and "Its icon" share one row: input, then icon chips.

**Desktop:** the same, at 440px.

### 4. Implementation list (ordered, each shippable alone)
1. `WelcomeCard.tsx`: lift `text`/`others` from `TopPriority` and `text` from `Intention` through a `submitFields` ref, the same way `submitCheckin` works. The exit awaits all three. Rename the exit label to "Begin the day".
2. `WelcomeCard.tsx`: remove the per-field Save buttons. Save on Enter/blur with a fading ✓. Make "+ Other priorities" an unfilled text link in the flow, not overlapping the box.
3. `DueSoonDrawer.tsx`: outline (`PILL`) style, and render nothing when `soon.length === 0` and not arranging.
4. `EnergyCheck.tsx` (`simple` path): drop the 58px hidden Save column and the 20px spacer; Title Case the labels; hide the unlabelled metric `+` and the `addNights` button when `simple`.
5. `NightFields.tsx`: fold the factors behind one chip with a count, and drop the "Factors of sleep" heading.
6. `WelcomeCard.tsx` reward part: put +XP and coins on one row, and fold the streak into the bar caption. Keep the count-up.
7. `WelcomeArrange.tsx`:
   - Remove the bottom Done (it lives in `WelcomeCard` around line 343).
   - Rewrite `ArrangeAbove` as label/control rows.
   - Replace the two checkboxes in `CheckinOptions` with two `CHIP`/`CHIP_ON` toggles on one "Includes" row.
   - In `Part`, skip the caps label for `focus`/`intention` and put the ✎ beside their question.

### 5. What NOT to change
- The mist, the castle, the toucan landing, and the confetti.
- The gilded Check in that unfolds in place.
- One exit, at the bottom right.
- Snooze's line-out times.
- Tap-to-rewrite on the greeting.
- Dragging the part itself, and Hidden at the end.
- The Due soon drawer of real cards.

---

## B. Quest editor / creator

### 1. Verdict
The editor hides the most common things and shows the rarest.
- **A due date takes 3 taps** (Time chip, then "Add to calendar", then the Scheduling caret) behind a label that says *calendar*.
- The fact chips speak in code ("📍 Additional", "0 XP", "No board").
- "Tiny" is set three different ways.
- Five plain checkboxes and four separate scale-style toggles fill Advanced.
- The edit footer has four competitors.

### 2. Top problems (ranked)
1. **The due date is buried.** It lives in `partNodes.time` (around lines 1104–1290): `Add to calendar` opens Scheduling, which holds Due, Calendar slot and the scheduling list. Task "new quest, 30 min, due Friday" takes **7 taps plus typing**.
2. **The fact chips are cryptic and wrap to 2 rows on phone** (`factLabel`, around line 2005). "Shows in" is three options hidden behind a pin icon, and the full radiogroup only appears after a tap.
3. **One idea, many names.** "Add tasks" creates **Steps**. "Add to calendar", "Scheduled", "Scheduling", "Calendar" and "Find a time" all name one area. Other pairs: "XP reward"/"Points", "Time"/"Time to complete", "Create a sequence"/"Sequence".
4. **Tiny is set in three places:** the sheet tab "Tiny task" (`CreateSheet.tsx` `KIND_META`), the 🌱 toggle in the editor's header (around line 971), and a checkbox under the portrait when editing (around line 2203).
5. **Checkboxes are inconsistent and one per line:** Paint a portrait, Add to the scheduling list, Not actionable yet, Stands for, and Private are all native inputs with mixed indents (`pl-7` on some, 0 on others; see `editor-edit-desktop.png`).
6. **Advanced, with the default icon style:** each scale draws its own style toggle (`ılıl 0`, 4×), which reads like data. "Advanced settings · 6 more" says nothing about what is set.
7. **Footers.**
   - Edit has Delete, "✓ Saved", Complete and Done, plus a green ✓ inside the title field (the saved state is shown twice).
   - Create has Cancel, Create, Already done ✓ and × at the top.
8. **The coins stepper** sits on a different row from its explanation, "coins follow XP (1 per N)". The XP slider stops at 350 while the field allows 1000.
9. **The header has emoji-only buttons** (🌱 📜, labels `sr-only`). The gear opens a Settings popup, against the Oct 30 settings-in-context rule.

### 3. Redesign: phone (390px), create

```
┌ New quest                    📜 Templates  ⚙  × ┐
│ (◎)  [ Quest title                        ]     │ portrait 56px; 🖌 badge
│  🖌  + Add a description                         │ text link → grows field
│                                                  │
│ ( Today | Additional | Backlog )                 │ segmented, 36px, always shown
│ [📅 Due Fri ▾] [⏱ 30 min ▾] [✦ 30 XP ▾]           │ one row
│ [▦ Home board ▾] [☰ Steps] [# Tags]               │ one row
│ ▸ More   Importance 2 · Private                  │ summary of what's set
│ ───────────────────────────────────────────────  │
│ Already done ✓                   ( Create quest )│
└──────────────────────────────────────────────────┘
```

**Chip panels (one open at a time, below the chips)**
- **📅 Due:** quick chips `Today · Tomorrow · Fri · Next week · Pick…`, an optional time, and `× Clear`. Under them, a thin rule, then `Find a calendar slot` and a GoldCheck `On the scheduling list` with `Top · Unnumbered · Bottom` inline.
- **⏱ Time:** `5 · 15 · 30 · 60 · 90` chips and a `[__] min` field. Minutes only.
- **✦ XP:** slider (0–350) and field on one row. Below it, one row: `🪙 [− 3 +]  auto: 1 per 10 · reset`, with the stepper right beside its label. Then `+ Send to stats`.
- **▦ Board:** the BoardPicker, plus "Also on" chips when editing.
- **☰ Steps:** opens the step list. "Add tasks" is retired.
- **# Tags:** inline tag input (no indent).

**Inside More** (in this order)
- One scales group: Importance, Urgency, Difficulty, Energy boost, with a **single** style toggle at the group's top right.
- Progress (edit only).
- Sequence.
- A **two-column grid of GoldCheck toggles**: `🔒 Private` · `Not actionable yet` · `Tiny (half height)` · `Stands for board`.
- `Plot on the Priority Matrix` as a full-width outline button.

**Header and footers**
- **Edit header:** `Edit quest · Saved ✓` (status beside the heading, 12px, fades). Then `⋯` (right-click too), holding Save as template, Plot on the Priority Matrix, and Delete quest with its confirmation. Then `⚙` and `×`.
- **Edit footer:** `( ✓ Complete )  ( Done )`, gold and green as the owner chose. Delete and the save status leave the footer.
- **Create footer:** Cancel is removed (× covers it). "Already done ✓" becomes a quiet text button on the left.
- **Portrait:** the "Paint a portrait" checkbox becomes a 24px 🖌 badge on the portrait's lower right, gold wash when on, `aria-pressed`.
- **Tiny:** the CreateSheet tab is the one place to create it. The 🌱 header toggle is removed. When editing, Tiny lives in More's toggle grid.

**Desktop:** the same single column, 448px.

**Counts:** "30 min, due Friday" drops from 7 taps plus typing to 5 taps, with no typing. At first view the create screen shows 11 controls, down from 14, with one filled button.

### 4. Implementation list (ordered)
1. `QuestEditorDialog.tsx`: add a `due` fact key with the quick-date chips, and move Due, Calendar slot and the scheduling list from `partNodes.time` into it. `time` becomes minutes only, with preset chips. In `quest-editor-layout.ts`, add `"due"` to `EditorPart`/`EDITOR_PARTS` after `showsIn`, and bump `v: 3` so saved layouts receive it.
2. Render `showsIn` as the always-visible segmented control (the existing radiogroup at line 1027) and drop it from `FACT_KEYS`.
3. Rename everywhere: "Add tasks" → "Steps"; "XP reward"/"Points" → "XP"; "Advanced settings · N more" → "More" plus a summary of set values; "No board" → "Board".
4. Remove the 🌱 `toolbarButtons` toggle. Give 📜 a visible "Templates" label. Move tiny, private, aspiration and standsFor into one `GoldCheck` grid inside More (import from `WelcomeArrange.tsx`, or move `GoldCheck` to `components/ui/`).
5. Replace the portrait checkbox with the 🖌 badge.
6. `LevelScales`: in icons mode, render consecutive scales as one group with one toggle (the same grouping `scaleNode` already does for bars).
7. Footers: add a header `⋯` menu (Template, Matrix, Delete), drop Cancel when × is visible, move "Saved ✓" beside the heading, and remove the in-field green tick.
8. XP panel: coins stepper and its note on one row; match the field max to the slider max.
9. Later: the editor's gear arranges the editor in place (show/hide parts, drag between the main list and More), per the Oct 30 rule, instead of opening `menus.quest-editor`.

### 5. What NOT to change
- Portrait left, title right.
- The chip row with one panel open at a time.
- Autosave when editing, and the confirmation before leaving.
- Saving drafts.
- Ctrl/⌘+Enter.
- "Already done" stays quiet so it's never mistaken for Create.
- Templates and Quick set.
- The steps list itself.
- The CreateSheet kind tabs and its tail.
