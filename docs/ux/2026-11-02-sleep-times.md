# Sleep times and the welcome screen: three-team synthesis (Nov 2)

Source: the owner's iPhone recordings (Chrome on iOS, 390px), Nov 2. The owner wrote: "So. Many. Display. Issues. Lag. Resizing. Jumpiness…" and "Obvs the sleep and wake time should display on the same line, and the input should be way smoother."

## Sleep and wake times

All three teams agreed:

- **One line.** It reads 🌙 time, then a stretching arrow with the time slept on it ("7h 15m"), then ☀ time.
  - The tokens are 36px tall and at least 100px wide. Times are in 15px display type, with am/pm at 11px.
  - The "Slept" and "Woke" labels are gone. On the welcome screen the "Last night" title is gone too (`heading={false}`), because the Sleep button already says it.
  - When no time is set, the tokens read "bedtime" and "wake time" in soft italics, and the arrow is dashed.
- **No popup and no keyboard: a time ruler opens in place** (`xp/TimeRuler.tsx`).
  - It slides open as a fold under the line, with ticks every 5 minutes, 12px apart, under a fixed gold needle.
  - Swiping uses the phone's own momentum and snapping. Tapping a tick glides there. On a computer, a mouse can drag it, the wheel turns it, ← → move 5 minutes (with Shift, an hour), and typing digits sets a time ("1045").
  - Ranges: bedtime 6 pm–6 am, wake 2 am–2 pm, any other time 24 hours.
  - It opens centred on the time (or 10:30 pm or 7 am) and only changes once you touch it.
  - Tapping the other token switches rulers. Tapping the open token, Done, Esc or anywhere outside the card closes it.
  - Its foot has Clear (once set), Type (keys a time in, inside the card, for the owner's earlier note 0be9b53e) and Done.
- **Save ✓** sits at the bottom right of the Sleep part once something has changed (note dd8690bf). It saves now, folds the part, and the Sleep button stamps ✓.
- **Folded preview** (note cb22d80e): the Sleep button reads "Sleep · 10:45 → 6:00 · Good".

### Causes of jank the teams found, and what was done

- The popup dial re-keyed its fields on every value (`key={h…}`), which rebuilt them mid-typing and dropped the keyboard. They are now controlled inputs, a fix that applies everywhere the dial is still used.
- The dial re-placed itself on every resize, and Chrome on iPhone shrinks the height while the keyboard is up. It now re-places only when the width changes.
- The card's `fitIn` and the toucan's `fit` also ran on height-only resizes. That pulled the card's spot up for good and dropped the toucan onto the card. Both now run only when the width changes.
- The tab crash at the end of the recording isn't explained by the code. The resize storm above is the likely suspect. Re-test on the phone.

The other users of the popup dial (hindrance times, other nights, the quest editor, habit editor and the toucan's panels) keep it, with the fixes above.

## Welcome screen (same day, from the earlier synthesis)

- Toucan:
  - He is placed once, never because his bubble resized.
  - × closes his saying.
  - ‹ › sit as one gilded coin under his feet.
  - Rating is by long press or right-click.
  - The respond line is centred and overlaps the bubble by 25%, gold while idle and off-white while typing.
- Feedback button: full size, in the sky at the top right, while the welcome screen is up. It isn't shrunk or greyed like it is over popups.
- Arranging the screen:
  - Each part is a slim row (name, a few words, ✎, eye), and tapping it opens its options under it.
  - On a phone, holding a part (280ms) lifts it, and only the card scrolls while dragging.
  - A long press on a part (phones) opens arranging with that part's options open, and so does "Arrange this screen" in the toucan's menu.
- Greeting and wise line on phones: their ✎ and thumbs show once you tap the words.
- The card rises out of the mist in 0.7s with no scale (it was 1.6s plus a delay, scaled).
