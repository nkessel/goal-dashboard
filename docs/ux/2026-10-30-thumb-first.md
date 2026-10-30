# Thumb First review: welcome screen and quest editor (2026-10-30)

Team: Thumb First (mobile ergonomics, speed, accessibility). Evidence comes from the 390 px and 1400 px screenshots plus the code. Nothing in the code was changed.

## 1. Verdict

- **Welcome screen:** the look is right, but the card behaves like three separate forms. It has three Save buttons, and the big bottom button says "Complete check-in" but **throws away** a typed priority or intention that wasn't saved first. Its main job (the check-in) starts folded, and the settings mode doubles every label.
- **Quest editor:** the most common need (a due date) sits **four taps deep**, behind a chip called "Time". The footer scrolls away and has three to four competing buttons. Settings that are only on or off are spread over five lines as tiny browser checkboxes.
- Both screens use touch targets of 24–32 px, below the 44 px minimum, and gold caps labels at 4.2:1 contrast, which fails WCAG AA at 11–12 px.

## 2. Top problems (ranked)

1. **Data loss on the welcome card.** The bottom button only submits the check-in (`WelcomeCard.tsx:393`). `TopPriority` and `Intention` each save only through their own Save button (`:665`, `:711`). If you type a priority and tap "Complete check-in", the priority is gone.
2. **The label doesn't match what happens.** "Complete check-in" shows whenever the check-in part exists (`:394`), even when it was never opened. Tapping it then saves nothing.
3. **Due date buried in the editor.** To set one: tap the Time chip, then "Add to calendar" (`QuestEditorDialog.tsx:1118`), then the Scheduling fold, then the Due field (`:1167`). The chips also show values without names: "Additional" really means *Shows in*, "Time" is empty, and "0 XP" says nothing. Each chip's panel opens under the whole row, away from the chip.
4. **The editor footer is not pinned.** `.qe-actions` (`:2443`) sits inside the scrolling `.qe-body`. With Advanced open on a phone, the Create button scrolls out of view. On phones the dialog is also centred (`:2076` `items-center`), so × and the title sit at y≈220 and the primary button lands mid-screen.
5. **Too many footer buttons.** When creating: Cancel (which repeats ×), Create quest, and Already done, a dashed button kept on purpose because people hit it by accident. When editing: Delete, "✓ Saved", Complete and Done.
6. **On/off settings spread over many lines.** "Paint a portrait" / "Tiny task" are 14 px native checkboxes with 11.5 px text under the portrait (`:2203`, `:2228`), and Tiny is duplicated as the 🌱 header button (`:971`). Private, Not actionable and Stands-for are each a checkbox on a line of their own (`:1978`, `:1402`, `:1927`).
7. **Four identical style toggles.** In icon mode `scaleNode` returns `[k]` (`:1008`), so every scale gets its own LevelScales and its own "ılıl" toggle. Product taste says one toggle beside the group. The icon targets are about 26 px, and empty icons sit near 1.8:1 contrast.
8. **Small targets.** EditButton is 24 px (`WelcomeArrange.tsx:124`), the gear 30 px (`WelcomeCard.tsx:258`), the wise-line thumbs 28 px (`:511`), the snooze pills and "Other priorities" 32 px, and the hours stepper ± 28×32 (`WelcomeArrange.tsx:59`).
9. **A long sentence splits the stepper.** In "When it opens" the hours stepper sits inside a sentence. On a phone "away" wraps onto its own line (welcome-settings-phone.png): +/− separated by a long sentence, exactly the owner's complaint.
10. **Arrange mode wastes height.** Each part shows a caps header ("YOUR TOP PRIORITY ✎") above its own question ("What are your top priorities today?"), so it reads the same thing twice. There are three exits (the top Done, the bottom Done, the ✓ on the gear). Hidden parts take a 40 px dashed row each.
11. **The check-in sliders are short.** In `simple` mode the check-in still reserves a 58 px Save/Remove column (`EnergyCheck.tsx:477`, `:512`), so the track is about 100 px on a phone. "Energy" is capitalised and "mood" is not.
12. **The reward block is tall.** The streak, the wise line, the bar and caption, the 34 px "+10 XP" and the coins take about 190 px, which pushes the main button down.
13. **Inconsistent names.** "Other priorities" / "Secondary Priorities" / "Also, when there's space"; "Add tasks" / steps; "Add to calendar" / "Scheduling" / "Calendar".
14. **Contrast.** The gold caps labels `#8a6116` measure 4.23:1 on parchment. Placeholders and the Hindrances label (sleep) are below 3:1.

**Steps for the top tasks**

| Task | Now | Proposed |
|---|---|---|
| Welcome: energy + mood + priority + go | 6 taps (Check in, 2 sliders, Save, Save, Complete) | 3 |
| New quest: due tomorrow, 15 min | 7 taps (title, Time, minutes, Add to calendar, Due, date, Create) | 4 |
| Edit quest: mark complete | 1 tap (fine) | 1 tap |

