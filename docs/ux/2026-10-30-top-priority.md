# Top priority display: three-team synthesis (Oct 30)

Owner: "lines are not separated, spillover text doesn't continue on the next line, and the font size and styling seems off."

**Cause:** the saved `<p>` sat in an `items-center` flex column with no word breaking, so a long word or link set its width and it ran off both card edges; `setTopPriorityAction` also turned newlines into spaces and cut at 200 characters (the box allows 400).

**All three teams agreed (built):**
- Keep line breaks on save (spaces tidied within each line), cap 400 to match the box.
- Each line you write is its own item; with several, a small gold ◆ marks each, hanging indent.
- Left-aligned, `font-display` 17px medium, `overflow-wrap:anywhere`, in a soft parchment box with a gold hairline.
- "Change" link gone: a ✎ at the label row's right, and the whole box taps to edit (44px+ target).
- Secondary priorities as a list under "When there's space" (not italic, not joined with ·).
- The toucan reads multi-line priorities joined with "; ".

**Split, resolved:** label stays centered (Calm Craft, Game Feel) rather than left (Thumb First); ◆ bullets (2 of 3) over a left gold rule.
