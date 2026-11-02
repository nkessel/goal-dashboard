# UI check

An automated walk through the app that looks for the layout bugs the owner used to find by screen-recording: things running off the screen, floating things sitting on buttons, text cut off, the keyboard hiding a field, screens that jump. **Run it before every push to `main` that changes what's on screen** (see `CLAUDE.md`).

```
npm run ui-check                                   # build + full walk, ~10–15 min
npm run ui-check -- --no-build                     # reuse the last ui-check build
npm run ui-check -- --no-build --only evening,today --devices phone --times evening
```

Then read `ui-check-out/report.md` (git-ignored). Every step has a screenshot in `ui-check-out/shots/`, with the problems boxed: red = error, orange = warning. A step whose page had to be scrolled to the bottom to show a problem gets a second `…-bottom.png`.

Exit code 1 means there are errors not in `scripts/ui-check/known-issues.json`.

## How it works

- `scripts/ui-check/fake-db.mjs`: an in-memory stand-in for Supabase's REST API. It reads the tables' columns and defaults from `supabase/migrations/*.sql` and answers what supabase-js sends (selects with simple embeds, the filters the app uses, order/limit/range, single, count, insert/upsert/update/delete; rpc returns null). Anything it can't answer is listed under "Check limitations" in the report. Writes stay in memory; `POST /__reset` reseeds (each flow starts fresh).
- `scripts/ui-check/fixtures.mjs`: the test account's data (long titles, due dates, habits, import cards, a friend). Dates are relative to now. Add rows here when a screen needs data to show.
- The app is built with `next build --webpack` pointing at the fake database, started with `next start`, and signed in with a session cookie minted for the test account (`next-auth/jwt` `encode`, a throwaway secret). No real database, Google account or secret is involved.
- Morning and evening: the server and browser run in a time zone where it's about 8:30 or 20:45 right now (`Etc/GMT±N`), so the welcome screen's greeting and the evening routine show as they would then.
- Devices: phone 390×844 (touch), the same phone with a simulated iPhone keyboard (the visual viewport shrinks by 336px and fires its resize/scroll events, which is what the app listens to), tablet 820×1180.
- `scripts/ui-check/flows.mjs`: the walk. Each flow opens a screen, opens and closes its parts, types in fields, and calls `check()` at each state. **Add new screens and sections here.**
- `scripts/ui-check/audit.mjs`: the checks, run inside the page.

## What it flags

| Kind | Severity | Meaning |
|---|---|---|
| `page-scrolls-sideways` | error | The page is wider than the screen. |
| `off-screen-edge` | error | Text or a control past the left/right edge, or a floating popup/bubble past the top/bottom (and not inside something that scrolls). |
| `clipped` | error (control) / warn (text) | Partly cut off by a box with `overflow: hidden`. |
| `text-cut` | warn | Text wider than its box with no "…". |
| `floating-overlap` | error | Two separate floating layers (toucan, bubble, feedback button, + button, sheets) on top of each other where scrolling can't separate them. |
| `covered-by-bar` | error | A fixed or sticky bar/button sits on content even at the end of the scroll (it can never be reached). |
| `popup-behind` | error | A popup or menu drawn underneath the page around it (e.g. a menu inside a bar that the next section paints over). |
| `covered` | warn | Something positioned (the perched bird, a bubble) sits on a control or text. |
| `field-under-keyboard` | error | The field being typed in is behind the (simulated) keyboard or above the screen. |
| `under-keyboard` | warn | A control in a non-scrolling floating layer is behind the keyboard. |
| `moved-on-tap` | error / warn | What you tapped jumped (>6px) or bounced afterwards: the whole screen re-laid out. Steps that are meant to move pass `expectMove`. |
| `layout-shift` | error (>0.08) / warn | The page jumped with no tap (late content pushing things down). |
| `not-restored` | warn | Opening and closing a section left the rest of the screen somewhere else. |
| `console-error`, `page-error`, `server-error` | error | Includes React hydration errors (#418) and 5xx responses. |
| `step-skipped`, `tap-failed` (optional step) | info | The walk couldn't find something: update `flows.mjs` if the screen changed. |

## False alarms

Add an entry to `scripts/ui-check/known-issues.json`, with a reason:

```json
[{ "match": "welcome\\|covered\\|.*owl-perch", "why": "the snowy owl perches on cards on purpose" }]
```

`match` is a regular expression tested against `screen|kind|target|detail`. Keep the list short; fix real problems instead.

## What it can't see

- iOS Safari itself: the real keyboard's panning, the address bar resizing, rubber-band scrolling. Still check keyboard work on a real iPhone when it matters, and say so.
- The owner's real data (very long lists, real portraits, Google Calendar events).
- Server actions that call outside services (AI, Google, email) fail quietly here.
- Animation smoothness (it measures jumps, not frame rate).
