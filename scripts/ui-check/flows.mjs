// The walk the UI check takes. Each flow visits a screen and opens/closes its
// parts; `h.check(label)` audits and screenshots. When you add a screen or a
// section, add it here (that's how the next thread's check covers it).
//
// Helpers (see run.mjs):
//   h.goto(path, { welcome })   welcome: true shows the day's welcome screen
//   h.check(label)              audit + screenshot (also at the bottom of the page)
//   h.tap(target, label, { optional, expectMove })
//   h.toggle(target, label, { closeWith, inside })  open, check, close, compare
//   h.typeIn(target, label)     focus + simulated iPhone keyboard (phone) + type
// target: a RegExp (button name), "text=…", "css=…", or (page) => locator.
// Taps marked optional are skipped quietly when the thing isn't there.

const esc = async (h) => {
  await h.page.keyboard.press("Escape");
  await h.settle(500);
};

export const FLOWS = [
  {
    name: "welcome",
    async run(h) {
      await h.goto("/", { welcome: true, name: "welcome" });
      await h.check("shown");
      // He's quiet on arrival (owner, Nov 4 and Nov 6): no saying until he's tapped.
      await h.settle(3400);
      const early = await h.page.locator(".toucan-bubble").count();
      if (early) throw new Error(`toucan: he spoke on arrival (${early} bubble), he should wait to be tapped`);
      await h.tap(/^the toucan:/i, "toucan tapped: his saying", { optional: true });
      // Right-click a part's button to shape it (words, icon, XP), folding open under it (owner, Nov 6).
      const sleepBtn = h.page.getByRole("button", { name: /^sleep/i }).first();
      if (await sleepBtn.count()) {
        await sleepBtn.click({ button: "right" });
        await h.settle(500);
        if (!(await h.page.locator("[data-button-editor]").count())) throw new Error("welcome: right-clicking the Sleep button didn't open its editor");
        await h.check("button editor");
        await h.page.locator("[data-button-editor]").getByRole("button", { name: /^done$/i }).click();
        await h.settle(500);
      }
      await h.toggle(/emotional check-in/i, "emotional check-in");
      await h.toggle(/^sleep/i, "sleep");
      // Sleep and wake on one line; each opens its time ruler right under it (no popup, no keyboard).
      await h.tap(/^sleep/i, "sleep open", { expectMove: true });
      await h.tap(/last night.s sleep time:/i, "bedtime ruler", { optional: true, expectMove: true });
      await h.check("bedtime ruler");
      await h.tap(/this morning.s wake time:/i, "wake ruler", { optional: true });
      await h.check("wake ruler");
      await h.tap((p) => p.getByRole("button", { name: /^type$/i }).first(), "type a time", { optional: true });
      await h.check("typing a time");
      await esc(h);
      await h.tap((p) => p.getByRole("button", { name: /^done$/i }).first(), "ruler done", { optional: true, expectMove: true });
      await h.tap(/^sleep/i, "sleep close", { expectMove: true });
      await h.toggle(/^habits/i, "habits");
      // The Dawn path (owner, Nov 9): stones, Short on time, the offering card, its gear.
      if (await h.page.locator(".dawn-sky").count()) {
        await h.check("dawn path");
        await h.tap((p) => p.locator("[data-stone]").nth(1), "dawn: tick a stone", { optional: true });
        await h.tap((p) => p.getByRole("button", { name: /short on time/i }).first(), "dawn: short on time", { optional: true });
        await h.check("dawn path ticked, short");
        // Its title renames in place (owner, Nov 10).
        if (await h.tap((p) => p.getByRole("button", { name: /morning routine/i }).first(), "morning routine: rename", { optional: true })) {
          await h.check("morning routine title editing");
          await h.page.keyboard.press("Escape");
        }
        if (await h.tap((p) => p.getByRole("button", { name: /choose which parts you use/i }).first(), "dawn: gear", { optional: true, expectMove: true })) {
          await h.settle(500);
          await h.check("dawn settings");
          await h.tap((p) => p.getByRole("button", { name: /close the settings/i }).first(), "dawn: gear shut", { optional: true, expectMove: true });
        }
        if (await h.tap((p) => p.getByRole("button", { name: /choose today.s stones|change today.s stones/i }).first(), "dawn: choose stones", { optional: true, expectMove: true })) {
          await h.tap((p) => p.locator(".dawn-sky").locator("xpath=..").getByRole("button", { name: /＋ more/i }).first(), "dawn: more ideas", { optional: true, expectMove: true });
          await h.check("dawn: choosing stones");
          await h.tap((p) => p.getByRole("button", { name: /done choosing/i }).first(), "dawn: done choosing", { optional: true, expectMove: true });
        }
      } else throw new Error("welcome: no Dawn path");
      // Top priorities sit behind the Journal button, its first pill (owner, Nov 6).
      await h.tap((p) => p.locator("button[aria-expanded]", { hasText: /journal/i }).first(), "journal open", { expectMove: true }); // the check-in's "✎ Journal" button shares the name
      await h.check("journal open");
      await h.tap((p) => p.getByRole("tab", { name: /morning pages/i }).first(), "morning pages pill", { optional: true });
      await h.typeIn((p) => p.getByPlaceholder(/write here/i).first(), "morning pages");
      await h.tap((p) => p.getByRole("tab", { name: /top priorities/i }).first(), "top priorities pill", { optional: true });
      await h.typeIn((p) => p.getByPlaceholder(/most important/i).first(), "top priority");
      await h.toggle(/other priorities/i, "other priorities");
      await h.toggle(/choose today.s quests/i, "choose today's quests");
      await h.typeIn((p) => p.getByPlaceholder(/respond/i).first(), "toucan respond");
      // The toucan dragged to the right edge: his bubble must stay on screen.
      await h.page.evaluate(() => {
        try {
          localStorage.setItem("welcome-toucan-at", JSON.stringify({ x: window.innerWidth - 40, y: 120 }));
        } catch {}
      });
      await h.goto("/", { welcome: true, name: "welcome-toucan-right" });
      await h.check("toucan at right edge");
      await h.tap(/^the toucan:/i, "toucan saying", { optional: true });
      await h.tap(/^the toucan:/i, "toucan menu", { optional: true });
      await h.check("toucan menu");
      await esc(h);
      // × must close his saying (owner, Nov 2: "closing the toucan phrase isn't working"): fail the check if it stays.
      if (await h.tap(/close what he.s saying/i, "close his saying", { optional: true, expectMove: true })) {
        await h.settle(400);
        const still = await h.page.locator(".toucan-bubble").count();
        if (still) throw new Error(`toucan: his bubble is still there after × (${still})`);
      }
      await h.check("toucan bubble closed");
      // Right-click (a hold on phones) on the Habits button opens its editor: words, icon, which habits (owner, Nov 9).
      {
        const hb = h.page.locator("[data-welcome-root] button[aria-expanded]", { hasText: /habits/i }).first();
        if (await hb.count()) {
          await hb.click({ button: "right" }).catch(() => {});
          await h.settle(450);
          await h.check("habits button editor");
          await hb.click({ button: "right" }).catch(() => {});
          await h.settle(300);
        }
      }
      // His bubble in the spirit's glow, words first (owner, Nov 10: choose the design and interaction styles).
      await h.page.evaluate(() => {
        localStorage.removeItem("welcome-toucan-at");
        localStorage.setItem("toucan-bubble-look", "spirit");
        localStorage.setItem("toucan-bubble-way", "quiet");
      });
      await h.goto("/", { welcome: true, name: "welcome-toucan-spirit" });
      await h.tap(/^the toucan:/i, "toucan saying (spirit, words first)", { optional: true });
      await h.check("toucan spirit bubble, words first");
      await h.tap(/^respond to him/i, "toucan: show the respond line", { optional: true });
      await h.check("toucan spirit bubble, respond line");
      await h.page.evaluate(() => {
        localStorage.setItem("toucan-bubble-look", "parchment");
        localStorage.setItem("toucan-bubble-way", "full");
      });
      await h.goto("/", { welcome: true, name: "welcome-toucan-full" });
      await h.tap(/^the toucan:/i, "toucan saying (everything showing)", { optional: true });
      await h.check("toucan bubble, everything showing");
      await h.page.evaluate(() => {
        localStorage.removeItem("toucan-bubble-look");
        localStorage.removeItem("toucan-bubble-way");
      });
      await h.goto("/", { welcome: true, name: "welcome" });
      await h.tap(/welcome screen settings/i, "arrange welcome", { expectMove: true }); // the "when it opens" panel appears above
      await h.check("arranging");
      await h.tap(/^edit habits/i, "arrange: habit options", { optional: true, expectMove: true });
      await h.check("arranging: habit options");
      await h.tap(/done arranging/i, "done arranging", { expectMove: true });
      await h.tap(/complete check-in/i, "complete check-in", { expectMove: true }); // the card dives away
      await h.settle(2500);
      h.screen = "today-after-welcome";
      await h.check("after check-in");
    },
  },
  {
    name: "today",
    async run(h) {
      await h.goto("/", { name: "today", reset: true });
      await h.check("loaded");
      await h.toggle(/due soon/i, "due soon");
      // Due soon's reach picker (the owner's recording, Nov 1: it opened underneath Daily Habits).
      if (await h.tap((p) => p.getByRole("button", { name: /counting quests due/i }).first(), "due soon reach", { optional: true })) {
        await h.check("due soon reach picker");
        await esc(h);
      }
      await h.toggle(/additional quests/i, "additional quests");
      await h.toggle(/daily habits/i, "daily habits");
      // The Check in button folds away as the check-in opens, so it's closed with its ×.
      await h.tap(/^check in/i, "open check-in", { expectMove: true });
      await h.check("check-in open");
      await esc(h);
      // A quest card's board tag opens the board right there: what's on it, and "See quest in board" (owner, Nov 12).
      if (await h.tap((p) => p.locator("[data-board-tag]:not([disabled])").first(), "card: board tag", { optional: true, expectMove: true })) {
        await h.settle(700);
        await h.check("quest card: board popover");
        await esc(h);
      }
      // Quest editor from the first quest card.
      if (await h.tap("text=Pick up medication", "open quest editor", { expectMove: true })) {
        await h.check("quest editor");
        // The board tag on the portrait opens the board picker under it (owner, Nov 12).
        if (await h.tap((p) => p.locator("[role=dialog] [data-board-chip]").first(), "editor: board tag", { expectMove: true })) {
          await h.settle(500);
          await h.check("quest editor: board picker");
          await h.tap((p) => p.locator("[role=dialog] [data-board-chip]").first(), "editor: board picker shut", { optional: true, expectMove: true });
        }
        // The XP amount: no box; tapping it selects and pulses the number, with a gold bar for a cursor (owner, Nov 9).
        if (await h.tap((p) => p.locator("[role=dialog] button", { hasText: /^\W*\d+ XP/ }).first(), "editor: XP pill", { optional: true, expectMove: true })) {
          if (await h.tap((p) => p.getByLabel("XP amount").first(), "editor: XP amount", { optional: true })) await h.check("quest editor: XP typed");
          await h.tap((p) => p.locator("[role=dialog] button", { hasText: /^\W*\d+ XP/ }).first(), "editor: XP pill shut", { optional: true, expectMove: true });
        }
        // The extra pills (no "More" fold): open the scales, then the due panel with scheduling and early bonus.
        if (await h.tap((p) => p.getByRole("button", { name: /importance & effort/i }).first(), "editor: scales pill", { optional: true, expectMove: true })) await h.check("quest editor: scales");
        // The due pill reads "Due today", "Due Fri · Thu 3pm" or "Due date".
        if (await h.tap((p) => p.locator("[role=dialog] button.qe-fact", { hasText: /^(Due|Plan:)/ }).first(), "editor: due", { optional: true, expectMove: true })) {
          await h.check("quest editor: due panel");
          // The month calendar (owner, Nov 7: "the due date picker isn't working"; it opened off screen in the adventure theme).
          if (await h.tap((p) => p.locator('[role=dialog] button[aria-label="Due date"]').first(), "editor: due date calendar", { optional: true, expectMove: true })) {
            await h.check("quest editor: due date calendar");
            const cal = h.page.locator('[role=dialog][aria-label="Due date"]').last();
            const box = await cal.boundingBox().catch(() => null);
            const vh = h.page.viewportSize()?.height ?? 844;
            if (!box || box.y < 0 || box.y + box.height > vh + 1) throw new Error(`quest editor: the due date calendar isn't on screen (${JSON.stringify(box)})`);
            await cal.locator("button", { hasText: /^20$/ }).first().click();
            await h.settle(300);
          }
          // The day drawn in place to find a time (no popup).
          if (await h.tap((p) => p.locator("[role=dialog] button", { hasText: /^(Find a time|Change)$/ }).first(), "editor: find a time", { optional: true, expectMove: true })) await h.check("quest editor: find a time");
        }
        await h.typeIn((p) => p.locator("[role=dialog] input, [role=dialog] textarea").first(), "quest editor title");
        // The portrait picker with the keyboard up: it sits above the keyboard (owner's recording, Nov 3).
        if (await h.tap((p) => p.getByTitle("Change the portrait").first(), "portrait picker", { optional: true, expectMove: true })) {
          await h.check("portrait picker");
          await h.typeIn((p) => p.getByPlaceholder(/describe the portrait/i).first(), "portrait description");
          await h.page.keyboard.press("Escape");
          await h.settle(300);
        }
        await h.tap(/^close$|^×$/i, "close quest editor", { optional: true });
        await esc(h);
      }
      // A habit with sub-habits: tapping its card shows them inside the card (owner, Nov 2).
      // (Daily Habits is already open from the toggle above; tapping its header again would close it.)
      await h.tap(/^daily habits/i, "open daily habits", { optional: true, expectMove: true });
      await h.page.getByText("Vitamins before 12pm").first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
      await h.settle(300);
      if (await h.tap("text=Vitamins before 12pm", "habit sub-habits", { optional: true, expectMove: true })) {
        await h.check("habit sub-habits open");
        await h.tap("text=Vitamins before 12pm", "habit sub-habits close", { optional: true, expectMove: true });
      }
      // Schedule a quest from its ⋯ menu: the day drawn, tap a time (repeat ask 10).
      if (await h.tap((p) => p.getByRole("button", { name: /^quest actions$/i }).first(), "quest menu for schedule", { optional: true })) {
        if (await h.tap((p) => p.getByText(/^(re)?schedule…$|^(re)?schedule on calendar$/i).first(), "schedule picker", { optional: true, expectMove: true })) {
          await h.settle(1200);
          await h.check("schedule window");
          await h.tap((p) => p.locator("[aria-label^='Your ']").first(), "pick a time", { optional: true });
          await h.check("schedule window: red line on the time");
          await esc(h);
        } else await esc(h);
      }
      // A quest's ⋯ menu.
      if (await h.tap((p) => p.getByRole("button", { name: /^quest actions$/i }).first(), "quest menu", { optional: true })) {
        await h.check("quest menu");
        await esc(h);
      }
      // Snooze from a quest's ⋯: a small menu beside the card (1 hour, Tomorrow, Other; owner, Nov 4).
      if (await h.tap((p) => p.locator("li", { hasText: "Pick up medication" }).getByRole("button", { name: /^quest actions$/i }).last(), "quest menu for snooze", { optional: true })) {
        if (await h.tap((p) => p.getByRole("menuitem", { name: /snooze/i }).first(), "snooze menu", { optional: true, expectMove: true })) {
          await h.check("snooze menu");
          await h.tap("text=Other…", "snooze other", { optional: true, expectMove: true });
          await h.check("snooze menu: other");
        }
        await esc(h);
        await esc(h);
      }
      // Move… on a quest in Today's Quests: Additional Quests or a board, inside the menu (owner, Nov 4).
      if (await h.tap((p) => p.locator("li", { hasText: "Pick up medication" }).getByRole("button", { name: /^quest actions$/i }).last(), "quest menu for move", { optional: true })) {
        if (await h.tap((p) => p.getByRole("menuitem", { name: /^move/i }).first(), "move", { optional: true, expectMove: true })) {
          await h.check("move menu");
          if (await h.tap((p) => p.getByRole("menuitem", { name: /quest board/i }).first(), "move to a board", { optional: true, expectMove: true })) {
            await h.settle(600);
            await h.check("move menu: boards");
          }
        }
        await esc(h);
        await esc(h);
        await esc(h);
      }
      // A quest with steps: tapping its card slides the steps tray open under it (repeat ask 9: no overlap).
      if (await h.tap("text=read chapter four", "steps tray", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("steps tray open");
        // Sub-quests in the editor: labelled Done / Share of XP rows, each % typed over in place (owner, Nov 4).
        const editSubs = h.page.getByRole("button", { name: /edit sub-quests/i }).first();
        if (await editSubs.isVisible().catch(() => false)) {
          await editSubs.evaluate((el) => el.click());
          await h.page.waitForTimeout(1500);
          // In the fake database the card can come back closed (a refresh); open the editor from its ⋯ menu instead.
          if (!(await h.page.getByText("Share of XP").count())) {
            await h.page.locator("text=read chapter four").first().click({ button: "right" }).catch(() => {});
            await h.page.waitForTimeout(600);
            await h.page.getByRole("menuitem", { name: /^edit/i }).first().click({ timeout: 3000 }).catch(() => {});
          }
          await h.page.getByPlaceholder(/quest title/i).first().waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
          await h.settle(800);
          await h.page.getByText("Share of XP").first().scrollIntoViewIfNeeded().catch(() => {});
          await h.check("editor sub-quests");
          if (await h.tap((p) => p.getByRole("button", { name: /share of the quest's xp.*tap to change/i }).first(), "type a share", { optional: true })) await h.check("share typed in place");
          await esc(h);
          await esc(h);
        }
        await h.tap("text=read chapter four", "steps tray close", { optional: true, expectMove: true });
      }
      // Log progress from a card (tap its % or "12 of 32 pages"): − / + and a number, in place.
      if (await h.tap((p) => p.getByTitle("Log progress").first(), "log progress", { optional: true, expectMove: true })) {
        await h.check("progress stepper");
        await h.tap((p) => p.getByTitle("Log progress").first(), "close progress stepper", { optional: true, expectMove: true });
      }
      // The compass left of Today's Quests: a focusing question, with Prioritize and Auto-schedule under it (owner, Nov 12).
      const compass = (p) => p.getByRole("button", { name: /^focus: a question/i }).first();
      await h.page.hover("text=Today's Quests").catch(() => {});
      if (await h.tap(compass, "compass", { expectMove: true })) {
        await h.settle(600);
        await h.check("compass: question and tools");
      }
      // Prioritize: today's quests first, one five-part bar, Save, skip by swipe, additional quests behind a button.
      if (await h.tap((p) => p.getByRole("button", { name: /^prioritize$/i }).first(), "prioritize", { expectMove: true })) {
        await h.settle(1200);
        await h.check("prioritize cards");
        await h.tap((p) => p.locator("[data-prioritize-card]").getByRole("button", { name: /add a due or plan-by date|due|plan/i }).first(), "card dates", { optional: true, expectMove: true });
        await h.check("prioritize card dates");
        const bars = h.page.locator("[data-prioritize-card] [data-prioritize-bars]").first();
        if (await bars.count()) {
          const r = await bars.boundingBox();
          // Tap the third part, then Save.
          if (r) await h.page.mouse.click(r.x + r.width * 0.5, r.y + r.height / 2);
          await h.settle(300);
          await h.check("prioritize: 3 of 5 chosen");
          await h.tap((p) => p.locator("[data-prioritize-save]").first(), "save the priority", { optional: true, expectMove: true });
          await h.settle(600);
          await h.check("prioritize: saved, next");
        }
        await h.tap((p) => p.locator("[data-prioritize]").getByRole("button", { name: /^snooze…$/i }).first(), "card snooze", { optional: true, expectMove: true });
        await h.check("prioritize snooze row");
        await h.tap((p) => p.getByRole("tab", { name: /^list$/i }).first(), "prioritize list", { optional: true, expectMove: true });
        await h.check("prioritize list");
        await h.tap((p) => p.locator("[data-prioritize]").getByRole("button", { name: /due and plan-by dates/i }).first(), "list dates", { optional: true, expectMove: true });
        await h.check("prioritize list dates");
        if (await h.tap((p) => p.locator("[data-prioritize-more]").first(), "additional quests", { optional: true, expectMove: true })) {
          await h.settle(400);
          await h.check("prioritize: additional quests");
        }
        await h.tap((p) => p.getByRole("tab", { name: /^cards$/i }).first(), "back to cards", { optional: true, expectMove: true });
        await esc(h);
      }
      // Auto-schedule from the compass: a popup with today's quests, right on Today (owner, Nov 12: not the calendar screen).
      await h.settle(500);
      if (!(await h.page.getByRole("button", { name: /^auto-schedule$/i }).first().isVisible().catch(() => false))) await h.tap(compass, "compass again", { optional: true, expectMove: true });
      if (await h.tap((p) => p.getByRole("button", { name: /^auto-schedule$/i }).first(), "auto-schedule today", { expectMove: true })) {
        await h.settle(2500);
        if (!/^\/($|\?)/.test(new URL(h.page.url()).pathname + "")) throw new Error("Auto-schedule left Today: " + h.page.url());
        await h.check("auto-schedule popup on Today");
        await esc(h);
      }
    },
  },
  {
    // Quests in a sequence: tap one in "Edit the sequence…" to edit it (owner, Nov 3).
    name: "sequence",
    async run(h) {
      await h.goto("/", { name: "sequence" });
      // A sequence: open it from the quest's ⋯ menu and tap the quest waiting behind to edit it (Nov 3).
      if (await h.tap((p) => p.getByRole("button", { name: /^quest actions$/i }).first(), "quest menu for sequence", { optional: true })) {
        if (await h.tap((p) => p.getByRole("menuitem", { name: /sequence/i }).first(), "edit the sequence", { optional: true, expectMove: true })) {
          await h.settle(800);
          await h.check("sequence dialog");
          if (await h.tap((p) => p.locator("[aria-label='Quest sequence']").getByText(/post the reflection link/i).first(), "edit a waiting quest", { optional: true, expectMove: true })) {
            await h.settle(1200);
            await h.check("sequence: waiting quest in the editor");
          }
          await esc(h);
        }
        await esc(h);
      }
    },
  },
  {
    // The habit editor (repeat ask 15).
    name: "habiteditor",
    async run(h) {
      await h.goto("/", { name: "habiteditor" });
      await h.tap(/^daily habits/i, "open daily habits", { optional: true, expectMove: true });
      await h.page.getByText("Gym 🏋️").first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
      await h.settle(300);
      // The habit editor (repeat ask 15): sub-habits in view, dragged to reorder, a dot opens XP/coins/Remove.
      if (await h.tap("text=Gym 🏋️", "habit editor", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("habit editor");
        await h.page.getByLabel("Add a sub-habit").first().fill("Stretch").catch(() => {});
        await h.page.getByLabel("Add a sub-habit").first().press("Enter").catch(() => {});
        await h.settle(300);
        if (await h.tap((p) => p.getByRole("button", { name: /options for stretch/i }).first(), "sub-habit options", { optional: true, expectMove: true })) {
          await h.check("habit editor: sub-habit options");
        }
        // Its details are pills now: open Repeats, then pick Certain days.
        await h.tap((p) => p.locator("[data-mi=pills] button").first(), "repeats pill", { optional: true, expectMove: true });
        await h.check("habit editor: repeats pill");
        if (await h.tap((p) => p.getByRole("button", { name: /^certain days$/i }).first(), "certain days", { optional: true, expectMove: true })) {
          await h.check("habit editor: certain days");
        }
        await esc(h);
      }
    },
  },
  {
    name: "create",
    async run(h) {
      await h.goto("/", { name: "create" });
      if (await h.tap(/^create something new$/i, "+ button", { expectMove: true })) {
        await h.check("+ sheet");
        if (await h.tap(/new quest/i, "new quest", { optional: true, expectMove: true })) {
          await h.check("new quest");
          await h.typeIn((p) => p.locator("[role=dialog] input:visible, [role=dialog] textarea:visible").first(), "new quest title");
        }
        await esc(h);
      }
      // Closing from the + button's × fades the menu and its dark backdrop out (owner, Nov 9: no sudden lightening).
      await h.settle(500);
      if (await h.tap(/^create something new$/i, "+ button again", { optional: true, expectMove: true })) {
        await h.settle(400);
        await h.tap(/^close$/i, "close with the ×", { optional: true, expectMove: true });
        await h.settle(400);
        await h.check("+ closed by ×");
      }
      // Opened again after a × close, it must stay open (owner, Nov 12: every later tap opened and shut it at once).
      await h.tap(/^create something new$/i, "+ button a third time", { expectMove: true });
      await h.settle(900);
      if ((await h.page.locator(".create-sheet").count()) === 0) throw new Error("+ sheet closed itself after reopening");
      await h.check("+ sheet reopened");
      await esc(h);
    },
  },
  {
    // Ctrl/⌘+S and Ctrl/⌘+Enter save a quest (owner, Nov 2: "neither works"): a miss fails the check.
    name: "savekeys",
    async run(h) {
      const p = h.page;
      const report = (m) => {
        if (/STILL OPEN|no \+ Add quest/.test(m)) throw new Error(`save shortcut: ${m}`);
      };
      for (const combo of ["Control+s", "Control+Enter"]) {
        await h.goto("/", { name: "savekeys" });
        await h.tap(/^create something new$/i, "+ button", { expectMove: true });
        await h.tap(/new quest/i, "new quest", { optional: true, expectMove: true });
        const field = p.getByPlaceholder(/quest title/i).first();
        await field.fill(`Key test ${combo}`);
        await p.keyboard.press(combo);
        await p.waitForTimeout(1500);
        const open = await p.locator(".create-sheet").count();
        report(`+ sheet, ${combo}: ${open ? "STILL OPEN (not saved)" : "saved and closed"}`);
      }
      // A board's "+ Add quest" (the editor on its own, not inside the + sheet).
      for (const combo of ["Control+s", "Control+Enter"]) {
        await h.goto("/boards", { name: "savekeys" });
        await h.tap("text=Errands", "open a board", { expectMove: true });
        if (await h.tap(/^\+ add quest$/i, "add quest", { optional: true, expectMove: true })) {
          await p.getByPlaceholder(/quest title/i).first().fill(`Board key test ${combo}`);
          await p.keyboard.press(combo);
          await p.waitForTimeout(1500);
          const open = await p.locator("[role=dialog][data-save-keys]").count();
          report(`board add, ${combo}: ${open ? "STILL OPEN (not saved)" : "saved and closed"}`);
        } else report("board add: no + Add quest button found");
      }
      // Editing an existing quest.
      for (const combo of ["Control+s", "Control+Enter"]) {
        await h.goto("/", { name: "savekeys" });
        if (await h.tap("text=Pick up medication", "open quest editor", { expectMove: true })) {
          const t = p.getByPlaceholder(/quest title/i).first();
          await t.fill("Pick up medication ✓");
          await p.keyboard.press(combo);
          await p.waitForTimeout(1500);
          const open = await p.locator("[role=dialog][data-save-keys]").count();
          report(`editor, ${combo}: ${open ? "STILL OPEN" : "saved and closed"}`);
        }
      }
    },
  },
  {
    name: "cleaning",
    async run(h) {
      await h.goto("/", { name: "cleaning" });
      await h.tap(/daily habits/i, "open daily habits", { optional: true });
      if (await h.tap("text=20 mins of house cleaning", "cleaning check-in")) {
        await h.check("cleaning tray");
        // Set the bathroom's bar to messy: the rows sort themselves (owner, Nov 3).
        await h.page.getByLabel("How messy is Bathroom?").first().fill("9").catch(() => {});
        await h.page.getByLabel("How messy is Bathroom?").first().dispatchEvent("pointerup").catch(() => {});
        await h.settle(700);
        await h.check("cleaning: re-sorted");
        await h.tap("text=Kitchen", "edit a space", { optional: true });
        await h.check("space editor");
        await esc(h);
      }
    },
  },
  {
    name: "evening",
    times: ["evening"],
    async run(h) {
      await h.goto("/", { name: "evening" });
      await h.check("evening routine");
      await h.tap(/evening routine/i, "open evening routine", { expectMove: true });
      await h.check("evening routine open");
      // An evening rite's subtasks: tick one, then the editor's Subtasks list.
      await h.tap((p) => p.getByRole("checkbox", { name: /morning meetings/i }).first(), "tick a rite subtask", { optional: true });
      await h.check("rite subtask ticked");
      if (await h.tap((p) => p.getByRole("button", { name: /^calendar check-in with tiffany/i }).first(), "edit rite with subtasks", { optional: true })) {
        await h.check("rite editor subtasks");
        await esc(h);
      }
      if (await h.tap(/choose tomorrow.s quests/i, "choose tomorrow's quests")) {
        await h.check("tomorrow's quests");
        await h.tap((p) => p.getByRole("button", { name: /add another|choose a quest for tomorrow/i }).first(), "add to tomorrow", { optional: true });
        await h.check("tomorrow's quest picker");
        await esc(h);
        if (await h.tap((p) => p.getByRole("button", { name: /^prioritize tomorrow$/i }).first(), "prioritize tomorrow", { optional: true, expectMove: true })) {
          await h.settle(1200);
          await h.check("prioritize tomorrow cards");
          await esc(h);
        }
      }
      await h.toggle(/celebrate today.s wins/i, "today's wins");
      // Prepare for tomorrow's day opens with Tomorrow's dawn: wake time, room, stones, the seal (owner, Nov 9).
      if (await h.tap(/prepare for tomorrow/i, "prepare for tomorrow", { expectMove: true })) {
        await h.settle(800);
        await h.check("prepare for tomorrow: dawn");
        await h.tap((p) => p.getByRole("button", { name: /^6:30am$/ }).first(), "dusk: wake 6:30", { optional: true });
        await h.tap((p) => p.getByRole("button", { name: /fill my time/i }).first(), "dusk: fill my time", { optional: true });
        await h.check("dusk: wake and stones");
        await h.tap(/prepare for tomorrow/i, "prepare for tomorrow close", { optional: true, expectMove: true });
      }
      // Tonight: reflections and an evening offering.
      if (await h.tap((p) => p.getByRole("button", { name: /^🌙 tonight/i }).first(), "tonight", { optional: true, expectMove: true })) {
        await h.check("tonight open");
        await h.typeIn((p) => p.getByLabel(/what did i do right today/i).first(), "tonight: a reflection");
      }
    },
  },
  {
    name: "import",
    async run(h) {
      await h.goto("/import", { name: "import" });
      await h.check("one by one");
      // Sub-quests as in the quest editor: the label folds them, rows rename in place, XP on the row, ⋯ for Remove, + Add (owner, Nov 12).
      if (await h.tap((p) => p.locator("[data-import-steps]").getByRole("button", { name: /^sub-quests/i }).first(), "sub-quests: fold", { optional: true, expectMove: true })) {
        await h.check("sub-quests folded");
        await h.tap((p) => p.locator("[data-import-steps]").getByRole("button", { name: /^sub-quests/i }).first(), "sub-quests: unfold", { optional: true, expectMove: true });
      }
      if (await h.tap((p) => p.locator("[data-import-steps]").getByRole("button", { name: /^more for /i }).first(), "sub-quest: ⋯", { optional: true, expectMove: true })) {
        await h.check("sub-quest: menu");
        await h.page.keyboard.press("Escape");
      }
      if (await h.tap((p) => p.locator("[data-import-steps]").getByRole("button", { name: /^add a sub-quest$/i }).first(), "sub-quests: add", { optional: true, expectMove: true })) {
        await h.check("sub-quests: adding");
        await h.page.keyboard.press("Escape");
      }
      if (await h.tap((p) => p.locator("[data-import-foot]").getByRole("button", { name: /^snooze…$/i }).first(), "foot: snooze", { optional: true, expectMove: true })) {
        await h.check("foot: snooze row");
        await h.tap((p) => p.locator("[data-import-foot]").getByRole("button", { name: /^snooze…$/i }).first(), "foot: snooze close", { optional: true, expectMove: true });
      }
      await h.find((p) => p.locator("[data-import-foot]").getByRole("button", { name: /^already done$/i }).first()).waitFor({ timeout: 3000 }).catch(() => h.note?.("import foot: no Already done check"));
      // Schedule within (owner, Nov 6): This week, Within 2 weeks, 1 month, Other… (opens in place).
      await h.tap((p) => p.locator("[data-sched-rate]").getByRole("button", { name: /^within 2 weeks$/i }).first(), "rate: within 2 weeks", { optional: true });
      if (await h.tap((p) => p.locator("[data-sched-rate]").getByRole("button", { name: /^other/i }).first(), "rate: other", { optional: true, expectMove: true })) await h.check("rate: other open");
      // Quest details as the editor's pills (owner, Nov 6): XP & coins in one, Time, Due, ⚡ Tiny, 🔥 Importance (with difficulty and energy), Board.
      if (await h.tap((p) => p.locator("[data-import-attrs]").getByRole("button", { name: /xp/i }).first(), "attrs: xp", { optional: true, expectMove: true })) await h.check("attrs: xp open");
      if (await h.tap((p) => p.locator("[data-import-attrs]").getByRole("button", { name: /^importance/i }).first(), "attrs: importance", { optional: true, expectMove: true })) await h.check("attrs: importance open");
      if (await h.tap((p) => p.locator("[data-import-attrs]").getByRole("button", { name: /^time$|^\d+m$/i }).first(), "attrs: time", { optional: true, expectMove: true })) await h.check("attrs: time open");
      // The board is the tag on the portrait (owner, Nov 12): it opens every board, sub-boards folded with a count.
      if (await h.tap((p) => p.locator("[data-import-portrait]").getByRole("button", { name: /^board/i }).first(), "portrait: board tag", { optional: true, expectMove: true })) {
        await h.check("board list open");
        if (await h.tap((p) => p.locator("[data-import-boards]").getByRole("button", { name: /boards? inside/i }).first(), "board list: open sub-boards", { optional: true, expectMove: true })) await h.check("board list: sub-boards");
        await h.tap((p) => p.locator("[data-import-boards]").getByRole("button", { pressed: false }).first(), "board list: pick", { optional: true, expectMove: true });
      }
      await h.tap((p) => p.locator("[data-import-attrs]").getByRole("button", { name: /tiny/i }).first(), "attrs: tiny", { optional: true });
      if (await h.tap((p) => p.getByRole("button", { name: /^more…$/i }).first(), "attrs: more", { optional: true, expectMove: true })) await h.check("attrs: more open");
      if (await h.tap((p) => p.getByRole("button", { name: /import settings/i }).first(), "import gear", { optional: true, expectMove: true })) {
        await h.check("import gear open");
        await h.tap((p) => p.getByRole("button", { name: /import settings/i }).first(), "import gear close", { optional: true });
      }
      // Snooze lives in the ⋯ menu one by one (owner, Nov 6).
      if (await h.tap((p) => p.getByRole("button", { name: /^more choices$/i }).first(), "card menu", { optional: true })) {
        if (await h.tap((p) => p.getByRole("button", { name: /^snooze…$/i }).first(), "snooze from menu", { optional: true, expectMove: true })) await h.check("snooze row");
      }
      if (await h.tap((p) => p.getByRole("button", { name: /^list$/i }).first(), "list view", { optional: true })) {
        await h.check("list view");
        await h.tap((p) => p.locator("[data-sched-rate]").getByRole("button", { name: /^this week$/i }).first(), "list: rate this week", { optional: true });
        await h.tap((p) => p.getByRole("button", { name: /import as|add as|log as/i }).first(), "import from list", { optional: true });
        await h.check("list: import steps");
        if (await h.find((p) => p.getByPlaceholder(/search/i).first()).isVisible().catch(() => false)) await h.typeIn((p) => p.getByPlaceholder(/search/i).first(), "import search");
      }
    },
  },
  {
    name: "settings",
    async run(h) {
      await h.goto("/settings", { name: "settings" });
      await h.check("top");
      const rows = await h.page.locator("main button[aria-expanded=false]").count();
      for (let i = 0; i < Math.min(rows, 12); i++) {
        const row = h.page.locator("main button[aria-expanded=false]").first();
        const name = ((await row.innerText().catch(() => "")) || `group ${i + 1}`).split("\n")[0].slice(0, 30);
        if (!(await h.tap(() => row, `open ${name}`, { optional: true }))) break;
        await h.check(`group ${name}`);
      }
      // Search (owner, Nov 4): "loading" finds "While a screen loads" inside Visual settings and opens it.
      await h.goto("/settings", { name: "settings search" });
      const q = h.page.getByRole("searchbox", { name: /search settings/i }).first();
      if (await q.isVisible().catch(() => false)) {
        await q.fill("loading");
        await h.settle(400);
        await h.check("search results");
        await h.tap((p) => p.getByRole("button", { name: /while a screen loads/i }).first(), "open loading settings", { optional: true, expectMove: true });
        await h.settle(900);
        await h.check("found: loading");
        // Several loading looks can be on at once (they take turns at random); wise words switch.
        if (await h.tap((p) => p.getByRole("button", { name: /^fireflies$/i }).first(), "loading look: fireflies", { optional: true })) {
          await h.tap((p) => p.getByRole("button", { name: /^page turns$/i }).first(), "loading look: page turns", { optional: true });
          await h.settle(300);
          await h.check("loading looks picked");
        }
      }
      // His bubble: look and way (owner, Nov 10), found by search.
      await h.goto("/settings", { name: "settings bubble" });
      const q2 = h.page.getByRole("searchbox", { name: /search settings/i }).first();
      if (await q2.isVisible().catch(() => false)) {
        await q2.fill("bubble");
        await h.settle(400);
        await h.tap((p) => p.getByRole("button", { name: /his speech bubble/i }).first(), "open bubble settings", { optional: true, expectMove: true });
        await h.settle(900);
        await h.tap((p) => p.getByRole("radio", { name: /spirit glow/i }).first(), "bubble look: spirit glow", { optional: true });
        await h.tap((p) => p.getByRole("radio", { name: /words first/i }).first(), "bubble way: words first", { optional: true });
        await h.check("bubble style picked");
        await h.page.evaluate(() => (localStorage.removeItem("toucan-bubble-look"), localStorage.removeItem("toucan-bubble-way")));
      }
      // Secret Missions slides in from the right as its own screen.
      if (await h.tap((p) => p.getByRole("button", { name: /secret missions/i }).first(), "secret missions", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("secret missions screen");
        await esc(h);
      }
    },
  },
  {
    name: "insights",
    async run(h) {
      await h.goto("/insights", { name: "insights" });
      await h.check("top");
      // The chart waits behind a plain button (owner, Nov 9).
      if (await h.tap(/show insights chart/i, "show the chart", { optional: true })) {
        await h.settle(500);
        await h.check("chart open");
      }
      await h.toggle(/last night/i, "last night", {});
      await h.tap(/did it/i, "ritual did it", { optional: true });
      await h.check("after ritual");
      // The leaf button by the tracked events (owner, Nov 12): time wheels, now by default, then Log it.
      if (await h.tap((p) => p.locator("[data-leaf-log]").first(), "leaf button", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("leaf: time wheels");
        await h.tap((p) => p.getByRole("button", { name: /^log it$/i }).first(), "log it", { optional: true, expectMove: true });
        await h.settle(700);
        await h.check("leaf: logged");
      }
    },
  },
  {
    // The calendar (owner, Nov 3: "beautiful like the mockup"): week and day, quests and mini-quests for their duration.
    name: "calendar",
    async run(h) {
      await h.goto("/calendar?view=week", { name: "calendar" });
      await h.settle(1200);
      await h.check("week");
      // 7 AM–10:30 PM by default, the rest behind a button each (owner, Nov 6), and the day headings pinned once scrolled (Nov 12).
      if (await h.tap((p) => p.locator("[data-hours='early']").first(), "before 7 AM", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("week: early hours open");
        await h.tap((p) => p.locator("[data-hours='early']").first(), "hide before 7 AM", { optional: true, expectMove: true });
      }
      await h.page.evaluate(() => window.scrollTo({ top: 700 }));
      await h.settle(500);
      await h.check("week: date pin while scrolled");
      // "Today" beside the + button once now is off the screen; it brings today back to the middle (owner, Nov 12).
      if (await h.tap((p) => p.locator("[data-go-today]").first(), "go to today", { optional: true, expectMove: true })) {
        await h.settle(800);
        await h.check("week: back to today");
      }
      await h.page.evaluate(() => window.scrollTo({ top: 0 }));
      // Calendars of interest (owner, Nov 4): feeds for week and month, links to open.
      if (await h.tap((p) => p.getByRole("button", { name: /^calendars of interest$/i }).first(), "calendars of interest", { optional: true, expectMove: true })) {
        await h.check("calendars of interest");
        await h.tap((p) => p.getByRole("button", { name: /^calendars of interest$/i }).first(), "close calendars of interest", { optional: true });
      }
      // Keep in touch (owner, Nov 4): friends with bars like the cleaning list's.
      if (await h.tap((p) => p.getByRole("button", { name: /^keep in touch$/i }).first(), "keep in touch", { optional: true, expectMove: true })) {
        await h.settle(800);
        const add = h.page.getByLabel("Add a friend").first();
        if (await add.count()) {
          await add.fill("Sam");
          await add.press("Enter");
          await h.settle(600);
        }
        await h.check("keep in touch");
        await h.tap((p) => p.getByRole("button", { name: /^keep in touch$/i }).first(), "close keep in touch", { optional: true });
      }
      // The auto-scheduler window (owner, Nov 3): a list that moves, resizes and minimizes, over the full calendar.
      if (await h.tap((p) => p.getByRole("button", { name: /^auto-scheduler/i }).first(), "open the auto-scheduler", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("auto-scheduler window");
        // Sections on top (owner, Nov 6): Additional quests opens, the list switches between by-when and folders.
        if (await h.tap((p) => p.getByRole("button", { name: /^open additional quests$/i }).first(), "auto-scheduler: open additional", { optional: true, expectMove: true })) await h.check("auto-scheduler: additional open");
        if (await h.tap((p) => p.getByRole("button", { name: /by when|folders/i }).first(), "auto-scheduler: grouping", { optional: true, expectMove: true })) {
          await h.check("auto-scheduler: other grouping");
          await h.tap((p) => p.getByRole("button", { name: /by when|folders/i }).first(), "auto-scheduler: grouping back", { optional: true, expectMove: true });
        }
      }
      await h.page.locator("[title^='Edit \"Goblin']").first().evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
      await h.settle(400);
      await h.check("week: the cards");
      // Display settings: what quest cards show (creature, time, XP, coins).
      if (await h.tap((p) => p.getByRole("button", { name: /display settings|calendar settings/i }).first(), "calendar display", { optional: true, expectMove: true })) {
        await h.check("display settings");
        await h.tap((p) => p.getByRole("button", { name: /^creature$/i }).first(), "hide creature", { optional: true });
        await h.check("cards without creatures");
        await h.tap((p) => p.getByRole("button", { name: /^creature$/i }).first(), "show creature", { optional: true });
        await esc(h);
      }
      // Another session of a quest (owner, Nov 5: one quest in several calendar spots): right-click its card.
      {
        const card = h.page.locator("[title^='Edit \"Goblin']").first();
        if (await card.count()) {
          await card.click({ button: "right" }).catch(() => {});
          await h.settle(400);
          await h.check("quest menu: another session");
          if (await h.tap((p) => p.getByRole("menuitem", { name: /another session/i }).first(), "another session", { optional: true, expectMove: true })) {
            await h.settle(900);
            await h.check("another session picker");
            await esc(h);
          } else await esc(h);
        }
      }
      // Seamless days (repeat ask 12): scroll sideways part of a day; it stays where it's left.
      await h.page.evaluate(() => document.querySelector(".cal-days-scroll")?.scrollBy({ left: 130 })).catch(() => {});
      await h.settle(900);
      await h.check("week: scrolled partway");
      await h.goto("/calendar?view=day", { name: "calendar" });
      await h.settle(1200);
      await h.page.locator("[title^='Edit \"Goblin']").first().evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
      await h.settle(400);
      await h.check("day");
      // A non-negotiable's menu (owner, Nov 4): right-click a meal hold that's on screen for keep / edit / remove.
      {
        const spot = await h.page.evaluate(() => {
          const n = [...document.querySelectorAll("[data-hold-key=lunch]")].find((el) => { const r = el.getBoundingClientRect(); return r.left >= 40 && r.right <= innerWidth + 40 && r.width > 60; });
          if (!n) return null;
          n.scrollIntoView({ block: "center", inline: "nearest" });
          const r = n.getBoundingClientRect();
          // A spot on the hold that isn't covered by a floating window (the auto-scheduler list sat over it).
          for (const fx of [0.6, 0.3, 0.85, 0.15]) {
            const x = r.left + r.width * fx, y = r.top + Math.min(r.height / 2, 20);
            const at = document.elementFromPoint(x, y);
            if (at && at.closest(".cal-days-scroll")) return { x, y };
          }
          return { covered: true };
        });
        if (spot?.covered) h.record({ kind: "covered", severity: "warning", target: "essential's menu", detail: "Every spot on the lunch hold was under a floating window; menu not tried" });
        else if (spot) {
          await h.settle(300);
          await h.page.mouse.click(spot.x, spot.y, { button: "right" });
          await h.settle(400);
          if (!(await h.page.locator("[role=menu][aria-label=Lunch]").count())) h.record({ kind: "no-menu", severity: "error", target: "essential's menu", detail: "Right-click on a meal hold opened no menu" });
          await h.check("essential's menu");
          await h.page.keyboard.press("Escape");
          await h.settle(300);
        }
      }
      await h.page.locator("[title^='Edit \"Take out the trash']").first().evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" })).catch(() => {});
      await h.settle(400);
      await h.check("day: the mini-quest at 4:30");
    },
  },
  {
    // The feedback box (repeat ask 14: no lag): open it, take a screen picture (writing goes on), your recent notes.
    name: "feedback",
    async run(h) {
      await h.goto("/", { name: "feedback" });
      if (await h.tap((p) => p.getByRole("button", { name: /^feedback \(f\)$/i }).first(), "open feedback", { optional: true, expectMove: true })) {
        await h.settle(600);
        await h.check("feedback box");
        // With the keyboard up the page under it is painted dark (owner, Nov 6: a parchment band showed
        // through iPhone's see-through keyboard); the phone shot shows the dark ground below the box.
        await h.typeIn((p) => p.locator("[data-feedback-root] textarea").first(), "feedback writing");
        await h.tap((p) => p.getByRole("button", { name: /add a picture of this screen/i }).first(), "screen picture", { optional: true });
        await h.page.keyboard.type("Typing right after the picture").catch(() => {});
        await h.settle(1500);
        await h.check("feedback: picture and writing");
        if (await h.tap((p) => p.getByRole("button", { name: /your recent notes/i }).first(), "recent notes", { optional: true, expectMove: true })) {
          await h.settle(800);
          await h.check("feedback: recent notes");
        }
      }
    },
  },
  {
    // Learn a language: a window you move by its title, minimized to a chip you can name (owner, Nov 3).
    name: "language",
    async run(h) {
      await h.goto("/", { name: "language" });
      await h.tap(/^daily habits/i, "open daily habits", { optional: true, expectMove: true });
      if (await h.tap((p) => p.getByRole("button", { name: /practice a phrase/i }).first(), "open language window", { optional: true, expectMove: true })) {
        await h.settle(700);
        await h.check("language window");
        await h.tap((p) => p.getByRole("button", { name: /settings: the minimized button/i }).first(), "language chip settings", { optional: true, expectMove: true });
        await h.check("language window: chip settings");
        await h.tap((p) => p.getByRole("dialog", { name: /learn a language/i }).getByRole("button", { name: /^minimize$/i }).first(), "minimize language", { optional: true, expectMove: true });
        await h.check("language chip");
      }
    },
  },
  {
    // Offline (owner, Nov 6): the backpack and packing lists keep working without a connection,
    // the parchment pill says so, and everything syncs once the connection is back.
    name: "offline",
    async run(h) {
      await h.goto("/settings/inventory", { name: "offline" });
      const ctx = h.page.context();
      await ctx.setOffline(true);
      // Wait for the pill rather than a fixed pause (it was flaky in the full run), and never leave the
      // browser offline if this flow fails: the next flows' page loads all crashed with ERR_INTERNET_DISCONNECTED.
      const pill = await h.page.getByRole("button", { name: /^offline/i }).first().waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
      if (!pill) {
        await ctx.setOffline(false);
        throw new Error("offline: no Offline pill after the connection dropped");
      }
      await h.check("offline pill");
      await h.tap((p) => p.getByRole("button", { name: /^offline/i }).first(), "offline pill: why", { optional: true, expectMove: true });
      await h.check("offline pill: open");
      await h.tap((p) => p.getByRole("button", { name: /^offline/i }).first(), "offline pill: close", { optional: true, expectMove: true });
      await h.tap((p) => p.getByRole("button", { name: /^add 4 slots to the utility pocket$/i }).first(), "offline: add slots", { optional: true, expectMove: true });
      if (await h.tap((p) => p.getByRole("button", { name: /^backpack menu$/i }).first(), "offline: backpack menu", { optional: true, expectMove: true })) {
        if (await h.tap((p) => p.getByRole("menuitem", { name: /packing lists/i }).first(), "offline: packing window", { optional: true, expectMove: true })) {
          await h.settle(900);
          const win = h.page.locator("[data-packing-window]");
          await h.tap((p) => p.locator("[data-packing-window]").getByRole("button", { name: /^new list$/i }).first(), "offline: new list", { optional: true, expectMove: true });
          await win.getByLabel("New list's name").fill("Offline trip").catch(() => {});
          await win.getByLabel("New list's name").press("Enter").catch(() => {});
          await win.getByLabel("+ Add item").first().fill("Offline socks").catch(() => {});
          await win.getByLabel("+ Add item").first().press("Enter").catch(() => {});
          await h.settle(1200);
          await h.check("offline: packing window");
        }
      }
      // A journal note written offline waits on the device too.
      if (await h.tap((p) => p.getByRole("button", { name: /^create something new$/i }).first(), "offline: + button", { optional: true, expectMove: true })) {
        if (await h.tap((p) => p.getByRole("tab", { name: /journal/i }).first(), "offline: journal tab", { optional: true, expectMove: true })) {
          await h.page.getByLabel("Journal entry").first().fill("Offline note").catch(() => {});
          await h.tap((p) => p.getByRole("button", { name: /^save entry$/i }).first(), "offline: save entry", { optional: true, expectMove: true });
          await h.settle(1200);
          const kinds = await h.page.evaluate(() => JSON.parse(localStorage.getItem("offline-queue-v1") || "[]").map((o) => o.kind));
          if (!kinds.includes("journal")) { await ctx.setOffline(false); throw new Error("offline: a journal note written offline wasn't kept on the device"); }
        }
      }
      const waiting = await h.page.evaluate(() => JSON.parse(localStorage.getItem("offline-queue-v1") || "[]").length);
      if (!waiting) { await ctx.setOffline(false); throw new Error("offline: changes made offline weren't kept on the device"); }
      await ctx.setOffline(false);
      await h.settle(3000);
      const left = await h.page.evaluate(() => JSON.parse(localStorage.getItem("offline-queue-v1") || "[]").length);
      if (left) throw new Error(`offline: ${left} change(s) still waiting after the connection came back`);
      await h.check("back online");
      await h.tap((p) => p.locator("[data-packing-window]").getByRole("button", { name: /^close$/i }).first(), "offline: close packing", { optional: true, expectMove: true });
      // The app opens offline: turn the offline helper on (it's off for automated browsers), let it keep
      // the main screens, then open them with the connection gone.
      await h.page.evaluate(() => localStorage.setItem("ui-check-sw", "1"));
      await h.page.reload();
      await h.page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 15000 }).catch(() => {});
      await h.settle(9000);
      // Online, a kept screen opens from the copy at once and is fetched again behind it; the page then
      // hears "fresh" and refreshes in place (owner, Nov 12: "instant load based off of older data").
      {
        const base = `http://localhost:${new URL(h.page.url()).port}`;
        await h.page.goto(`${base}/boards`, { waitUntil: "domcontentloaded" });
        await h.page.evaluate(() => navigator.serviceWorker?.addEventListener("message", (e) => ((window).__fresh = e.data)));
        const heard = await h.page.waitForFunction(() => (window).__fresh, null, { timeout: 15000 }).then((r) => r.jsonValue(), () => null);
        const fromKept = await h.page.evaluate(() => (performance.getEntriesByType("navigation")[0]?.workerStart ?? 0) > 0);
        if (!fromKept) throw new Error("instant open: /boards wasn't answered by the offline helper");
        if (!heard || !(heard.ok || heard.build)) throw new Error(`instant open: the page never heard back after opening from the kept copy (${JSON.stringify(heard)})`);
        await h.settle(1500);
        if (!(await h.page.locator("[data-app-shell]").count())) throw new Error("instant open: /boards opened without the app");
        await h.check("opened from the kept copy");
      }
      await ctx.setOffline(true);
      try {
        for (const path of ["/settings/inventory", "/boards"]) {
          await h.page.goto(`http://localhost:${new URL(h.page.url()).port}${path}`, { waitUntil: "domcontentloaded" }).catch((e) => {
            throw new Error(`offline: ${path} didn't open without a connection (${e.message.split("\n")[0]})`);
          });
          await h.settle(1500);
          if (!(await h.page.locator("[data-app-shell]").count())) throw new Error(`offline: ${path} opened without the app (kept copy missing)`);
        }
        await h.check("opened offline");
      } finally {
        await ctx.setOffline(false);
        await h.page.evaluate(async () => {
          localStorage.removeItem("ui-check-sw");
          for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? []) await r.unregister();
          for (const k of await caches.keys()) await caches.delete(k);
        }).catch(() => {});
      }
    },
  },
  {
    // Inventory (owner, Nov 6): settings gear beside the title/×, ☰ on the pack opens packing lists (pills, copy, rename),
    // pockets fold from their title, − / + 4 slots by the title, the bottom seam drags the pocket's height.
    name: "inventory",
    async run(h) {
      await h.goto("/settings/inventory", { name: "inventory" });
      await h.check("inventory");
      if (await h.tap((p) => p.getByRole("button", { name: /^inventory settings$/i }).first(), "inventory gear", { optional: true, expectMove: true })) {
        await h.check("inventory settings");
        await h.tap((p) => p.getByRole("radio", { name: /^show all$/i }).first(), "pills: show all", { optional: true });
        await h.tap((p) => p.getByRole("button", { name: /^done$/i }).first(), "settings done", { optional: true, expectMove: true });
      }
      if (await h.tap((p) => p.getByRole("button", { name: /^backpack menu$/i }).first(), "backpack menu", { optional: true, expectMove: true })) {
        await h.check("backpack menu");
        if (await h.tap((p) => p.getByRole("menuitem", { name: /packing lists/i }).first(), "open packing window", { optional: true, expectMove: true })) {
          await h.settle(900);
          const win = () => h.page.locator("[data-packing-window]");
          await h.tap((p) => p.locator("[data-packing-window]").getByRole("button", { name: /^new list$/i }).first(), "new packing list", { optional: true, expectMove: true });
          await win().getByLabel("New list's name").fill("Weekend away").catch(() => {});
          await win().getByLabel("New list's name").press("Enter").catch(() => {});
          await h.settle(400);
          for (const t of ["Toothbrush", "Chargers"]) {
            await win().getByLabel("+ Add item").first().fill(t).catch(() => {});
            await win().getByLabel("+ Add item").first().press("Enter").catch(() => {});
          }
          await h.check("packing window");
          await h.typeIn((p) => p.locator("[data-packing-window]").getByLabel("+ Add item").first(), "packing add item", "Socks");
          // Listry-like (owner, Nov 7): commas add several; the name opens details (how many, note, sub-items, section).
          await win().getByLabel("+ Add item").first().fill("Hat, Sunscreen").catch(() => {});
          await win().getByLabel("+ Add item").first().press("Enter").catch(() => {});
          if (await h.tap((p) => p.locator("[data-packing-window]").getByRole("button", { name: /^chargers: details$/i }).first(), "packing: item details", { optional: true, expectMove: true })) {
            await h.tap((p) => p.locator("[data-packing-window]").getByRole("button", { name: /^one more$/i }).first(), "packing: quantity +", { optional: true });
            await win().getByLabel("↳ Add a sub-item").first().fill("Phone cable").catch(() => {});
            await win().getByLabel("↳ Add a sub-item").first().press("Enter").catch(() => {});
            await h.check("packing window: item details");
            await h.tap((p) => p.locator("[data-packing-window]").getByRole("button", { name: /^done$/i }).first(), "packing: details done", { optional: true, expectMove: true });
          }
          if (await h.tap((p) => p.locator("[data-packing-window]").getByRole("button", { name: /add a section/i }).first(), "packing: add section", { optional: true, expectMove: true })) {
            await h.page.keyboard.type("Suitcase").catch(() => {});
            await h.page.keyboard.press("Enter").catch(() => {});
          }
          await win().getByLabel("+ Add item").last().focus().catch(() => {});
          await h.settle(400);
          await h.check("packing window: suggestions");
          await h.tap((p) => p.locator("[data-packing-window]").getByRole("checkbox", { name: /pack toothbrush/i }).first(), "packing: tick", { optional: true });
          await h.check("packing window: ticked");
          await h.tap((p) => p.locator("[data-packing-window]").getByRole("button", { name: /^minimize$/i }).first(), "packing: minimize", { optional: true, expectMove: true });
          await h.check("packing chip");
          await h.tap((p) => p.getByRole("button", { name: /open packing lists/i }).first(), "packing: restore", { optional: true, expectMove: true });
          await h.tap((p) => p.locator("[data-packing-window]").getByRole("button", { name: /^close$/i }).first(), "packing: close", { optional: true, expectMove: true });
        }
      }
      // Add an item (owner's recording, Nov 8): the sheet sits above the keyboard, the picture choice is in view, a note folds.
      await h.goto("/settings/inventory", { name: "inventory" });
      if (await h.tap((p) => p.getByRole("button", { name: /^empty slot: add an item$/i }).first(), "empty slot: add an item", { optional: true, expectMove: true })) {
        await h.settle(700);
        await h.check("add item sheet");
        await h.typeIn((p) => p.getByLabel("Item name").first(), "add item: name", "Thai spoon");
        await h.check("add item sheet: typing");
        await h.tap((p) => p.getByRole("button", { name: /paint it$/i }).first(), "add item: paint it", { optional: true, expectMove: true });
        await h.typeIn((p) => p.getByLabel("Describe the portrait").first(), "add item: describe", "a wooden spoon");
        await h.check("add item sheet: describing");
        await h.tap((p) => p.getByRole("button", { name: /^\+ add a note$/i }).first(), "add item: add a note", { optional: true, expectMove: true });
        await h.check("add item sheet: note");
        await h.tap((p) => p.getByRole("button", { name: /^close$/i }).last(), "add item: close", { optional: true, expectMove: true });
      }
      await h.tap((p) => p.getByRole("button", { name: /^add 4 slots to the utility pocket$/i }).first(), "add slots", { optional: true, expectMove: true });
      await h.tap((p) => p.getByRole("button", { name: /^utility pocket/i }).first(), "fold utility pocket", { optional: true, expectMove: true });
      await h.check("pocket folded");
    },
  },
  {
    name: "pages",
    async run(h) {
      for (const path of ["/boards", "/quests", "/calendar", "/rewards", "/feed", "/plan", "/matrix", "/journal", "/notifications", "/settings/inventory", "/power-ups"]) {
        await h.goto(path);
        await h.check("loaded");
      }
      // A board scroll (owner, Nov 9): "Show N more quests" lists the rest in place; tapping the title rolls it up.
      await h.goto("/boards");
      if (await h.tap((p) => p.getByRole("button", { name: /^and \d+ more/i }).first(), "boards: show more quests", { optional: true })) {
        await h.settle(450);
        await h.check("boards: more quests");
      }
      if (await h.tap((p) => p.locator("main .board-card button[aria-expanded=true]").first(), "boards: roll up a scroll", { optional: true })) {
        await h.settle(450);
        await h.check("boards: rolled up");
        await h.tap((p) => p.locator("main .board-card button[aria-expanded=false]").first(), "boards: unroll it", { optional: true });
      }
      // Find a quest from the boards list.
      await h.goto("/boards");
      await h.page.getByLabel("Find a quest").first().fill("insurance").catch(() => {});
      await h.settle(900);
      await h.check("boards: find a quest");
      // A board's sub-board opens in place like a folder (Nov 6), with "See board ›".
      await h.goto("/boards");
      if (await h.tap((p) => p.locator('[data-fb-name="Sub-board: Garden beds"]').first(), "open a sub-board in place", { optional: true, expectMove: true })) {
        await h.settle(900);
        await h.check("boards: sub-board folder");
        await h.tap((p) => p.locator('[data-fb-name="Sub-board: Seeds to order"]').first(), "open a folder inside it", { optional: true, expectMove: true });
        await h.settle(900);
        await h.check("boards: folder in a folder");
        // "See board ›" opens the board as the popup, and the page behind doesn't run down to its bottom (owner, Nov 6).
        const before = await h.page.evaluate(() => window.scrollY);
        if (await h.tap((p) => p.locator("main a", { hasText: /see board/i }).first(), "see board", { optional: true, expectMove: true })) {
          await h.settle(1500);
          const y = await h.page.evaluate(() => window.scrollY);
          if (y - before > 120) h.record({ kind: "page-jumped", severity: "error", target: "board popup", detail: `the page behind the board popup scrolled from ${before}px to ${y}px` });
          await h.check("board popup from a folder");
        }
      }
      // The first board.
      await h.goto("/boards");
      if (await h.tap((p) => p.locator("main a[href^='/boards/']").first(), "open a board", { optional: true, expectMove: true })) {
        h.screen = "board";
        await h.settle(1500);
        await h.check("board");
        // A board's quests in an order you pick (owner, Nov 5): My order, Due soonest, Newest, Most XP, A–Z.
        if (await h.tap((p) => p.getByRole("button", { name: /my order|due soonest|newest|most xp|a–z/i }).first(), "board: order", { optional: true })) {
          await h.settle(400);
          await h.check("board: order choices");
          await h.tap((p) => p.getByRole("radio", { name: /due soonest/i }).first(), "board: due soonest", { optional: true });
          await h.settle(500);
          await h.check("board: by due date");
        }
      }
    },
  },
];
