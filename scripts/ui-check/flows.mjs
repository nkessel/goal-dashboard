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
      await h.page.evaluate(() => localStorage.removeItem("welcome-toucan-at"));
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
      // Quest editor from the first quest card.
      if (await h.tap("text=Pick up medication", "open quest editor", { expectMove: true })) {
        await h.check("quest editor");
        await h.typeIn((p) => p.locator("[role=dialog] input, [role=dialog] textarea").first(), "quest editor title");
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
        if (await h.tap((p) => p.getByText(/^(re)?schedule on calendar$/i).first(), "schedule picker", { optional: true, expectMove: true })) {
          await h.settle(1200);
          await h.check("schedule picker");
          await h.tap((p) => p.locator("[aria-label^='Your ']").first(), "pick a time", { optional: true });
          await h.check("schedule picker: time picked");
          await esc(h);
        } else await esc(h);
      }
      // A quest's ⋯ menu.
      if (await h.tap((p) => p.getByRole("button", { name: /^quest actions$/i }).first(), "quest menu", { optional: true })) {
        await h.check("quest menu");
        await esc(h);
      }
      // A quest with steps: tapping its card slides the steps tray open under it (repeat ask 9: no overlap).
      if (await h.tap("text=read chapter four", "steps tray", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("steps tray open");
        await h.tap("text=read chapter four", "steps tray close", { optional: true, expectMove: true });
      }
      // Log progress from a card (tap its % or "12 of 32 pages"): − / + and a number, in place.
      if (await h.tap((p) => p.getByTitle("Log progress").first(), "log progress", { optional: true, expectMove: true })) {
        await h.check("progress stepper");
        await h.tap((p) => p.getByTitle("Log progress").first(), "close progress stepper", { optional: true, expectMove: true });
      }
      // ✨ Plan my day from Today's Quests header (owner, Nov 2): today's quests placed around the day.
      await h.page.hover("text=Today's Quests").catch(() => {});
      if (await h.tap((p) => p.getByRole("button", { name: /^plan my day$/i }).first(), "plan my day", { optional: true, expectMove: true })) {
        await h.settle(1500);
        await h.check("plan my day");
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
        if (await h.tap(/(edit the|create a) sequence…/i, "edit the sequence", { optional: true, expectMove: true })) {
          await h.settle(800);
          await h.check("sequence dialog");
          if (await h.tap((p) => p.getByRole("button", { name: /post the reflection link/i }).first(), "edit a waiting quest", { optional: true, expectMove: true })) {
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
      if (await h.tap(/choose tomorrow.s quests/i, "choose tomorrow's quests")) {
        await h.check("tomorrow's quests");
        await h.tap((p) => p.getByRole("button", { name: /add another|choose a quest for tomorrow/i }).first(), "add to tomorrow", { optional: true });
        await h.check("tomorrow's quest picker");
        await esc(h);
      }
      await h.toggle(/celebrate today.s wins/i, "today's wins");
      await h.toggle(/prepare for tomorrow/i, "prepare for tomorrow");
    },
  },
  {
    name: "import",
    async run(h) {
      await h.goto("/import", { name: "import" });
      await h.check("one by one");
      await h.toggle(/snooze/i, "snooze row");
      if (await h.tap((p) => p.getByRole("button", { name: /^list$/i }).first(), "list view", { optional: true })) {
        await h.check("list view");
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
    },
  },
  {
    name: "insights",
    async run(h) {
      await h.goto("/insights", { name: "insights" });
      await h.check("top");
      await h.toggle(/last night/i, "last night", {});
      await h.tap(/did it/i, "ritual did it", { optional: true });
      await h.check("after ritual");
    },
  },
  {
    name: "pages",
    async run(h) {
      for (const path of ["/boards", "/calendar", "/rewards", "/feed", "/plan", "/matrix", "/journal", "/notifications", "/settings/inventory", "/power-ups"]) {
        await h.goto(path);
        await h.check("loaded");
      }
      // The first board.
      await h.goto("/boards");
      if (await h.tap((p) => p.locator("main a[href^='/boards/']").first(), "open a board", { optional: true, expectMove: true })) {
        h.screen = "board";
        await h.settle(1500);
        await h.check("board");
      }
    },
  },
];