## 3. Redesign

### Welcome screen, phone (390 px)

On phones the card sits at the bottom (`items-end`, 12 px plus the safe-area inset), so the primary button lands at y≈790. The toucan and castle stay above it.

```
            🐦 "Shall we plan your day together?"        (⚙) 44px hit
┌────────────────────────────────────────────┐
│        Huzzah! Here you are!  ✎             │ ✎ 24px visual / 44 hit
│ Check in ˄                                  │ fold, open by default
│ Energy  (−) ━━━━━━●━━━━━━━ (+)   6          │ ± 32px visual, 44 hit
│ Mood    (−) ━━━━━━●━━━━━━━ (+)   –          │ full-width track
│ [+ Sleep] [+ Tag / event] [+ Metric]        │ 36px chips, one row
│ What are your top priorities today?         │
│ ┌────────────────────────────────────────┐  │
│ │ What is most important now?            │  │ no Save button
│ └────────────────────────────────────────┘  │
│ + Also, when there's space                  │ text button, left
│ Today is about…                             │
│ [ e.g. Steady and kind to myself        ]   │ no Save button
│ 🔥 8 days · +10 XP · ⊙ +2 coins             │ one 16px line
│ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░  Level 4 · 540 XP to 5    │
│ Breathe. Then the next small thing.  👍 👎  │ 44px hits
│ [☾ Snooze]              [ Save & continue › ]│ 44px, bottom right
└────────────────────────────────────────────┘
```

- **Primary button copy:** "Save & continue ›" once anything is entered, otherwise "Continue to town ›". One tap saves the check-in, the priority with its extras, and the intention, then leaves. If a save fails, the card stays open and shows the error inline.
- **Keys:** Enter in the priority box adds a line break and Enter in the intention moves focus on. Ctrl/⌘+Enter or Ctrl/⌘+S runs the primary button. Tab order is energy → mood → chips → priority → also → intention → primary → Snooze; the greeting ✎ and the thumbs come after.
- **Saved state:** a part that saved shows its value with a quiet "Change" link, as TopPriority already does.
- **Desktop:** same card, still centred vertically. Sliders take ←/→ and the −/+ keys.

### Welcome settings mode, phone

```
┌ Welcome screen ─────────────────────────────┐  panel above
│ Comes back after      (−)  5 hrs  (+)       │ one line; 0 = "First visit only"
│ 🎉 Confetti  [On]          Castle [✦ New]   │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ Huzzah! Here you are!  ✎                    │
│ ┌ Check in ✎                         [hide] ┐│ the part's own title + ✎
│ ┌ What are your top priorities today? ✎ [hide]┐ no caps duplicate
│ ┌ Today is about… ✎                  [hide] ┐│
│ ┌ STREAK                             [hide] ┐│ caps label only where the
│ │ 🔥 8 days                                 ││ preview has no title
│ Hidden:  [+ XP bar] [+ Due soon]            │ chips, one wrapped row
│                                  [ Done ✓ ] │ the single exit, thumb zone
└─────────────────────────────────────────────┘
```

Remove the Done in the top panel; the ✓ on the gear stays as the mirror of the gear. Parts still drag by the whole item (dnd-kit, as now).

### Quest editor, phone: a bottom sheet with a pinned header and footer

```
┌ New quest                     📜 Templates  ✕ ┐ sticky, 48px
│ ┌────┐ Quest title_________________________  │ portrait 60px
│ │ ✓  │ Description (optional)                │
│ └────┘                                       │
│ [🌱 Tiny] [🎨 Paint portrait] [🔒 Private]    │ toggle pills, 36px, one row
│ Shows in [ Today | Additional | Backlog ]    │ 44px segmented
│ Due      [Today] [Tomorrow] [Sat] [📅 Pick…] │ chips; set → "Fri 31 Oct ×"
│ Time     (−)  30 min  (+)      ✦ 30 XP ✎    │ ±5 min; XP follows minutes
│ Board    [No board ▾]   Tags [+ tag]         │
│ › More   steps, sequence, calendar time, …   │ summary of what's set
├──────────────────────────────────────────────┤ pinned footer + safe area
│ ☐ Already done            [ Create quest › ] │ the checkbox relabels the
└──────────────────────────────────────────────┘ button: "Create & complete ✓"
```

- **Inside "More"**, in this order: Steps ("Steps", replacing "Add tasks"); Calendar (due time, Find a time, scheduling list); Sequence; Scales, as **one** group with one style toggle and 36 px rows; Priority Matrix + Not actionable on one line; Stands for + Also on; Progress; Save as a template.
- **Edit footer:** `[⋯]` (Delete, Save as a template, Undo completion; also opens on right-click), then `[✓ Complete]` and `[Done]`. The saved state stays as the green tick in the title field, so the "✓ Saved" text goes.
- **Keys:** Title → Description → Shows in (one tab stop, arrow keys) → Due (one tab stop, arrow keys) → minutes (↑/↓ = ±5) → XP ✎ → Board → Tags → More → toggles → Already done → Create. Ctrl/⌘+Enter or Ctrl/⌘+S saves from anywhere, and the button tooltip says "Create (Ctrl+Enter)". Esc closes, with the draft kept as now.
- **Keyboard on phones:** the sheet must not move when the keyboard opens. Scroll the focused field into view inside the body only.
- **Desktop:** a centred dialog of max-w-md, with the same pinned footer.

