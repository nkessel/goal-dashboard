# Toucan bubble controls — three-team synthesis (Oct 31)

Owner asks: respond text smaller; ‹ › as one gilded circle split in two; field never resizes on tap, grows taller only.

**All three agreed:** field fixed 168px wide, 22px at rest, grows down a line at a time (cap ~4 lines, then scrolls); real 16px text drawn at 0.8125 scale inside a box sized to what you see (iPhone won't zoom; no `maximum-scale`); placeholder "Respond…" italic #a08a5c; focus is a ring only (box-shadow); one 26px gilded coin split by a hairline, each half its own button with a bigger invisible tap area, only the pressed half sinks; send is a gilded coin that doesn't cover the text.

**Taken from one team:** `enterKeyHint="send"`, Esc clears (thumb-first). Not yet built: coin tilt toward the pressed side and a toucan nod on send (game-feel), the sending spinner (calm-craft).