## 4. Implementation list (ordered; each item ships alone)

1. **WelcomeCard.tsx: one commit for the card.** Hold the TopPriority and Intention drafts in the parent (pass `value`/`onChange` or a `submit` ref like the check-in already uses). The bottom button awaits all of them, then `leave()`. Remove both Save buttons. Change the label logic and add Ctrl+Enter / Ctrl+S.
2. **Hit areas, no visual change.** Add `relative before:absolute before:-inset-[10px]` to `EditButton` (WelcomeArrange.tsx), the gear and `LineVote` (WelcomeCard.tsx). Raise the snooze pills and "Other priorities" to `h-10`, and the hours stepper ± to `w-11 h-10`.
3. **EnergyCheck.tsx in `simple` mode.** Drop the 58 px column (`:471–481`, `:512`) and put −/+ right beside each slider; this also covers the pending "check-in slider +/- buttons" feedback. Show metric names in Title Case.
4. **WelcomeCard.tsx.** Open the check-in by default on the day's first visit and keep the fold state in localStorage (wrapped in try/catch).
5. **Phones: anchor the card to the bottom.** Use `items-end sm:items-center` on the overlay (`:230`) plus `pb-[max(12px,env(safe-area-inset-bottom))]`.
6. **Compact reward.** `streak` and `reward` each become a single 16 px line (XP at 22 px, coins inline). Keep them as separate parts so stored orders still work.
7. **TopPriority.** The floating "Other priorities" pill becomes a left-aligned text button, "+ Also, when there's space". Use the same words as the heading inside it.
8. **WelcomeArrange.tsx.** Make "When it opens" one line, with the label left and the stepper right; remove the top Done; parts whose preview already has a title use it with ✎ beside it; hidden parts become a row of chips; `GOLD` changes to `#74500f` (≥4.5:1).
9. **QuestEditorDialog.tsx: pin the footer.** Move `.qe-actions` out of `.qe-body` to a sibling with `border-t` and safe-area padding. On phones the overlay becomes `items-end p-0 sm:items-center sm:p-4` with a rounded top only.
10. **Footer cleanup.** Create: remove Cancel; "Already done" becomes a `GoldCheck` that relabels the primary button. Edit: a `⋯` menu for Delete, Template and Undo; remove the "✓ Saved" text.
11. **Toggle row.** Replace the checkboxes under the portrait (`:2201–2232`), the 🌱 header button (`:971`) and Private (`:1978`) with one row of pills. Show the "Templates" label on phones (`:987` is `sr-only` now).
12. **Due on the surface.** Add `"due"` to `EditorPart` / `EDITOR_PARTS` in `quest-editor-layout.ts`. Bump `v` to 3 and have `clean()` insert it after `showsIn`. Quick chips set `dueDate`, and `DateField` opens from "Pick…". Due time stays in More › Calendar.
13. **Labelled rows instead of fact chips.** Shows in, Due, Time (−/+ stepper beside the number; XP shown beside it with ✎ opening the XP panel inline), and Board + Tags on one row. Remove `FACT_KEYS` panels.
14. **Scales.** In icon mode, group neighbouring scales the way bars mode does (`:1008`), so there is one toggle. Rows become 36 px and empty icons go to ≥3:1.
15. **"Advanced settings" becomes "More"**, with a summary line of what's set ("Importance 2 · Urgency 3 · 4 steps"). Steps, Sequence and Calendar move inside it.
16. **CreateSheet.tsx.** Its Ctrl+Enter handler stays. Check that the toolbar row (🌱 moved out) still reads well, and add the "(Ctrl+Enter)" tooltip.

## 5. What NOT to change

- The parchment, gold and forest look; the mist scene, castle and toucan; the confetti; the serif headings.
- Settings in context: ✎ beside each part, hide at the top right, drag the whole item with dnd-kit's distance/delay activation (no grips, no arrows), and fine settings also listed in Settings.
- The quest editor's per-browser layout setting (order and folding). Only the defaults change (v3).
- Autosave while editing, the green tick in the title, drafts on close, and no autofocus on phones (it prevents the keyboard jump).
- Snooze spreading its times in a line, and the Due soon gilded button opening its drawer.
- No counters such as "0/3" anywhere; the summary line for "More" lists what's set, never what's missing.
- `NightFields` time tokens and the dial. Only raise the Hindrances label and "Edit the lists" to ≥4.5:1 and make the chips 36 px.
