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

import { fakeKeyboard } from "./audit.mjs";

const esc = async (h) => {
  await h.page.keyboard.press("Escape");
  await h.settle(500);
};

export const FLOWS = [
  {
    // Paused by default (owner, Nov 17): the day's first visit opens no welcome screen; Settings can turn it back on.
    name: "welcomeoff",
    async run(h) {
      await h.goto("/", { name: "welcomeoff" });
      await h.page.evaluate(() => {
        for (const k of ["daily-login", "welcome-pending", "daily-login-open", "welcome-back-at"]) localStorage.removeItem(k);
        const fx = JSON.parse(localStorage.getItem("goalFxSaved") || "{}");
        delete fx.welcomeMode;
        localStorage.setItem("goalFxSaved", JSON.stringify(fx));
      });
      await h.page.reload();
      await h.page.waitForTimeout(4000);
      if (await h.page.locator("[data-welcome-root]").count()) throw new Error("welcomeoff: the welcome screen opened while switched off");
      if (await h.page.evaluate(() => document.documentElement.hasAttribute("data-fog"))) throw new Error("welcomeoff: the mist stayed over Today");
      await h.check("first visit, welcome screen off");
      await h.goto("/settings?open=welcome-screen", { name: "welcomeoff-settings" });
      if (!(await h.page.locator("[data-welcome-mode] button[aria-pressed=true]", { hasText: "Off" }).count())) throw new Error("welcomeoff: Settings doesn't show the welcome screen as Off");
      await h.page.locator("[data-welcome-mode]").scrollIntoViewIfNeeded();
      await h.check("Settings › Welcome Screen: Off");
    },
  },
  {
    // The toucan's question (owner, Nov 19): just the toucan, over a grey mist, asking what's most important.
    name: "toucanask",
    timeoutMs: 300_000,
    async run(h) {
      await h.goto("/", { name: "toucanask" });
      await h.page.evaluate(() => {
        for (const k of ["daily-login", "welcome-pending", "daily-login-open", "welcome-back-at", "toucan-kept"]) localStorage.removeItem(k);
        localStorage.setItem("evening-prompt-at", "off");
        const fx = JSON.parse(localStorage.getItem("goalFxSaved") || "{}");
        localStorage.setItem("goalFxSaved", JSON.stringify({ ...fx, welcomeMode: "toucan" }));
      });
      await h.page.reload();
      await h.page.waitForSelector("[data-toucan-question]", { timeout: 15000 }).catch(() => {});
      await h.settle(900);
      if (!(await h.page.locator("[data-toucan-question]").count())) throw new Error("toucanask: the toucan's question didn't open on the day's first visit");
      await h.check("the toucan's question");
      await h.typeIn((p) => p.locator("[data-toucan-question] textarea").first(), "toucan's question answer");
      await h.page.locator("[data-toucan-question] textarea").first().fill("Call Dad about Sunday");
      await h.check("the toucan's question, answered");
      // The card's gear (owner, Nov 21): his settings open in a panel above the card.
      if (await h.tap((p) => p.locator("[data-toucan-question]").getByRole("button", { name: /^the toucan's settings$/i }).first(), "toucan's question: gear", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("the toucan's question: its settings");
        await h.tap((p) => p.locator("[data-toucan-question]").getByRole("button", { name: /^close the toucan's settings$/i }).first(), "toucan's question: gear closed", { optional: true, expectMove: true });
        await h.settle(500);
      }
      await h.tap((p) => p.locator("[data-toucan-question]").getByRole("button", { name: /^keep it$/i }).first(), "keep it", { expectMove: true });
      await h.settle(1200);
      await h.check("kept: the floating target");
      if (await h.tap((p) => p.getByRole("button", { name: /^what's most important today$/i }).first(), "open the kept target", { optional: true, expectMove: true })) {
        await h.check("kept: open");
        // Hold the wise line for its menu: Like it · Skip to another · Hide quotes (owner, Nov 21).
        const q = h.page.locator("[data-kept-quote]").first();
        if (await q.count()) {
          await q.click({ button: "right" }).catch(() => {});
          await h.settle(400);
          await h.check("kept: the quote's menu");
          await h.tap((p) => p.getByRole("menuitem", { name: /^skip to another$/i }).first(), "kept: skip the quote", { optional: true });
          await h.settle(300);
        }
        await h.tap((p) => p.locator("[data-kept-card]").getByRole("button", { name: /^shrink$/i }).first(), "kept: shrink", { optional: true, expectMove: true });
      }
      await h.goto("/settings?open=welcome-screen", { name: "toucanask-settings" });
      await h.page.locator("[data-welcome-mode]").scrollIntoViewIfNeeded().catch(() => {});
      await h.check("Settings › Welcome Screen: the toucan's question");
      await h.goto("/settings?open=toucan-spirit", { name: "toucanask-look" });
      if (await h.tap((p) => p.getByRole("button", { name: /^his look/i }).first(), "his look", { optional: true, expectMove: true })) {
        await h.page.locator("[data-toucan-ask-bg]").scrollIntoViewIfNeeded().catch(() => {});
        await h.check("Settings › His look: behind the toucan's question");
      }
    },
  },
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
      // Two lines of prompts, "Show more prompts", ✎ edits them, "+ My own" adds one (owner, Nov 9).
      if (await h.tap((p) => p.getByRole("button", { name: /show more prompts/i }).first(), "journal: more prompts", { optional: true, expectMove: true })) await h.check("journal: all prompts");
      if (await h.tap((p) => p.getByRole("button", { name: /edit the journal prompts/i }).first(), "journal: edit prompts", { optional: true, expectMove: true })) {
        await h.settle(400);
        await h.check("journal: editing prompts");
        await h.tap((p) => p.getByRole("button", { name: /edit the journal prompts/i }).first(), "journal: edit prompts closed", { optional: true });
      }
      if (await h.tap((p) => p.getByRole("button", { name: /^\+ my own$/i }).first(), "journal: my own", { optional: true, expectMove: true })) await h.check("journal: my own prompt");
      await h.tap((p) => p.getByRole("button", { name: /^cancel$/i }).first(), "journal: my own cancel", { optional: true });
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
    // The longest flow was split in two (S3, Nov 22): this is the first half, `today2` the second.
    timeoutMs: 420_000,
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
      // A Due soon quest's menu offers "Take out of Due soon" (owner, Nov 9); right-click opens it like a held finger.
      if (await h.tap((p) => p.locator('section[aria-label="Due soon"] .quest-dots').first(), "due soon quest menu", { optional: true, expectMove: true })) {
        await h.check("due soon quest menu");
        await esc(h);
      }
      await h.toggle(/additional quests/i, "additional quests");
      await h.toggle(/daily habits/i, "daily habits");
      // (toggle shows it open, then closes it again): open it to tick one.
      // A real click (not el.click() from a script): the browser then counts the tray sliding open as an answer to
      // input, so Today's Quests moving down under it is not reported as a jump (it was, Nov 21: "up to check-in open").
      await h.page.locator("button[aria-expanded='false']", { hasText: /Daily Habits/ }).first().click({ timeout: 3000 }).catch(() => {});
      await h.settle(700);
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
        // Complete asks when it was finished (owner, Nov 8): Just now, or Earlier… on the time wheels. Closed again without completing.
        if (await h.tap((p) => p.getByRole("button", { name: /complete (quest|task)/i }).first(), "editor: complete asks when", { optional: true, expectMove: true })) {
          await h.tap((p) => p.locator("[data-complete-when]").getByRole("button", { name: /earlier/i }).first(), "editor: complete earlier", { optional: true, expectMove: true });
          await h.settle(400);
          await h.check("editor: when did you finish");
          // Any earlier day: More… opens the calendar straight away (owner, Nov 21).
          if (await h.tap((p) => p.locator("[data-complete-when]").getByRole("button", { name: /^another day$/i }).first(), "editor: earlier, more", { optional: true, expectMove: true })) {
            await h.settle(400);
            await h.check("editor: earlier, the calendar");
            await h.tap((p) => p.getByRole("dialog", { name: /^another day$/i }).getByRole("button", { name: /^\d{1,2}$/ }).first(), "editor: earlier, pick a day", { optional: true, expectMove: true });
            await h.check("editor: earlier, a day picked");
          }
          await h.tap((p) => p.locator("[data-complete-when]").getByRole("button", { name: /not yet/i }).first(), "editor: not yet", { optional: true });
        }
        // The board tag on the portrait opens the board picker under it (owner, Nov 12).
        if (await h.tap((p) => p.locator("[role=dialog] [data-board-chip]").first(), "editor: board tag", { expectMove: true })) {
          await h.settle(500);
          await h.check("quest editor: board picker");
          await h.tap((p) => p.locator("[role=dialog] [data-board-chip]").first(), "editor: board picker shut", { optional: true, expectMove: true });
        }
        // The XP amount: no box; tapping it selects and pulses the number, with a gold bar for a cursor (owner, Nov 9).
        if (await h.tap((p) => p.locator("[role=dialog] button", { hasText: /^\W*\d+ XP/ }).first(), "editor: XP pill", { optional: true, expectMove: true })) {
          if (await h.tap((p) => p.getByLabel("XP amount").first(), "editor: XP amount", { optional: true })) await h.check("quest editor: XP typed");
          // Stats: share some of the XP with character stats (the tray under the XP bar), then the add-a-stat field.
          // Each stat's share shows under the XP slider (owner's pick, Nov 19: C3, divided, no "+"): checked with 2, 5 and 10 stats.
          await h.page.getByLabel("XP amount").first().fill("60").catch(() => {});
          // With many stats the tray scrolls, so a + can scroll into view as it's tapped.
          const more = (st, expectMove = false) => h.tap((p) => p.getByRole("button", { name: new RegExp(`^more xp to ${st}$`, "i") }).first(), `stats: ${st} +`, { optional: true, expectMove });
          const openTray = async () => { const ok = await h.tap((p) => p.locator("[role=dialog] button", { hasText: /add to stats|^stats$/i }).first(), "editor: stats tray", { optional: true, expectMove: true }); if (ok) await h.settle(700); return ok; };
          const saveTray = () => h.tap((p) => p.getByRole("button", { name: /^save$/i }).first(), "stats: save", { optional: true, expectMove: true });
          const line = async (n) => { await h.settle(300); await h.check(`quest editor: stats ${n} under the slider`); };
          if (await openTray()) {
            await more("strength"); await more("strength"); await more("wisdom");
            await h.check("quest editor: stats tray");
            await saveTray();
            await line(2);
            if (await openTray()) {
              for (const st of ["intelligence", "charisma", "dexterity"]) await more(st);
              await saveTray();
              await line(5);
            }
            if (await openTray()) {
              await more("constitution", true);
              for (const name of ["Creativity", "Courage", "Focus", "Kindness"]) {
                if (await h.tap((p) => p.getByRole("button", { name: /a new stat/i }).first(), "stats: new stat", { optional: true, expectMove: true })) {
                  await h.page.getByPlaceholder(/name it/i).first().fill(name).catch(() => {});
                  await h.page.keyboard.press("Enter").catch(() => {});
                  await h.settle(300);
                  await more(name.toLowerCase(), true);
                }
              }
              await h.check("quest editor: new stats added");
              await saveTray();
              await line(10);
            }
          }
          await h.tap((p) => p.locator("[role=dialog] button", { hasText: /^\W*\d+ XP/ }).first(), "editor: XP pill shut", { optional: true, expectMove: true });
        }
        // The extra pills (no "More" fold): open the scales, then the due panel with scheduling and early bonus.
        if (await h.tap((p) => p.getByRole("button", { name: /importance & effort/i }).first(), "editor: scales pill", { optional: true, expectMove: true })) await h.check("quest editor: scales");
        // The due pill reads "Due today", "Due Fri · Thu 3pm" or "Due date".
        if (await h.tap((p) => p.locator("[role=dialog] button.qe-fact", { hasText: /^(Due|Plan:)/ }).first(), "editor: due", { optional: true, expectMove: true })) {
          await h.check("quest editor: due panel");
          // Time of day (owner, Nov 16): a range any quest can have, for the auto-scheduler.
          if (await h.tap((p) => p.locator("[data-quest-window] button", { hasText: /^Before$/ }).first(), "editor: time of day, before", { optional: true, expectMove: true })) {
            await h.check("quest editor: sometime before");
            await h.tap((p) => p.locator("[data-quest-window] button", { hasText: /^Any time$/ }).first(), "editor: time of day, any", { optional: true, expectMove: true });
          }
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
      // (Daily Habits is open from the toggle above.) Clicked from the page, since the card can sit under the bottom bar on a phone.
      const vit = h.page.locator(".habit-row", { hasText: "Vitamins before 12pm" }).first().getByRole("button", { name: /Vitamins before 12pm/ }).first();
      if (await vit.count()) {
        // Centred first (so the bottom bar isn't over it), then a real click, so the card growing counts as an answer to input.
        await vit.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
        await vit.click({ timeout: 3000 }).catch(() => vit.evaluate((el) => el.click()).catch(() => {}));
        await h.settle(600);
        await h.check("habit sub-habits open");
        // Idea D (owner, Nov 18): the count line under the name changes as one is ticked; a dotted thread joins the checks.
        await h.page.locator(".habit-row", { hasText: "Vitamins before 12pm" }).first().getByRole("checkbox", { name: /^B12/ }).first().evaluate((el) => el.click()).catch(() => {});
        await h.settle(600);
        await h.check("habit sub-habit ticked");
        await vit.evaluate((el) => el.click()).catch(() => {});
        await h.settle(300);
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
      // Archive asks Fail / Archive / Delete; Fail writes its reason on the menu's parchment (owner, Nov 9).
      if (await h.tap((p) => p.locator("li", { hasText: "Pick up medication" }).getByRole("button", { name: /^quest actions$/i }).last(), "quest menu for archive", { optional: true })) {
        if (await h.tap((p) => p.getByRole("menuitem", { name: /^archive/i }).first(), "archive choices", { optional: true, expectMove: true })) {
          await h.check("archive choices");
          if (await h.tap((p) => p.getByRole("button", { name: /mark as failed/i }).first(), "quest failure", { optional: true, expectMove: true })) await h.check("quest failure form");
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
    },
  },
  {
    // Second half of the old `today` flow (split in S3, Nov 22: the whole flow ran past its time limit on a phone).
    timeoutMs: 420_000,
    name: "today2",
    async run(h) {
      await h.goto("/", { name: "today2" });
      await h.check("loaded");
      const compass = (p) => p.getByRole("button", { name: /^focus: a question/i }).first();
      await h.page.hover("text=Today's Quests").catch(() => {});
      await h.tap(compass, "compass", { optional: true, expectMove: true });
      await h.settle(600);
      // Prioritize: today's quests first, one five-part bar, Save, skip by swipe, additional quests behind a button.
      if (await h.tap((p) => p.getByRole("button", { name: /^prioritize$/i }).first(), "prioritize", { expectMove: true })) {
        await h.settle(1200);
        await h.check("prioritize cards");
        // Tap a card: a short preview (a second tap opens the editor).
        if (await h.tap((p) => p.locator("[data-prioritize-preview]").first(), "prioritize preview", { optional: true, expectMove: true })) {
          await h.settle(400);
          await h.check("prioritize preview");
        }
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
        // Habits in the day's plan (owner, Nov 14): pick one for today, mark one core, let one rest.
        if (await h.tap((p) => p.locator("[data-prioritize-kind=habits]").first(), "prioritize habits", { optional: true, expectMove: true })) {
          await h.settle(1200);
          await h.check("prioritize habits");
          await h.tap((p) => p.locator("[data-prioritize-habit]").first().getByRole("button", { name: /^today$/i }), "habit: today", { optional: true });
          await h.tap((p) => p.locator("[data-prioritize-habit]").nth(1).getByRole("button", { name: /core habit/i }), "habit: core", { optional: true });
          await h.tap((p) => p.locator("[data-prioritize-habit]").nth(2).getByRole("button", { name: /^rest$/i }), "habit: rest", { optional: true });
          await h.settle(800);
          await h.check("prioritize habits chosen");
        }
        await esc(h);
        // The chosen habits sit inside Today's Quests.
        await h.settle(1500);
        if (await h.page.locator("[data-habits-in-today]").first().isVisible().catch(() => false)) await h.check("habits in Today's Quests");
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
    // Tabs that feel instant (owner, Nov 22): tapping a bottom-bar tab commits at once onto the tab's stand-in
    // (its loading.tsx) and the slide plays there; the real screen then replaces it in place. The screen's data
    // is held back here (the fake database answers 1.4s late while a tab loads), so the stand-in moment can be
    // seen and screenshot. A tab whose screen the app had already preloaded may open at once with no stand-in:
    // that's fine (nothing to wait for), so it's noted, not an error.
    name: "tabsinstant",
    timeoutMs: 300_000,
    async run(h) {
      const slowDb = (ms) => fetch(`http://127.0.0.1:54329/__delay?ms=${ms}`, { method: "POST" }).catch(() => {});
      const TABS = [["/calendar", "Calendar"], ["/boards", "Quests"], ["/insights", "Insights"], ["/feed", "Friends"], ["/", "Today"]];
      // Two passes. "cached": as the app runs, every tab but the Calendar is preloaded and opens at once (no
      // stand-in needed). "uncached": every preload is refused (as when they've gone stale), so each tab is
      // fetched on the tap and shows its stand-in while its data loads.
      const refusePreloads = async (route) => {
        const req = route.request();
        if (req.headers()["next-router-prefetch"]) return route.abort().catch(() => {});
        return route.continue().catch(() => {});
      };
      for (const pass of ["cached", "uncached"]) {
        if (pass === "uncached") await h.page.route(/_rsc=/, refusePreloads);
        await h.goto("/", { name: "tabsinstant" });
        await h.settle(1200);
        let shownAny = false;
        for (const [href, label] of TABS) {
          const tab = h.page.locator(`nav[data-app-nav] a[href="${href}"]`);
          if (!(await tab.count())) { h.record({ kind: "tabsinstant", severity: "error", target: label, detail: `no ${href} tab` }); continue; }
          // A finger resting on the tab starts its prefetch (the Calendar is prefetched only then); let that land first.
          if (pass === "cached") {
            await tab.dispatchEvent("pointerdown").catch(() => {});
            await h.settle(1000);
          }
          // Long enough in the uncached pass for the check's own audit to finish while the stand-in still shows.
          await slowDb(pass === "cached" ? 1400 : 3500);
          await tab.click({ timeout: 3000 }).catch(() => {});
          const shown = await h.page.waitForSelector("main[data-standin]", { timeout: 2500 }).then(() => true).catch(() => false);
          const name = pass === "cached" ? label : `${label} (not preloaded)`;
          if (!shown) {
            const already = await h.page.evaluate((p) => location.pathname === p && !!document.querySelector("main:not([data-standin])"), href);
            if (!already) h.record({ kind: "tabsinstant", severity: "error", target: label, detail: `${href} (${pass}): neither a stand-in nor the screen showed after the tap` });
          } else {
            shownAny = true;
            await h.settle(150);
            await h.check(`${name}: stand-in, mid-slide`);
            await h.settle(500);
            if (await h.page.locator("main[data-standin]").count()) await h.check(`${name}: stand-in, at rest`);
          }
          await h.page.waitForSelector("main[data-standin]", { state: "detached", timeout: 15000 }).catch(() => h.record({ kind: "tabsinstant", severity: "error", target: label, detail: `${href} (${pass}): the stand-in never gave way to the screen` }));
          await slowDb(0);
          await h.settle(700);
          if (await h.page.evaluate(() => document.documentElement.hasAttribute("data-nav-pending"))) h.record({ kind: "tabsinstant", severity: "error", target: label, detail: `${href} (${pass}): the wait marker stayed on after the screen loaded` });
          await h.check(`${name}: loaded`);
        }
        if (!shownAny) h.record({ kind: "tabsinstant", severity: "error", target: "tabs", detail: `${pass}: no tab showed its stand-in while its data loaded` });
      }
      await h.page.unroute(/_rsc=/, refusePreloads);
      // A popup over a tab never shows a stand-in under it.
      await slowDb(0);
      await h.goto("/settings", { name: "tabsinstant-settings" });
      if (await h.page.locator("main[data-standin]").count()) h.record({ kind: "tabsinstant", severity: "error", target: "settings", detail: "a stand-in showed under Settings" });
    },
  },
  {
    // The bottom bar's tabs reorder by dragging a tab (owner, Nov 14); the screen slide follows the new order.
    name: "navorder",
    async run(h) {
      await h.goto("/", { name: "navorder" });
      await h.settle(1200);
      const hrefs = () => h.page.$$eval("nav[data-app-nav] [data-nav-slot] a[href]", (as) => as.map((a) => a.getAttribute("href")));
      const drag = async (from, to, label) => {
        const a = await h.page.locator(`nav[data-app-nav] a[href="${from}"]`).boundingBox().catch(() => null);
        const b = await h.page.locator(`nav[data-app-nav] a[href="${to}"]`).boundingBox().catch(() => null);
        if (!a || !b) return h.record({ kind: "no-drag", severity: "error", target: "navorder", detail: `no ${from} or ${to} tab` });
        await h.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await h.page.mouse.down();
        await h.page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 3 });
        await h.page.mouse.move(b.x + b.width / 2 + (to === "/feed" ? 10 : -10), b.y + b.height / 2, { steps: 12 });
        await h.settle(250);
        await h.check(label);
        await h.page.mouse.up();
        await h.settle(700);
      };
      await drag("/calendar", "/feed", "dragging the Calendar tab");
      const after = await hrefs();
      if (after[after.length - 1] !== "/calendar") h.record({ kind: "nav-order", severity: "error", target: "navorder", detail: `Calendar didn't move to the end: ${after.join(" ")}` });
      await h.check("Calendar tab moved to the end");
      // Today → Calendar is now a step to the right: the screen leaves to the left.
      await h.page.locator('nav[data-app-nav] a[href="/calendar"]').click({ timeout: 3000 }).catch(() => {});
      const dir = await h.page.evaluate(() => document.documentElement.getAttribute("data-nav-pending") ?? document.documentElement.getAttribute("data-enter"));
      if (dir && dir !== "nav-forward") h.record({ kind: "nav-order", severity: "error", target: "navorder", detail: `slide to the moved Calendar went ${dir}` });
      await h.page.waitForURL(/\/calendar/, { timeout: 15000 }).catch(() => {});
      await h.settle(1500);
      await h.check("calendar after the reordered tab");
      const kept = await hrefs();
      if (kept[kept.length - 1] !== "/calendar") h.record({ kind: "nav-order", severity: "error", target: "navorder", detail: `order not kept on the next screen: ${kept.join(" ")}` });
      // Put it back for the flows after this one.
      await drag("/calendar", "/boards", "dragging Calendar back");
      const back = await hrefs();
      if (back[0] !== "/calendar") h.record({ kind: "nav-order", severity: "warn", target: "navorder", detail: `couldn't put Calendar back: ${back.join(" ")}` });
    },
  },
  {
    // Today's day calendar beside Today (owner, Nov 12): side by side on a tablet, a slide-out tab on a phone;
    // a quest card dragged onto it shows where it lands and goes there; the place panel's driving time; the card's look.
    name: "todaycal",
    async run(h) {
      await h.goto("/", { name: "todaycal" });
      await h.settle(1500);
      await h.check("today with its calendar");
      if (h.isPhone && (await h.tap((p) => p.locator("[data-today-cal-tab]").first(), "calendar tab", { expectMove: true }))) {
        await h.settle(600);
        await h.check("calendar slid out");
        await h.tap((p) => p.getByRole("button", { name: /^close the calendar$/i }).first(), "calendar away", { optional: true, expectMove: true });
        await h.settle(500);
      }
      if (!h.isPhone) {
        // Drag the first of Today's Quests onto 2 PM with a mouse.
        const card = h.page.locator(".quest-card", { hasText: "Relational Leadership" }).first();
        await card.scrollIntoViewIfNeeded().catch(() => {});
        await h.settle(300);
        const cell = h.page.locator("[data-today-cal] [data-cal-hit]").first();
        const cb = await card.boundingBox().catch(() => null);
        const hb = await cell.boundingBox().catch(() => null);
        if (cb && hb) {
          await h.page.mouse.move(cb.x + 40, cb.y + 20);
          await h.page.mouse.down();
          await h.page.mouse.move(cb.x + 60, cb.y + 30, { steps: 4 });
          const hb2 = (await cell.boundingBox().catch(() => null)) ?? hb;
          await h.page.mouse.move(hb2.x + hb2.width / 2, Math.max(hb2.y + 40, 300), { steps: 14 });
          await h.settle(300);
          await h.check("dragging a card over the calendar");
          await h.page.mouse.up();
          await h.settle(1200);
          await h.check("card dropped on the calendar");
        } else h.record({ kind: "no-drag", severity: "warn", target: "todaycal", detail: "no card or calendar to drag between" });
      }
      // The place pill: driving time; and the card's colour or picture.
      if (await h.tap((p) => p.locator(".quest-card").first(), "open a quest", { optional: true, expectMove: true })) {
        await h.settle(800);
        if (await h.tap((p) => p.getByRole("button", { name: /^add a place$|^place:/i }).first(), "place pill", { optional: true, expectMove: true })) {
          await h.tap((p) => p.getByRole("button", { name: /^20 min$/i }).first(), "drive 20 min", { optional: true });
          await h.check("place with driving time");
        }
        if (await h.tap((p) => p.getByRole("button", { name: /^card colour or picture$/i }).first(), "card look pill", { optional: true, expectMove: true })) {
          await h.tap((p) => p.locator("[data-card-look]").getByRole("button", { name: /#dcefe0/i }).first(), "pick a colour", { optional: true });
          await h.check("card look picker");
        }
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
      // Sub-quests and Sequence: two pills side by side, one tap each (owner, Nov 20).
      await h.goto("/", { name: "sequence" });
      if (await h.tap("text=Pick up medication", "open quest editor", { optional: true, expectMove: true })) {
        await h.settle(900);
        await h.check("sub-quests and sequence pills");
        if (await h.tap((p) => p.getByRole("group", { name: "Quick details" }).locator("button", { hasText: "Sub-quests" }).first(), "sub-quests pill", { optional: true, expectMove: true })) {
          await h.settle(500);
          await h.check("sub-quests: adding one");
          // Sub-quests as little cards (owner's pick C, Nov 20): type two, then open one's ⋯ and its time and details.
          await h.page.keyboard.type("Call the pharmacy");
          await h.page.keyboard.press("Enter");
          await h.page.keyboard.type("Bring the insurance card");
          await h.page.keyboard.press("Enter");
          await h.settle(400);
          await h.check("sub-quests: two cards");
          if (await h.tap((p) => p.getByRole("button", { name: /^More for Bring the insurance card$/ }).first(), "a sub-quest's ⋯", { optional: true, expectMove: true })) {
            await h.settle(300);
            await h.check("sub-quests: its ⋯ menu");
            if (await h.tap((p) => p.getByRole("menuitem", { name: /Time, progress/ }).first(), "time, progress & XP share", { optional: true, expectMove: true })) {
              await h.settle(400);
              await h.check("sub-quests: its time and details");
            }
          }
        }
        if (await h.tap((p) => p.getByRole("group", { name: "Quick details" }).locator("button", { hasText: "Sequence" }).first(), "sequence pill", { optional: true, expectMove: true })) {
          await h.settle(700);
          await h.check("sequence: its window");
          await esc(h);
          await h.settle(400);
        }
        // The card's picture background sits at the foot of the portrait picker (owner, Nov 20).
        if (await h.tap((p) => p.locator("button[title='Change the portrait']").first(), "portrait picker", { optional: true, expectMove: true })) {
          await h.settle(600);
          await h.check("portrait picker: its foot");
          await esc(h);
          await h.settle(300);
        }
        // "+ Color" is last in the + row (owner, Nov 20).
        if (await h.tap((p) => p.getByRole("group", { name: "More details" }).getByRole("button", { name: /color/i }).first(), "+ color", { optional: true, expectMove: true })) {
          await h.settle(500);
          await h.check("+ color: its panel");
        }
        await esc(h);
      }
    },
  },
  {
    // "How do you feel?" (owner, Nov 19): five one-ink faces after a habit tick, a victory and a fail.
    name: "faces",
    async run(h) {
      await h.goto("/", { name: "faces" });
      await h.toggle(/daily habits/i, "daily habits");
      const tick = h.page.getByRole("checkbox", { name: /^Done: Walk Chester/ }).first();
      if (await tick.count()) {
        await tick.evaluate((el) => { el.scrollIntoView({ block: "center" }); el.click(); }).catch(() => {});
        await h.settle(1800);
        await h.check("habit kept: its card asks how you feel");
        if (await h.tap((p) => p.locator("[data-felt-ask] [role=radio][aria-label=Good]").first(), "habit felt: good", { optional: true, expectMove: true })) await h.check("habit felt: saved, with undo");
        await h.tap((p) => p.getByRole("button", { name: /^close$/i }).last(), "close the habit card", { optional: true, expectMove: true });
        await h.settle(1400);
      }
      // A victory: the celebration asks too, above Claim your reward · Continue Your Journey.
      if (await h.tap((p) => p.getByRole("button", { name: /^quest actions$/i }).first(), "quest menu for complete", { optional: true })) {
        if (await h.tap((p) => p.getByRole("menuitem", { name: /^✓?\s*complete this/i }).first(), "complete from the menu", { optional: true, expectMove: true })) {
          // Completing from a card asks when first (owner, Nov 21): Just now, or Other… for a day and time.
          await h.settle(500);
          await h.check("complete: when did you finish");
          if (await h.tap((p) => p.getByRole("button", { name: /^other…$/i }).first(), "complete: other", { optional: true, expectMove: true })) {
            await h.check("complete: other day and time");
            await h.tap((p) => p.getByRole("button", { name: /^other…$/i }).first(), "complete: other closed", { optional: true });
          }
          await h.tap((p) => p.getByRole("button", { name: /^just now$/i }).first(), "complete: just now", { expectMove: true });
          await h.settle(3500);
          await h.check("celebration: how do you feel");
          if (await h.tap((p) => p.locator("[data-felt-ask] [role=radio][aria-label=Great]").first(), "celebration: great", { optional: true, expectMove: true })) await h.check("celebration: felt kept");
          // Its ✎ opens the editor over the celebration, which is still there once it closes (owner, 3afc21f4).
          if (await h.tap((p) => p.getByRole("button", { name: /^edit this quest$/i }).first(), "celebration: edit", { optional: true, expectMove: true })) {
            await h.settle(1500);
            await h.check("celebration: editor over it");
            await esc(h);
            await h.settle(900);
            await h.check("celebration: back after the editor");
          }
          // The chest that can't be read says so with Try again, never "0 in your purse" (b285e3e2).
          let failOnce = true;
          const failChest = (route) => {
            if (failOnce && route.request().method() === "POST" && route.request().headers()["next-action"]) {
              failOnce = false;
              return route.abort();
            }
            return route.continue();
          };
          await h.page.route("**/*", failChest);
          if (await h.tap(/^claim your reward$/i, "celebration: claim your reward", { optional: true, expectMove: true })) {
            await h.settle(1200);
            await h.check("celebration: chest wouldn't open");
            await h.page.unroute("**/*", failChest);
            if (await h.tap((p) => p.getByRole("button", { name: /^try again$/i }).first(), "chest: try again", { optional: true, expectMove: true })) {
              await h.settle(1500);
              await h.check("celebration: reward chest");
            }
            await h.tap((p) => p.getByRole("button", { name: /^back to quest complete$/i }).first(), "chest: back", { optional: true, expectMove: true });
            await h.settle(600);
          }
          await h.page.unroute("**/*", failChest).catch(() => {});
          await h.tap(/continue your journey/i, "continue your journey", { optional: true, expectMove: true });
          await h.settle(800);
        }
        await esc(h);
      }
      // A fail: a wise line, the faces, then Try again · Continue.
      if (await h.tap((p) => p.locator("li", { hasText: "AR class homework" }).getByRole("button", { name: /^quest actions$/i }).last(), "quest menu for fail")) {
        if (await h.tap((p) => p.getByRole("menuitem", { name: /^archive/i }).first(), "archive choices (fail)", { optional: true, expectMove: true })) {
          if (await h.tap((p) => p.getByRole("button", { name: /mark as failed/i }).first(), "fail form", { optional: true, expectMove: true })) {
            if (await h.tap((p) => p.getByRole("button", { name: /^mark failed$/i }).first(), "mark failed", { optional: true, expectMove: true })) {
              await h.settle(1200);
              await h.page.waitForSelector("[data-fail-scene]", { timeout: 6000 }).catch(() => {});
              await h.settle(600);
              await h.check("fail: wise line and faces");
              if (await h.tap((p) => p.locator("[data-fail-scene]").getByRole("button", { name: /^try again$/i }).first(), "fail: try again", { optional: true, expectMove: true })) await h.check("fail: copy or new");
            }
          }
        }
        await esc(h);
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
      // Additional Habits (Nov 18): the habits not up today, as their own section under Daily Habits, like Additional Quests.
      if (await h.tap(/^additional habits/i, "open additional habits", { optional: true, expectMove: true })) {
        await h.check("additional habits open");
        // (Playwright's touch tap times out on habit ticks inside the sortable list, so this one is a click.)
        if (await h.page.evaluate(() => { const el = document.querySelector('[aria-label="Done: Water the garden beds"]'); el?.click(); return !!el; })) {
          await h.settle(900);
          await h.check("additional habit done");
          // The "Habit kept!" card stays until closed (it asks how it felt): close it, as a person would, before the next step.
          await h.tap((p) => p.locator(".pc-card").getByRole("button", { name: /^close$/i }).first(), "close habit kept", { optional: true });
          await h.settle(400);
        }
        await h.tap(/^additional habits/i, "close additional habits", { optional: true, expectMove: true });
      }
      await h.page.getByText("Gym 🏋️").first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
      await h.settle(300);
      // Count every tick (owner, Nov 16): a habit set to it gives another completion, XP and celebration each tick,
      // the card counts the day's times, the menu undoes the last one, and the XP changes on the celebration.
      const walk = (p) => p.locator("li", { hasText: "Walk Chester" }).first();
      await walk(h.page).evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
      await h.settle(300);
      await h.check("habit cards: listen link inline");
      if (await h.tap((p) => walk(p).getByRole("button", { name: /more for walk chester/i }), "habit menu", { optional: true, expectMove: true })) {
        await h.check("habit menu: count every time");
        await h.tap((p) => p.getByRole("menuitem", { name: /count every time/i }).first(), "count every time", { optional: true, expectMove: true });
        await h.settle(300);
        const closeParty = async () => {
          await h.tap((p) => p.getByRole("button", { name: /^close$/i }).first(), "close celebration", { optional: true });
          await h.settle(500);
        };
        if (await h.tap((p) => walk(p).getByRole("checkbox").first(), "tick: first", { optional: true })) {
          await h.settle(1400);
          await h.check("habit tick: celebration with XP to change");
          await closeParty();
          await h.tap((p) => walk(p).getByRole("checkbox").first(), "tick: again", { optional: true });
          await h.settle(1600);
          await h.check("habit tick: done again");
          await closeParty();
          await h.check("habit card: times today");
          if (await h.tap((p) => walk(p).getByRole("button", { name: /more for walk chester/i }), "habit menu again", { optional: true, expectMove: true })) {
            await h.check("habit menu: undo the last one");
            await h.tap((p) => p.getByRole("menuitem", { name: /undo the last one/i }).first(), "undo the last one", { optional: true });
            await h.settle(600);
          }
        }
      }
      // The habit editor (repeat ask 15): sub-habits in view, dragged to reorder, a dot opens XP/coins/Remove.
      if (await h.tap("text=Gym 🏋️", "habit editor", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("habit editor");
        await h.page.getByLabel("Add a sub-habit").first().fill("Stretch").catch(() => {});
        await h.page.getByLabel("Add a sub-habit").first().press("Enter").catch(() => {});
        await h.settle(300);
        if (await h.tap((p) => p.getByRole("button", { name: /options for stretch/i }).first(), "sub-habit options", { optional: true, expectMove: true })) {
          await h.check("habit editor: sub-habit options");
          // Give it XP (shows on its row), then mark it not required (owner, Nov 14).
          await h.tap((p) => p.getByRole("menuitem", { name: /give xp/i }).first(), "sub-habit: give XP", { optional: true, expectMove: true });
          await h.check("habit editor: sub-habit XP on its row");
          await h.tap((p) => p.getByRole("button", { name: /options for stretch/i }).first(), "sub-habit options again", { optional: true, expectMove: true });
          await h.tap((p) => p.getByRole("menuitemcheckbox", { name: /required to finish/i }).first(), "sub-habit: not required", { optional: true });
          await h.check("habit editor: sub-habit optional");
          await h.page.keyboard.press("Escape").catch(() => {});
          await h.settle(200);
        }
        // Escape above may have shut the editor: open it again for the pills.
        if (!(await h.page.locator("[data-mi=pills]").first().isVisible().catch(() => false))) {
          await h.tap("text=Gym 🏋️", "habit editor again", { optional: true, expectMove: true });
          await h.settle(500);
        }
        // Its details are pills now: open Repeats, then pick Certain days.
        await h.tap((p) => p.locator("[data-mi=pills] button").first(), "repeats pill", { optional: true, expectMove: true });
        await h.check("habit editor: repeats pill");
        if (await h.tap((p) => p.getByRole("button", { name: /^certain days$/i }).first(), "certain days", { optional: true, expectMove: true })) {
          await h.check("habit editor: certain days");
        }
        // XP & coins: the quest editor's −5 [bar] +5 row; When: the time of day; ⋯: Delete habit.
        await h.tap((p) => p.locator("[data-mi=pills] button").nth(2), "xp pill", { optional: true, expectMove: true });
        await h.check("habit editor: xp pill");
        await h.tap((p) => p.locator("[data-mi=pills] button").nth(3), "when pill", { optional: true, expectMove: true });
        await h.check("habit editor: when pill");
        // When (owner, Nov 16): Any time · At · Before · Between; "Before" needs only an end time.
        if (await h.tap((p) => p.locator("[data-time-range] button", { hasText: /^Before$/ }).first(), "when: before", { optional: true, expectMove: true })) await h.check("habit editor: sometime before");
        if (await h.tap((p) => p.locator("[data-time-range] button", { hasText: /^Between$/ }).first(), "when: between", { optional: true, expectMove: true })) await h.check("habit editor: between two times");
        if (await h.tap((p) => p.getByRole("button", { name: /^more$/i }).first(), "habit menu", { optional: true, expectMove: true })) {
          await h.check("habit editor: menu");
        }
        // Leaving with unsaved edits asks first (note b9d04a98): Keep editing · Discard · Save, in the foot.
        if (!(await h.page.getByRole("dialog", { name: /edit rite/i }).first().isVisible().catch(() => false))) {
          await h.tap("text=Gym 🏋️", "habit editor for leaving", { optional: true, expectMove: true });
          await h.settle(500);
        }
        await h.page.getByRole("dialog", { name: /edit rite/i }).getByLabel(/^habit$/i).first().fill("Gym and a stretch").catch(() => {});
        await h.settle(200);
        if (await h.tap((p) => p.getByRole("dialog", { name: /edit rite/i }).getByRole("button", { name: /^close$/i }).first(), "habit editor: close with edits", { optional: true, expectMove: true })) {
          await h.check("habit editor: save your changes?");
          await h.tap((p) => p.getByRole("alertdialog", { name: /save your changes/i }).getByRole("button", { name: /^discard$/i }).first(), "habit editor: discard", { optional: true, expectMove: true });
          await h.settle(300);
        }
        await esc(h);
      }
    },
  },
  {
    // The new-adventurer walkthrough (owner, Nov 13–15): his first words and your name, the character painter,
    // the two starter quests, Explore the realm (Today's parts, the screens, claimed with a celebration), then
    // Create your first quest (name, time, due, reward with the XP guide, create, claim), and the end.
    name: "tour",
    async run(h) {
      await h.goto("/", { name: "tour" });
      await h.page.evaluate(() => {
        localStorage.setItem("tour-state", JSON.stringify({ step: "intro", done: false, at: Date.now() + 1e9 }));
        window.dispatchEvent(new Event("tour-change"));
      });
      await h.settle(900);
      if (!(await h.page.locator("[data-tour-card]").count())) throw new Error("Walkthrough card didn't show");
      await h.check("tour: intro");
      // His welcome in the other two looks (the speech bubble shows him saying it).
      for (const look of ["spirit", "page"]) {
        await h.page.evaluate((l) => (localStorage.setItem("tour-look", l), window.dispatchEvent(new Event("tour-look-change"))), look);
        await h.settle(500);
        await h.check(`tour: intro, look ${look}`);
      }
      await h.page.evaluate(() => (localStorage.removeItem("tour-look"), window.dispatchEvent(new Event("tour-look-change"))));
      await h.settle(300);
      const card = (p) => p.locator("[data-tour-card]");
      const next = async (label, shot) => {
        await h.tap((p) => card(p).getByRole("button", { name: new RegExp(`^${label}`, "i") }), `tour: ${shot}`, { optional: true, expectMove: true });
        await h.settle(700);
        await h.check(`tour: ${shot}`);
      };
      // Snooze sits at the card's lower left and opens its choices in place.
      await h.tap((p) => p.getByRole("button", { name: /snooze or skip the walkthrough/i }), "tour: snooze choices", { expectMove: true });
      await h.check("tour: snooze choices");
      await h.tap((p) => p.getByRole("button", { name: /snooze or skip the walkthrough/i }), "tour: snooze choices closed", { optional: true });
      await h.page.locator("#tour-name").fill("Robin").catch(() => {});
      await next("let's begin", "character");
      if (!(await h.page.locator("[data-tour-character]").count())) throw new Error("Character painter missing from the walkthrough");
      await h.typeIn((p) => p.locator("[data-tour-character] textarea").first(), "tour character", "A calm monk with a lantern");
      await h.tap((p) => card(p).getByRole("radio", { name: /storybook/i }), "tour: art style", { optional: true });
      await h.tap((p) => card(p).getByRole("button", { name: /tips for a great portrait/i }), "tour: portrait tips", { optional: true, expectMove: true });
      await h.check("tour: character described");
      // The fake database can't paint: skip the step, which sets out the two starter quests and tours the home screen.
      await next("skip this step", "home: you");
      for (const shot of ["home: due soon", "home: daily habits", "home: today's quests", "home: additional quests", "home: victories today"]) await next("next", shot);
      await next("next", "two starter quests");
      if ((await h.page.getByText(/explore the realm/i).count()) < 2) throw new Error("Starter quest “Explore the realm” isn't on Today");
      await next("explore the realm", "explore: calendar");
      for (const shot of ["explore: boards", "explore: insights", "explore: party", "explore: treasure chest", "explore: feedback"]) await next("next", shot);
      await h.tap((p) => card(p).getByRole("button", { name: /claim this quest/i }), "tour: claim explore", { optional: true, expectMove: true });
      await h.settle(2500);
      await h.page.getByRole("button", { name: /^continue$/i }).first().click({ timeout: 3000 }).catch(() => {});
      await h.page.keyboard.press("Escape").catch(() => {});
      await h.settle(1200);
      await h.check("tour: one quest left");
      await next("create your first quest", "create: intro, pointing at +");
      await h.tap(/^create something new$/i, "tour: + ", { expectMove: true });
      await h.settle(500);
      await h.check("create: tap New quest");
      await h.tap((p) => p.getByRole("button", { name: /^new quest/i }).first(), "tour: + › New quest", { optional: true, expectMove: true });
      await h.settle(900);
      await h.check("create: name it");
      await h.typeIn((p) => p.locator('[role="dialog"][data-save-keys] [aria-label="Title"]').first(), "tour title", "Call the dentist");
      await next("next", "create: how long");
      await next("next", "create: due day");
      await next("next", "create: reward, tap XP");
      await h.tap((p) => p.locator('[role="dialog"][data-save-keys] [data-tour="fact-xp"]').first(), "tour: XP pill", { optional: true, expectMove: true });
      await h.settle(500);
      if (await h.page.locator('[data-xp-guide] button:not([aria-label="Hide this tip"])').count()) throw new Error("The XP tip still has buttons that fill the reward in");
      await h.check("create: XP controls lit");
      await next("next", "create: create it");
      await h.tap((p) => p.locator('[role="dialog"][data-save-keys] [data-submit]').first(), "tour: create quest", { optional: true, expectMove: true });
      await h.settle(2500);
      await h.check("create: engage your quest");
      await h.tap((p) => p.locator("[data-task-id]", { hasText: "Call the dentist" }).getByRole("button", { name: /^quest actions$/i }).first(), "tour: quest menu", { optional: true, expectMove: true });
      await h.settle(500);
      await h.tap((p) => p.getByRole("menuitem", { name: /engage quest/i }).first(), "tour: engage quest", { optional: true, expectMove: true });
      await h.settle(900);
      await h.check("create: one quest, nothing else");
      await h.tap((p) => p.locator(".one-thing").getByRole("button", { name: /complete/i }).first(), "tour: complete in engage", { optional: true, expectMove: true });
      await h.settle(2500);
      await h.page.getByRole("button", { name: /^continue$/i }).first().click({ timeout: 3000 }).catch(() => {});
      await h.page.keyboard.press("Escape").catch(() => {});
      await h.settle(1200);
      await h.check("create: claim your first victory");
      await h.tap((p) => p.getByRole("checkbox", { name: /complete create your first quest/i }).first(), "tour: claim create", { optional: true, expectMove: true });
      await h.settle(2500);
      await h.page.getByRole("button", { name: /^continue$/i }).first().click({ timeout: 3000 }).catch(() => {});
      await h.page.keyboard.press("Escape").catch(() => {});
      await h.settle(1200);
      await h.check("tour: you're ready");
      // The other two looks, on the last card.
      for (const look of ["spirit", "page"]) {
        await h.page.evaluate((l) => (localStorage.setItem("tour-look", l), window.dispatchEvent(new Event("tour-look-change"))), look);
        await h.settle(500);
        await h.check(`tour: look ${look}`);
      }
      await h.page.evaluate(() => (localStorage.removeItem("tour-look"), window.dispatchEvent(new Event("tour-look-change"))));
      // Leave the walkthrough finished for the flows after this one.
      await h.page.evaluate(() => localStorage.setItem("tour-state", JSON.stringify({ step: "end", done: true, at: Date.now() + 2e9 })));
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
      // The rite's own header (its name first): the whole card is also a swipe button ("Skip tonight Snooze Celebrate…"),
      // and tapping that one at its centre lands on a win in the open tray and opens its quest editor.
      await h.toggle(/^celebrate today.s wins/i, "today's wins");
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
        // Sub-quests can pay coins (owner, Nov 14): ⋯ › Give coins puts a coin count on the row.
        if (await h.tap((p) => p.locator("[data-import-steps]").getByRole("menuitem", { name: /give coins/i }).first(), "sub-quest: give coins", { optional: true, expectMove: true })) await h.check("sub-quest: coins");
        else await h.page.keyboard.press("Escape");
      }
      // The name edits where it sits (no ✎).
      if (await h.tap((p) => p.getByRole("textbox", { name: /^name$/i }).first(), "card: name in place", { optional: true })) {
        await h.check("card: editing the name");
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
      if (await h.tap((p) => p.locator("[data-import-attrs]").getByRole("button", { name: /^(urgency|importance)/i }).first(), "attrs: importance", { optional: true, expectMove: true })) await h.check("attrs: importance open");
      if (await h.tap((p) => p.locator("[data-import-attrs]").getByRole("button", { name: /^time$|^\d+m$/i }).first(), "attrs: time", { optional: true, expectMove: true })) await h.check("attrs: time open");
      // One When pill (owner, Nov 18): Complete by, then Flexible · Fixed, then an optional time on the calendar.
      if (await h.tap((p) => p.locator("[data-import-attrs]").getByRole("button", { name: /^(when|within|by |around)/i }).first(), "attrs: when", { optional: true, expectMove: true })) {
        await h.check("when open");
        if (await h.tap((p) => p.locator("[data-import-attrs] button", { hasText: /^Within a week$/ }).first(), "when: within a week", { optional: true, expectMove: true })) {
          await h.settle(400);
          await h.check("when: flexible within a week");
          if (await h.tap((p) => p.locator("[data-when-firm] button", { hasText: /^Fixed$/ }).first(), "when: fixed", { optional: true })) {
            await h.settle(300);
            await h.check("when: fixed");
          }
        }
        if (await h.tap((p) => p.locator("[data-import-attrs] button", { hasText: /^(Open the day|Change)$/ }).first(), "when: open the day", { optional: true, expectMove: true })) {
          await h.settle(700);
          await h.check("when: the day open");
          await h.tap((p) => p.locator("[data-import-attrs] button", { hasText: /^✨ Auto-schedule/ }).first(), "when: pick the time", { optional: true, expectMove: true });
          await h.check("when: time picked");
        }
      }
      // The board is the tag on the portrait (owner, Nov 12): it opens every board, sub-boards folded with a count.
      if (await h.tap((p) => p.locator("[data-import-portrait]").getByRole("button", { name: /^board/i }).first(), "portrait: board tag", { optional: true, expectMove: true })) {
        await h.check("board list open");
        if (await h.tap((p) => p.locator("[data-import-boards]").getByRole("button", { name: /boards? inside/i }).first(), "board list: open sub-boards", { optional: true, expectMove: true })) await h.check("board list: sub-boards");
        await h.tap((p) => p.locator("[data-import-boards]").getByRole("button", { pressed: false }).first(), "board list: pick", { optional: true, expectMove: true });
      }
      // Tiny sits under the portrait as in the quest editor (owner, Nov 14).
      if (await h.tap((p) => p.locator("[data-import-portrait]").getByText(/tiny task/i).first(), "portrait: tiny", { optional: true })) await h.check("tiny on");
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
        if (await h.tap((p) => p.locator("[data-import-attrs]").getByRole("button", { name: /^(when|within|by |around)/i }).first(), "list: when", { optional: true })) {
          await h.tap((p) => p.locator("[data-import-attrs] button", { hasText: /^Within a week$/ }).first(), "list: within a week", { optional: true });
          await h.check("list: within a week");
        }
        await h.tap((p) => p.getByRole("button", { name: /import as|add as|log as/i }).first(), "import from list", { optional: true });
        await h.check("list: import steps");
        // After Import the message says where it went, with Auto-schedule now for a quest on the list (owner, Nov 18).
        if (await h.tap((p) => p.getByRole("button", { name: /^add to my list to schedule|^add the quest/i }).first(), "list: add it", { optional: true })) {
          await h.settle(900);
          await h.check("import toast");
          if (await h.tap((p) => p.locator("[role=status] button", { hasText: /^auto-schedule now/i }).first(), "toast: auto-schedule now", { optional: true })) {
            await h.settle(1500);
            await h.check("toast: auto-scheduled");
          }
        }
        if (await h.find((p) => p.getByPlaceholder(/search/i).first()).isVisible().catch(() => false)) await h.typeIn((p) => p.getByPlaceholder(/search/i).first(), "import search");
      }
    },
  },
  {
    name: "settings",
    async run(h) {
      await h.goto("/settings", { name: "settings" });
      await h.check("top");
      // Roller trim (owner, Nov 20): Settings › Boards offers Ornaments · Lines · Plain with a preview.
      await h.goto("/settings?open=boards-look", { name: "settings roller trim" });
      await h.check("roller trim: ornaments");
      if (await h.tap((p) => p.getByRole("radio", { name: "Lines" }), "roller trim: lines", { optional: true })) await h.check("roller trim: lines");
      if (await h.tap((p) => p.getByRole("radio", { name: "Plain" }), "roller trim: plain", { optional: true })) await h.check("roller trim: plain");
      await h.tap((p) => p.getByRole("radio", { name: "Ornaments" }), "roller trim: back to ornaments", { optional: true });
      await h.goto("/settings", { name: "settings" });
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
      // The check-in log (owner, Nov 10 and 18): today's by default, a longer range from its drop-down, and each one's
      // ⋯ with Star, Change and Remove.
      if (await h.tap((p) => p.locator("[data-checkin-log] button[aria-label='Check-in options']").first(), "check-in ⋯", { optional: true, expectMove: true })) {
        await h.settle(400);
        await h.check("check-in log: options");
        await h.tap((p) => p.locator("[data-checkin-log] [role=menuitem]", { hasText: /^Star$/ }).first(), "star a check-in", { optional: true });
        await h.settle(400);
        await h.check("check-in log: starred");
      } else h.record({ kind: "checkin-log", severity: "error", target: "check-in log", detail: "No check-in in today's log to open (the fixtures have one an hour ago)" });
      if (await h.tap((p) => p.locator("[data-checkin-log] button[aria-expanded]").first(), "check-in log range", { optional: true, expectMove: true })) {
        await h.tap((p) => p.locator("[data-checkin-log] [role=radio]", { hasText: "This week" }).first(), "this week", { optional: true, expectMove: true });
        await h.settle(500);
        await h.check("check-in log: this week");
        await h.tap((p) => p.locator("[data-checkin-log] button[aria-expanded]").first(), "check-in log range again", { optional: true, expectMove: true });
        await h.tap((p) => p.locator("[data-checkin-log] [role=radio]", { hasText: "Today" }).first(), "today", { optional: true, expectMove: true });
      }
      // The chart waits behind a plain button (owner, Nov 9).
      if (await h.tap(/show insights chart/i, "show the chart", { optional: true })) {
        await h.settle(500);
        await h.check("chart open");
        // Round 3 (owner, Nov 19): a week, things on the chart by how they felt; then split, with its panels resized.
        if (await h.tap((p) => p.getByRole("button", { name: /^chart view settings$/i }).first(), "chart gear", { optional: true, expectMove: true })) {
          await h.tap((p) => p.getByRole("dialog", { name: /chart view settings/i }).getByRole("radio", { name: /^week$/i }).first(), "chart: a week", { optional: true });
          await h.page.keyboard.press("Escape");
          await h.settle(500);
          await h.check("chart: the week, merged");
          // A month and three months: the dates squish together (owner, Nov 19).
          for (const [span, name] of [["month", "a month"], ["3 months", "three months"]]) {
            await h.tap((p) => p.getByRole("button", { name: /^chart view settings$/i }).first(), `chart gear for ${name}`, { optional: true, expectMove: true });
            await h.tap((p) => p.getByRole("dialog", { name: /chart view settings/i }).getByRole("radio", { name: new RegExp(`^${span}$`, "i") }).first(), `chart: ${name}`, { optional: true });
            await h.page.keyboard.press("Escape");
            await h.settle(500);
            await h.check(`chart: ${name}, squished`);
            // Grid lines: Few · Some · Many (owner, Nov 19), on the month.
            if (span !== "month") continue;
            for (const g of ["Few", "Many", "Some"]) {
              await h.tap((p) => p.getByRole("button", { name: /^chart view settings$/i }).first(), `chart gear, grid ${g}`, { optional: true, expectMove: true });
              await h.tap((p) => p.getByRole("dialog", { name: /chart view settings/i }).getByRole("radio", { name: new RegExp(`^${g}$`, "i") }).first(), `grid: ${g}`, { optional: true });
              await h.page.keyboard.press("Escape");
              await h.settle(400);
              if (g !== "Some") await h.check(`chart: a month, ${g.toLowerCase()} grid lines`);
            }
            // Lines between days (owner, Nov 19): each choice in the gear, then back to the default.
            for (const ln of ["Dotted", "Solid", "Weeks only", "None", "Dotted, weeks solid"]) {
              await h.tap((p) => p.getByRole("button", { name: /^chart view settings$/i }).first(), `chart gear, day lines ${ln}`, { optional: true, expectMove: true });
              await h.tap((p) => p.getByRole("dialog", { name: /chart view settings/i }).getByRole("radio", { name: ln, exact: true }).first(), `day lines: ${ln}`, { optional: true });
              await h.page.keyboard.press("Escape");
              await h.settle(400);
              if (ln !== "Dotted, weeks solid") await h.check(`chart: a month, day lines ${ln.toLowerCase()}`);
            }
            // XP as coins (owner, Nov 19: off by default, toggled on in the gear).
            for (const on of [true, false]) {
              await h.tap((p) => p.getByRole("button", { name: /^chart view settings$/i }).first(), `chart gear, coins ${on}`, { optional: true, expectMove: true });
              await h.tap((p) => p.getByRole("dialog", { name: /chart view settings/i }).getByText(/xp as coins/i).first(), `XP as coins ${on ? "on" : "off"}`, { optional: true });
              await h.page.keyboard.press("Escape");
              await h.settle(400);
              if (on) await h.check("chart: a month, XP as coins");
            }
          }
          await h.tap((p) => p.getByRole("button", { name: /^chart view settings$/i }).first(), "chart gear, week again", { optional: true, expectMove: true });
          await h.tap((p) => p.getByRole("dialog", { name: /chart view settings/i }).getByRole("radio", { name: /^week$/i }).first(), "chart: week again", { optional: true });
          await h.page.keyboard.press("Escape");
          await h.tap((p) => p.getByRole("button", { name: /^chart view settings$/i }).first(), "chart gear again", { optional: true, expectMove: true });
          await h.tap((p) => p.getByRole("dialog", { name: /chart view settings/i }).getByRole("radio", { name: /^split$/i }).first(), "chart: split", { optional: true });
          await h.page.keyboard.press("Escape");
          await h.settle(500);
          await h.check("chart: split");
          const edge = h.page.locator("[role=separator][aria-label='Resize the time-of-day panel']").first();
          const box = await edge.boundingBox().catch(() => null);
          if (box) {
            await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await h.page.mouse.down();
            await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60, { steps: 6 });
            await h.page.mouse.up();
            await h.settle(400);
            await h.check("chart: split, the time panel taller");
          }
          await h.tap((p) => p.getByRole("button", { name: /^show/i }).first(), "chart: what's shown", { optional: true, expectMove: true });
          await h.check("chart: the Show list");
          await h.page.keyboard.press("Escape");
          await h.tap((p) => p.getByRole("button", { name: /^chart view settings$/i }).first(), "chart gear, back", { optional: true, expectMove: true });
          await h.tap((p) => p.getByRole("dialog", { name: /chart view settings/i }).getByRole("radio", { name: /^merged$/i }).first(), "chart: merged", { optional: true });
          await h.page.keyboard.press("Escape");
        }
      }
      // The check-in's Journal: five faces, words on the card, and Tag / event and Supplement inside it; what you started
      // is kept if you leave and come back (owner, Nov 18).
      if (await h.tap((p) => p.locator("section[aria-label='Check in'] button", { hasText: /^✎ Journal$|^Journal$/ }).first(), "check-in journal", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.page.locator("[data-checkin-journal] textarea").first().fill("Slept well, slow start").catch(() => {});
        await h.check("check-in journal: faces, words, tag and supplement inside");
        if (!(await h.page.locator("[data-checkin-journal] button", { hasText: /tag \/ event/i }).count())) h.record({ kind: "checkin-journal", severity: "error", target: "check-in journal", detail: "Tag / event isn't inside the journal" });
        await h.page.reload();
        await h.settle(1500);
        const kept = (await h.page.locator("[data-checkin-draft]").count()) > 0;
        if (!kept) h.record({ kind: "checkin-draft", severity: "error", target: "check-in draft", detail: "A started check-in wasn't kept after leaving and coming back" });
        await h.check("check-in: kept from earlier");
        await h.tap((p) => p.locator("[data-checkin-draft] button").first(), "start fresh", { optional: true, expectMove: true });
      }
      // Spin the Wheel of Time by hand (owner, Nov 9): past halfway it sticks and asks what turned it.
      {
        const wheel = h.page.locator("[data-wheel-spin]").first();
        if (await wheel.count()) {
          await wheel.scrollIntoViewIfNeeded().catch(() => {});
          const b = await wheel.boundingBox();
          if (b) {
            const cx = b.x + b.width / 2, cy = b.y + b.height * (207 / 440), r = b.width * 0.36;
            await h.page.mouse.move(cx + r, cy);
            await h.page.mouse.down();
            for (const deg of [3, 6, 9, 12]) await h.page.mouse.move(cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180), { steps: 2 });
            await h.page.mouse.up();
            const stuck = await h.page.locator("[data-wheel-pulled]").first().waitFor({ timeout: 2500 }).then(() => true).catch(() => false);
            await h.settle(600);
            await h.check("wheel: spun by hand, stuck halfway");
            if (!stuck) h.record({ kind: "wheel-spin", severity: "error", target: "wheel of time", detail: "Dragging the wheel past halfway didn't ask what turned it" });
            else await h.tap((p) => p.locator("[data-wheel-pulled] button", { hasText: /roll back/i }).first(), "let it roll back", { optional: true, expectMove: true });
          }
        }
      }
      // Wheel factors move by dragging (owner, Nov 17).
      if (await h.tap((p) => p.getByRole("button", { name: /edit what's on the wheel/i }).first(), "edit the wheel", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("wheel: its lists, dragged to reorder");
        await h.tap((p) => p.getByRole("button", { name: /^done$/i }).first(), "wheel lists done", { optional: true, expectMove: true });
      }
      await h.toggle(/last night/i, "last night", {});
      await h.tap(/did it/i, "ritual did it", { optional: true });
      await h.check("after ritual");
      // The leaf button by the tracked events (owner, Nov 12): time wheels, now by default, then Log it.
      if (await h.tap((p) => p.locator("[data-leaf-log]").first(), "leaf button", { optional: true, expectMove: true })) {
        await h.settle(500);
        await h.check("leaf: time wheels");
        // Tap the chosen hour to type the time (owner, Nov 17).
        {
          const hour = await h.page.locator("[data-time-wheels] [role=spinbutton][aria-label=Hour]").first().boundingBox().catch(() => null);
          if (hour) {
            await h.page.mouse.click(hour.x + hour.width / 2, hour.y + 34 * 1.5);
            const typed = await h.page.locator("[data-time-wheels] input[aria-label='Type a time']").first().waitFor({ timeout: 2000 }).then(() => true).catch(() => false);
            if (!typed) h.record({ kind: "time-type", severity: "error", target: "time wheels", detail: "Tapping the chosen hour didn't open a field to type the time" });
            else {
              await h.page.keyboard.press("Control+A");
              await h.page.keyboard.type("7:05 am");
              await h.check("time wheels: typing a time");
              await h.page.keyboard.press("Enter");
              await h.settle(400);
            }
          }
        }
        await h.tap((p) => p.getByRole("button", { name: /^log it$/i }).first(), "log it", { optional: true, expectMove: true });
        await h.settle(700);
        await h.check("leaf: logged");
      }
      // Check in, then: Edit check-in opens the latest to change, and Check in again is a gold button (owner, Nov 18).
      await h.goto("/insights", { name: "insights" });
      {
        const slider = h.page.locator("section[aria-label='Check in'] input[type=range]").first();
        if (await slider.count()) {
          await slider.focus().catch(() => {});
          for (let i = 0; i < 3; i++) await h.page.keyboard.press("ArrowRight");
          await h.settle(300);
          if (await h.tap((p) => p.getByRole("button", { name: /^submit check-in$/i }).first(), "submit check-in", { optional: true, expectMove: true })) {
            await h.settle(1200);
            await h.check("after checking in");
            if (await h.tap((p) => p.getByRole("button", { name: /^edit check-in$/i }).first(), "edit check-in", { optional: true, expectMove: true })) {
              await h.settle(700);
              await h.check("edit check-in: the latest one to change");
              await esc(h);
            }
          }
        }
      }
    },
  },
  {
    // Quest Drop (owner, Nov 18): the scheduling list as a falling-blocks game, from the calendar's plan buttons.
    name: "questdrop",
    async run(h) {
      await h.goto("/calendar?view=week", { name: "questdrop" });
      await h.settle(1000);
      await h.page.evaluate(() => localStorage.setItem("quest-drop", JSON.stringify({ sound: "off", startSpeed: 1, ramp: 0.5, musicLink: "" })));
      await h.page.locator("[data-quest-drop-open]").first().scrollIntoViewIfNeeded().catch(() => {});
      await h.page.locator("[data-quest-drop-open]").first().click({ timeout: 5000 });
      await h.page.locator("[data-quest-drop-card=ready]").waitFor({ timeout: 15000 });
      await h.check("ready to start");
      await h.page.getByRole("button", { name: /^game settings$/i }).first().click();
      await h.settle(500);
      await h.check("settings open");
      // My music (owner, Nov 19): songs saved to the account, and "Add this song for everyone".
      {
        const link = h.page.getByLabel("A song or playlist link");
        if (await link.count()) {
          await link.fill("https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd");
          await h.settle(500);
          await h.check("settings: adding a song");
          await link.fill("");
          await h.settle(300);
        }
      }
      await h.page.getByRole("button", { name: /^game settings$/i }).first().click();
      await h.settle(400);
      await h.page.locator("[data-quest-drop-start]").click();
      await h.settle(900);
      if (!(await h.page.locator("[data-quest-drop-falling]").count())) throw new Error("questdrop: no quest came down after Start");
      if (!(await h.page.locator("[data-quest-drop-ghost]").count())) h.record({ kind: "questdrop", severity: "warn", target: "ghost", detail: "No landing outline for the first quest" });
      await h.check("playing: first quest falling");
      // The quest list (owner, Nov 19): beside the board on large screens, a fold under "Next" on smaller ones.
      if (await h.page.locator("[data-quest-drop-queue-toggle]").isVisible()) {
        await h.page.locator("[data-quest-drop-queue-toggle]").click();
        await h.settle(500);
        await h.check("quest list open");
        await h.page.locator("[data-quest-drop-queue-toggle]").click();
        await h.settle(400);
      }
      await h.page.getByRole("button", { name: /^next day$/i }).click();
      await h.page.getByRole("button", { name: /^later in the day$/i }).click();
      await h.page.getByRole("button", { name: /^later in the day$/i }).click();
      await h.settle(300);
      await h.check("moved a day and down");
      await h.page.getByRole("button", { name: /^bring it back later$/i }).click();
      await h.settle(500);
      await h.check("later: when it comes back");
      await h.page.getByRole("button", { name: /^in 3 quests$/i }).click();
      await h.settle(500);
      // Enter asks "Put it here?" (owner, Nov 19): yes, adjust (15 min / a day), or redo.
      await h.page.getByRole("button", { name: /^place it$/i }).click();
      await h.settle(500);
      if (!(await h.page.locator("[data-quest-drop-ask]").count())) throw new Error("questdrop: Place didn't ask \"Put it here?\"");
      await h.check("asking: put it here?");
      await h.page.getByRole("button", { name: /^adjust$/i }).click();
      await h.page.getByRole("button", { name: /^15 minutes later$/i }).click();
      await h.page.getByRole("button", { name: /^a day later$/i }).click();
      await h.settle(400);
      await h.check("adjusting by hand");
      if (await h.page.getByRole("button", { name: /^done adjusting$/i }).isEnabled()) {
        await h.page.getByRole("button", { name: /^done adjusting$/i }).click();
      } else {
        await h.page.keyboard.press("Escape");
        await h.settle(300);
        await h.page.getByRole("button", { name: /^place it$/i }).click();
      }
      await h.settle(400);
      await h.page.getByRole("button", { name: /^yes, put it here$/i }).click();
      await h.settle(700);
      await h.check("placed one (with Undo)");
      await h.page.locator("[data-quest-drop] button[aria-label=Close]").click();
      await h.settle(600);
    },
  },
  {
    // Failing a quest from its calendar menu (owner, Nov 20: "it took away a different item from the calendar
    // completely", until a reload): every other card must still be there after the fail, and the failed one shows ✕.
    name: "calfail",
    async run(h) {
      await h.goto("/calendar?view=day", { name: "calendar" });
      await h.settle(1500);
      const titles = () => h.page.evaluate(() => [...document.querySelectorAll("[data-cal-days] [title^='Edit \"']")].map((n) => n.getAttribute("title").split("\n")[0]).sort());
      const before = await titles();
      const chip = h.page.locator("[data-cal-days] [title^='Edit \"Goblin']").first();
      if (!(await chip.count())) return h.record({ kind: "step-skipped", severity: "info", target: "calfail", detail: "no Goblin card on the day view" });
      await chip.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await h.settle(300);
      await chip.click({ button: "right" });
      await h.settle(400);
      await h.tap((p) => p.locator("[data-mi='fail']").first(), "Fail");
      await h.settle(300);
      await h.check("calendar fail: reason");
      await h.tap((p) => p.getByRole("button", { name: /^mark failed$/i }).first(), "Mark failed");
      await h.settle(2500);
      await h.check("calendar fail: marked");
      const after = await titles();
      const gone = before.filter((t) => !after.includes(t));
      if (gone.length) h.record({ kind: "card-vanished", severity: "error", target: "calendar fail", detail: `after failing Goblin, gone from the day: ${gone.join("; ")}` });
      await h.tap((p) => p.getByRole("button", { name: /^(not now|continue)$/i }).first(), "Continue", { optional: true });
      await h.settle(2500);
      const after2 = await titles();
      const gone2 = before.filter((t) => !after2.includes(t));
      if (gone2.length) h.record({ kind: "card-vanished", severity: "error", target: "calendar fail (menu closed)", detail: `gone: ${gone2.join("; ")}` });
      const failed = await h.page.locator("[data-cal-days] [title^='Edit \"Goblin'] [aria-label='Failed']").count();
      if (!failed) h.record({ kind: "not-failed", severity: "error", target: "calendar fail", detail: "Goblin's card doesn't show the red ✕ after Mark failed" });
      await h.check("calendar fail: closed");
    },
  },
  {
    // Completing a quest from its calendar menu (owner, Nov 19: "The completed screen should show before the check
    // goes onto the quest card"): the celebration first, the card still open behind it; the check once it closes.
    name: "calcomplete",
    async run(h) {
      await h.goto("/calendar?view=day", { name: "calendar" });
      await h.settle(1500);
      const sel = "[data-cal-days] [title^='Edit \"Goblin']";
      const chip = h.page.locator(sel).first();
      if (!(await chip.count())) return h.record({ kind: "step-skipped", severity: "info", target: "calcomplete", detail: "no Goblin card on the day view" });
      await chip.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await h.settle(300);
      await chip.click({ button: "right" });
      await h.settle(400);
      await h.tap((p) => p.locator("[data-mi='complete']").first(), "Complete quest", { expectMove: true });
      await h.settle(2500);
      await h.check("calendar complete: celebration");
      if (await h.page.locator(`${sel} [aria-label='Completed']`).count())
        h.record({ kind: "early-check", severity: "error", target: "calendar complete", detail: "the card shows its check while the celebration is still up" });
      await h.tap((p) => p.getByRole("button", { name: /^continue your journey$/i }).first(), "Continue Your Journey", { optional: true });
      await h.settle(1200);
      if (!(await h.page.locator(`${sel} [aria-label='Completed']`).count()))
        h.record({ kind: "no-check", severity: "error", target: "calendar complete", detail: "Goblin's card shows no check after the celebration closed" });
      await h.check("calendar complete: checked");
    },
  },
  {
    // The calendar (owner, Nov 3: "beautiful like the mockup"): week and day, quests and mini-quests for their duration.
    name: "calendar",
    async run(h) {
      await h.goto("/calendar?view=week", { name: "calendar" });
      await h.settle(1200);
      // The server's first picture (Nov 19, the loading glitch): only the days that will show, and no cards placed by
      // the server's clock. Before the fix a day view sent 15 squeezed day columns, a week 21.
      for (const [view, want] of [["day", 1], ["week", 7]]) {
        const html = await h.page.request.get(new URL(`/calendar?view=${view}`, h.page.url()).href).then((r) => r.text()).catch(() => "");
        const cols = (html.match(/data-cal-hit="/g) || []).length;
        const cards = (html.match(/class="[^"]*cal-chip/g) || []).length;
        if (html && (cols > want || cards > 0)) h.record({ kind: "first-picture", severity: "error", target: `calendar ${view}`, detail: `the server's page has ${cols} day columns (want ${want}) and ${cards} cards (want 0: cards are placed in the browser, in its time zone)` });
      }
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
        // Tap a row's calendar button: the "Tap a time to place …" line shows above the window (owner, Nov 19).
        if (await h.tap((p) => p.getByRole("button", { name: /^place .+ on the calendar$/i }).first(), "auto-scheduler: carry a quest", { optional: true, expectMove: true })) {
          await h.settle(300);
          await h.check("auto-scheduler: tap a time to place");
          await h.tap((p) => p.getByRole("status").getByRole("button", { name: /^cancel$/i }).first(), "auto-scheduler: carry cancelled", { optional: true });
        }
        // Closed again: on a phone the window covers the calendar's gear, which the next steps tap.
        await h.tap((p) => p.getByRole("button", { name: /^close the auto-scheduler$/i }).first(), "close the auto-scheduler", { optional: true });
        await h.settle(400);
      }
      await h.page.locator("[title^='Edit \"Goblin']").first().evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
      await h.settle(400);
      await h.check("week: the cards");
      // Display settings: what quest cards show (creature, time, XP, coins).
      if (await h.tap((p) => p.getByRole("button", { name: /display settings|calendar settings/i }).first(), "calendar display", { optional: true, expectMove: true })) {
        await h.check("display settings");
        // Calendar events as quests (owner, Nov 18–19): shows only with Google calendars, which the fake run has none of.
        if (await h.page.locator("[data-event-quests]").count()) await h.check("display: calendar events as quests");
        await h.tap((p) => p.getByRole("button", { name: /^creature$/i }).first(), "hide creature", { optional: true });
        await h.check("cards without creatures");
        await h.tap((p) => p.getByRole("button", { name: /^creature$/i }).first(), "show creature", { optional: true });
        await esc(h);
      }
      // Daily events (owner, Nov 14: rename "Wind-down", add your own), under the display gear. The gear's tap
      // above times out in the check (something lies over it in the fake run), so it's clicked from the page.
      {
        const gear = h.page.getByRole("button", { name: /^display settings$/i }).first();
        const listed = () => h.page.getByRole("button", { name: /add a daily event/i }).count();
        for (let i = 0; i < 2 && !(await listed()); i++) {
          await gear.evaluate((el) => el.click()).catch(() => {});
          await h.settle(400);
        }
      }
      if (await h.page.getByRole("button", { name: /add a daily event/i }).count()) {
        if (await h.tap((p) => p.getByRole("button", { name: /wind-down/i }).first(), "daily event: wind-down", { optional: true, expectMove: true })) {
          await h.check("daily event editor");
          await h.tap((p) => p.getByRole("button", { name: /wind-down/i }).first(), "daily event folded", { optional: true });
        }
        if (await h.tap((p) => p.getByRole("button", { name: /^\+ add a daily event$/i }).first(), "add a daily event", { optional: true, expectMove: true })) {
          await h.page.keyboard.type("Evening walk");
          await h.page.keyboard.press("Enter");
          await h.settle(500);
          await h.check("daily event added");
          if (!(await h.page.getByRole("button", { name: /evening walk/i }).count())) h.record({ kind: "not-added", severity: "error", target: "daily events", detail: "A new daily event didn't show in the list" });
        }
        await esc(h);
      }
      // Another session of a quest (owner, Nov 5: one quest in several calendar spots): right-click its card.
      {
        const card = h.page.locator("[title^='Edit \"Goblin']").first();
        if (await card.count()) {
          await card.click({ button: "right" }).catch(() => {});
          await h.settle(400);
          await h.check("quest menu: another session");
          // The menu's gear arranges it in place (owner, Nov 16): drag rows, the eye hides one, tap a name to rename.
          if (await h.tap((p) => p.locator("[data-menu=calendar-item]").getByRole("button", { name: /^arrange this menu/i }).first(), "calendar menu: arrange", { optional: true, expectMove: true })) {
            await h.check("calendar menu: arranging");
            if (await h.tap((p) => p.locator("[data-cal-menu-arrange]").getByRole("button", { name: /^hide remove from calendar$/i }).first(), "calendar menu: hide a row", { optional: true })) await h.check("calendar menu: a row hidden");
            await h.tap((p) => p.locator("[data-cal-menu-arrange]").getByRole("button", { name: /^show remove from calendar$/i }).first(), "calendar menu: show it again", { optional: true });
            await h.tap((p) => p.locator("[data-menu=calendar-item]").getByRole("button", { name: /^done arranging/i }).first(), "calendar menu: done arranging", { optional: true, expectMove: true });
            await h.check("calendar menu: arranged");
          }
          if (await h.tap((p) => p.getByRole("menuitem", { name: /additional time block/i }).first(), "another session", { optional: true, expectMove: true })) {
            await h.settle(900);
            await h.check("another session picker");
            await esc(h);
          } else await esc(h);
        }
      }
      // A repeating event's quests share a look (owner, Nov 18): raise one gym session's XP, close the editor,
      // and the card at the foot asks "Just this one · This and later · All".
      {
        const card = h.page.locator("[title^='Edit \"Gym with Sam']").first();
        if (await card.count()) {
          await card.click({ button: "right" }).catch(() => {});
          await h.settle(400);
          await h.check("event menu: failed-safe menu with ×");
          if (await h.tap((p) => p.getByRole("menuitem", { name: /^edit quest$/i }).first(), "edit the gym quest", { optional: true, expectMove: true })) {
            await h.settle(1200);
            await h.tap((p) => p.locator("[data-tour=fact-xp]").first(), "xp pill", { optional: true, expectMove: true });
            await h.settle(400);
            await h.tap((p) => p.locator("[data-tour=xp-row] button", { hasText: "+5" }).first(), "+5 XP", { optional: true });
            await h.settle(900);
            await h.page.keyboard.press("Escape");
            const asked = await h.page.locator("[data-series-ask]").first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
            if (!asked) h.record({ kind: "series-ask", severity: "error", target: "series look", detail: "Changing one gym session's XP didn't ask about the other sessions" });
            else {
              await h.settle(500);
              await h.check("series look: asks this one / later / all");
              await h.tap((p) => p.locator("[data-series-ask] [data-scope=all]").first(), "save for all", { optional: true, expectMove: true });
              const saved = await h.page.locator("[data-series-ask]", { hasText: "Saved for" }).first().waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
              if (!saved) h.record({ kind: "series-ask", severity: "error", target: "series look", detail: `After "All" the card never said it saved` });
              else await h.check("series look: saved for all");
              await h.settle(2200);
            }
          } else await esc(h);
        } else h.record({ kind: "series-ask", severity: "warning", target: "series look", detail: "The gym quest wasn't on the week view" });
      }
      // Shorter than its block (owner, Nov 5): the 90-minute workshop draft set to 30 min asks before shrinking.
      {
        const card = h.page.locator("[title^='Edit \"Draft the facilitation']").first();
        if (await card.count()) {
          await card.click({ button: "right" }).catch(() => {});
          await h.settle(400);
          if (await h.tap((p) => p.getByRole("menuitem", { name: /^edit quest$/i }).first(), "edit the workshop draft", { optional: true, expectMove: true })) {
            await h.settle(1200);
            await h.tap((p) => p.locator("[data-tour=fact-time]").first(), "time pill", { optional: true, expectMove: true });
            await h.settle(400);
            await h.tap((p) => p.getByRole("button", { name: /^30m$|^30 min$|^30$/ }).first(), "30 minutes", { optional: true });
            await h.settle(900);
            await h.page.keyboard.press("Escape");
            const asked = await h.page.locator("[data-shrink-ask]").first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
            if (!asked) h.record({ kind: "shrink-ask", severity: "warning", target: "shorter quest", detail: "Making a 90-minute calendar quest 30 minutes didn't ask about its block" });
            else {
              await h.check("shorter quest: asks before shrinking its block");
              await h.tap((p) => p.locator("[data-shrink-ask] [data-shrink=yes]").first(), "shorten it", { optional: true, expectMove: true });
              await h.settle(1500);
              await h.check("shorter quest: block shrunk");
            }
          } else await esc(h);
        }
      }
      // Seamless days (repeat ask 12): scroll sideways part of a day; it stays where it's left.
      await h.page.evaluate(() => document.querySelector(".cal-days-scroll")?.scrollBy({ left: 130 })).catch(() => {});
      await h.settle(900);
      await h.check("week: scrolled partway");
      // The days' zoom (owner, Nov 5 and 12: "a slider from 1-14 days… partial days… super smooth"): slide to about
      // 2½ days (close up, bigger words on the cards), let it settle and load, then glide out a day with the magnifier.
      {
        const zoom = h.page.locator("[data-days-zoom] input[type=range]").first();
        if (await zoom.count()) {
          await zoom.evaluate((el) => {
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
            set.call(el, String(1000 - Math.round((Math.log(2.5) / Math.log(14)) * 1000)));
            el.dispatchEvent(new Event("input", { bubbles: true }));
          });
          await h.settle(1800);
          // The hours grow with the zoom at once (measured 70 ms after the change). A person's drag counts as input, but
          // this scripted change doesn't, so the check took it for the page jumping by itself (Nov 19): drop those.
          await h.page.evaluate(() => (window.__uiShifts || []).splice(0)).catch(() => {});
          await h.check("week: zoomed to 2½ days");
          const words = await h.page.locator("[data-days-zoom]").first().innerText().catch(() => "");
          if (!/2½ days/.test(words)) h.record({ kind: "zoom", severity: "error", target: "days zoom", detail: `The slider reads "${words}" after sliding to 2½ days` });
          await h.tap((p) => p.getByRole("button", { name: /^more days/i }).first(), "zoom out a day", { optional: true });
          await h.settle(1500);
          await h.check("week: zoomed out a day");
          // Back to the week for the steps that follow.
          await zoom.evaluate((el) => {
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
            set.call(el, String(1000 - Math.round((Math.log(7) / Math.log(14)) * 1000)));
            el.dispatchEvent(new Event("input", { bubbles: true }));
          });
          await h.settle(1500);
        } else h.record({ kind: "zoom", severity: "error", target: "days zoom", detail: "No days zoom slider on the week view" });
      }
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
            // On the hold itself: a quest drawn over it (the fixtures' times follow the clock) would open the quest's menu.
            if (at && at.closest(".cal-days-scroll") && at.closest("[data-hold-key=lunch]")) return { x, y };
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
          if (await h.tap((p) => p.getByRole("menuitem", { name: /rename or change every day/i }).first(), "essential: every day", { optional: true, expectMove: true })) await h.check("essential's every-day editor");
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
    // The feedback box (repeat asks 14 and the Nov 12 rebuild): one place decides where it is, so it never
    // jumps; it resizes from the bottom; the button is always there, the same size, above every popup.
    name: "feedback",
    async run(h) {
      const p = h.page;
      const KB = 336;
      const fail = (detail) => h.record({ kind: "feedback-box", severity: "error", target: "feedback box", detail });
      const btn = () => p.locator("[data-feedback-btn]").first();
      const press = (loc) => (h.isPhone ? loc.tap({ timeout: 4000 }) : loc.click({ timeout: 4000 }));
      const rectOf = (sel) =>
        p.evaluate((sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect();
          return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
        }, sel);
      // Every frame: where the box and the button are, and how often the box's entrance starts.
      const traceStart = () =>
        p.evaluate(() => {
          const t = (window.__fbTrace = { rows: [], anims: 0, on: true });
          const onAnim = (e) => {
            if (e.animationName === "create-sheet-in" && e.target instanceof Element && e.target.closest("[data-feedback-box]")) t.anims++;
          };
          document.addEventListener("animationstart", onAnim, true);
          t.off = () => document.removeEventListener("animationstart", onAnim, true);
          const tick = () => {
            if (!t.on) return;
            const r = document.querySelector("[data-feedback-box]")?.getBoundingClientRect();
            const b = document.querySelector("[data-feedback-btn]")?.getBoundingClientRect();
            t.rows.push({ box: r ? [r.left, r.top, r.width, r.height] : null, btn: b ? [b.left, b.top, b.width, b.height] : null });
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      const traceStop = () =>
        p.evaluate(() => {
          const t = window.__fbTrace;
          t.on = false;
          t.off();
          return { rows: t.rows, anims: t.anims };
        });
      /** The biggest change of the box's place or size between two frames in a row. */
      const maxStep = (rows) => {
        let m = 0;
        for (let i = 1; i < rows.length; i++) if (rows[i].box && rows[i - 1].box) for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(rows[i].box[k] - rows[i - 1].box[k]));
        return m;
      };
      const drag = async (from, dx, dy) => {
        await p.mouse.move(from.x, from.y);
        await p.mouse.down();
        for (let i = 1; i <= 12; i++) {
          await p.mouse.move(from.x + (dx * i) / 12, from.y + (dy * i) / 12);
          await p.waitForTimeout(16);
        }
        await p.mouse.up();
        await h.settle(250);
      };
      const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      const buttonOnTop = (where) =>
        p.evaluate((where) => {
          const b = document.querySelector("[data-feedback-btn]");
          if (!b) return `${where}: no feedback button on the page`;
          const r = b.getBoundingClientRect();
          const cs = getComputedStyle(b);
          if (Math.abs(r.width - 46) > 0.5 || Math.abs(r.height - 46) > 0.5) return `${where}: the button is ${r.width}×${r.height}, not 46×46`;
          if (cs.visibility !== "visible" || Number(cs.opacity) < 0.99 || cs.pointerEvents === "none") return `${where}: the button is hidden (visibility ${cs.visibility}, opacity ${cs.opacity}, pointer-events ${cs.pointerEvents})`;
          if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return `${where}: the button is off screen`;
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!top || !b.contains(top)) return `${where}: the button is covered by <${top?.tagName.toLowerCase()} class="${String(top?.className).slice(0, 60)}">`;
          return null;
        }, where);

      await h.goto("/", { name: "feedback" });
      await p.evaluate(() => ["feedback-box-v2", "feedback-kb-strip", "feedback-drafts"].forEach((k) => localStorage.removeItem(k)));
      await h.goto("/", { name: "feedback" });
      try {
        await btn().waitFor({ state: "visible", timeout: 8000 });
      } catch {
        fail("the feedback button never showed on Today");
        return;
      }

      // 1. Open and close ten times, with and without the keyboard: the box is put in one place and stays there.
      let first = null;
      for (let i = 0; i < 10; i++) {
        const withKb = h.isPhone && i % 2 === 1;
        await traceStart();
        await press(btn());
        await p.waitForTimeout(350);
        if (withKb) await p.evaluate(fakeKeyboard, KB);
        await p.waitForTimeout(650);
        const at = await rectOf("[data-feedback-box]");
        await press(p.locator('[data-feedback-box] button[aria-label="Minimize"]'));
        await p.waitForTimeout(150);
        if (withKb) await p.evaluate(fakeKeyboard, 0);
        await p.waitForTimeout(450);
        const t = await traceStop();
        const shownRows = t.rows.filter((r) => r.box);
        if (!at || shownRows.length < 10) {
          fail(`open ${i + 1}: the box didn't open (${shownRows.length} frames)`);
          break;
        }
        const step = maxStep(t.rows);
        if (step > 0.5) fail(`open ${i + 1}${withKb ? " (keyboard)" : ""}: the box moved or changed size by ${step.toFixed(1)}px between two frames`);
        if (t.anims !== 1) fail(`open ${i + 1}: the box's entrance played ${t.anims} times (once is right)`);
        if (!first) first = at;
        else if (["x", "y", "w", "h"].some((k) => Math.abs(at[k] - first[k]) > 0.5)) fail(`open ${i + 1}: the box opened at ${JSON.stringify(at)}, not where it first did ${JSON.stringify(first)}`);
        const b0 = t.rows.find((r) => r.btn)?.btn;
        if (t.rows.some((r) => !r.btn)) fail(`open ${i + 1}: the feedback button left the page`);
        else if (t.rows.some((r) => r.btn.some((v, k) => Math.abs(v - b0[k]) > 0.5))) fail(`open ${i + 1}: the feedback button moved or changed size`);
        if (await p.locator("[data-feedback-box]").count()) fail(`open ${i + 1}: the box didn't close`);
        if (i === 0 || i === 1 || i === 9) console.log(`    feedback open ${i + 1}${withKb ? " (keyboard)" : ""}: ${shownRows.length} frames with the box, biggest frame-to-frame change ${step.toFixed(2)}px, entrance played ${t.anims}×, at ${JSON.stringify(at)}`);
      }

      // 2. The button is on every screen, the same size, above every popup.
      for (const path of ["/boards", "/calendar", "/settings", "/import", "/insights"]) {
        await h.goto(path, { name: "feedback" });
        const bad = await buttonOnTop(path);
        if (bad) fail(bad);
      }
      await h.goto("/", { name: "feedback" });
      if (await h.tap("text=Pick up medication", "open quest editor", { expectMove: true })) {
        await h.settle(500);
        const bad = await buttonOnTop("quest editor open");
        if (bad) fail(bad);
        await h.check("quest editor with the feedback button");
        // Feedback opens over the editor, and the editor stays as it was.
        await press(btn());
        await h.settle(700);
        if (!(await p.locator("[data-feedback-box]").count())) fail("the feedback box didn't open over the quest editor");
        else if (!(await p.locator("[role=dialog]:not([data-feedback-box])").count())) fail("opening feedback closed the quest editor");
        await h.check("feedback over the quest editor");
        await p.evaluate(() => document.activeElement?.blur());
        await press(p.locator('[data-feedback-box] button[aria-label="Minimize"]')).catch(() => {});
        await h.settle(300);
        await esc(h);
        await h.settle(400);
      }

      // 3. Moved low, then written in: it glides into the strip above the keyboard (one smooth move), and
      //    the keyboard arriving and leaving moves nothing.
      await h.goto("/", { name: "feedback" });
      await press(btn());
      await h.settle(700);
      if (h.isPhone) {
        await p.evaluate(() => document.activeElement?.blur());
        const r0 = await rectOf("[data-feedback-box]");
        await drag({ x: r0.x + 70, y: r0.y + 22 }, 0, 330);
        const low = await rectOf("[data-feedback-box]");
        if (Math.abs(low.y - (r0.y + 330)) > 1.5) fail(`dragging the box down 330px put it at ${low.y}, from ${r0.y}`);
        await traceStart();
        await p.locator("[data-feedback-box] textarea").first().tap();
        await p.waitForTimeout(450);
        const before = await rectOf("[data-feedback-box]");
        await p.evaluate(fakeKeyboard, KB);
        await p.waitForTimeout(700);
        const up = await rectOf("[data-feedback-box]");
        await p.evaluate(() => document.activeElement?.blur());
        await p.evaluate(fakeKeyboard, 0);
        await p.waitForTimeout(700);
        const after = await rectOf("[data-feedback-box]");
        const t = await traceStop();
        const tops = t.rows.filter((r) => r.box).map((r) => r.box[1]);
        const vh = await p.evaluate(() => innerHeight);
        if (up.y + up.h > vh - KB - 7.5) fail(`with the keyboard up the box ends at ${up.y + up.h}, behind the keyboard (which starts at ${vh - KB})`);
        if (tops.some((y, i) => i && y > tops[i - 1] + 0.5)) fail("on its way above the keyboard the box went back down");
        if (new Set(tops.map((y) => Math.round(y))).size < 4) fail("the box jumped above the keyboard in one frame instead of gliding");
        if (maxStep(t.rows) > 130) fail(`the box jumped ${maxStep(t.rows).toFixed(0)}px in one frame on its way above the keyboard`);
        if (Math.abs(before.y - up.y) > 0.5 || Math.abs(before.h - up.h) > 0.5) fail(`the keyboard arriving moved the box (${before.y} → ${up.y})`);
        if (Math.abs(after.y - up.y) > 0.5 || Math.abs(after.h - up.h) > 0.5) fail(`the keyboard leaving moved the box (${up.y} → ${after.y})`);
        console.log(`    feedback glide: from ${low.y} to ${up.y} over ${new Set(tops.map((y) => Math.round(y))).size} distinct tops, biggest step ${maxStep(t.rows).toFixed(1)}px; keyboard up ${before.y}→${up.y}, down ${up.y}→${after.y}; box bottom ${up.y + up.h} vs keyboard top ${vh - KB}`);
      }

      // 4. Resize from the bottom: the top-left corner never moves; down to 220px wide and 150px tall.
      {
        const r0 = await rectOf("[data-feedback-box]");
        const corner = await rectOf('[data-feedback-resize="corner"]');
        await traceStart();
        await drag(centre(corner), -700, -700);
        let t = await traceStop();
        const small = await rectOf("[data-feedback-box]");
        const moved = (rows) => rows.some((r) => r.box && (Math.abs(r.box[0] - r0.x) > 0.5 || Math.abs(r.box[1] - r0.y) > 0.5));
        if (moved(t.rows)) fail("resizing from the corner moved the box's top-left corner");
        if (Math.abs(small.w - 220) > 0.5 || Math.abs(small.h - 150) > 0.5) fail(`the smallest box is ${small.w}×${small.h}, not 220×150`);
        await h.check("feedback box: smallest");
        const edge = await rectOf('[data-feedback-resize="height"]');
        await traceStart();
        await drag(centre(edge), 0, 120);
        t = await traceStop();
        const taller = await rectOf("[data-feedback-box]");
        if (moved(t.rows)) fail("resizing from the bottom edge moved the box's top");
        if (Math.abs(taller.h - 270) > 1.5 || Math.abs(taller.w - small.w) > 0.5) fail(`dragging the bottom edge down 120px made it ${taller.w}×${taller.h}, from ${small.w}×${small.h}`);
        const corner2 = await rectOf('[data-feedback-resize="corner"]');
        await traceStart();
        await drag(centre(corner2), 900, 900);
        t = await traceStop();
        const big = await rectOf("[data-feedback-box]");
        const [vw, vh] = await p.evaluate(() => [innerWidth, innerHeight]);
        if (moved(t.rows)) fail("making the box bigger moved its top-left corner");
        if (big.x + big.w > vw - 7.5 || big.y + big.h > vh - 7.5) fail(`the biggest box runs off the screen (${JSON.stringify(big)})`);
        console.log(`    feedback resize: smallest ${small.w}×${small.h}, bottom edge +120 → ${taller.w}×${taller.h}, biggest ${big.w}×${big.h} at ${big.x},${big.y} on ${vw}×${vh}; top-left stayed ${r0.x},${r0.y}`);
        // Back to the default for the rest of the walk.
        await press(p.locator('[data-feedback-box] button[aria-label="Minimize"]')).catch(() => {});
        await h.settle(300);
        await p.evaluate(() => {
          localStorage.removeItem("feedback-box-v2");
          sessionStorage.removeItem("feedback-open");
        });
      }

      // 5. The usual walk: the box, the keyboard, a screen picture (writing goes on), your recent notes.
      await h.goto("/", { name: "feedback" });
      if (await h.tap((p) => p.getByRole("button", { name: /^feedback \(f\)$/i }).first(), "open feedback", { optional: true, expectMove: true })) {
        await h.settle(600);
        await h.check("feedback box");
        await h.typeIn((p) => p.locator("[data-feedback-root] textarea").first(), "feedback writing");
        await h.tap((p) => p.getByRole("button", { name: /add a picture of this screen/i }).first(), "screen picture", { optional: true });
        await h.page.keyboard.type("Typing right after the picture").catch(() => {});
        await h.settle(1500);
        // The picture must really arrive (owner, Nov 13: "the screenshot tool doesn't work").
        const shotOk = await h.page.locator("[data-feedback-root] img").first().waitFor({ timeout: 12000 }).then(() => true, () => false);
        const shotErr = await h.page.getByText(/couldn't take a picture of this screen/i).count();
        if (!shotOk || shotErr) throw new Error("Screen picture never appeared in the feedback box");
        await h.check("feedback: picture and writing");
        if (await h.tap((p) => p.getByRole("button", { name: /your recent notes/i }).first(), "recent notes", { optional: true, expectMove: true })) {
          await h.settle(800);
          await h.check("feedback: recent notes");
        }
        // Left as it was found: the next flows start without a box over their screens.
        await h.page.evaluate(() => document.activeElement?.blur());
        await h.page.locator('[data-feedback-box] button[aria-label="Minimize"]').click({ timeout: 3000 }).catch(() => {});
        await h.settle(300);
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
      await h.tap((p) => p.getByRole("button", { name: /^add a slot to the utility pocket$/i }).first(), "offline: add slots", { optional: true, expectMove: true });
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
        await h.tap((p) => p.getByRole("button", { name: /custom portrait$|paint it$/i }).first(), "add item: paint it", { optional: true, expectMove: true });
        await h.typeIn((p) => p.getByLabel("Describe the portrait").first(), "add item: describe", "a wooden spoon");
        await h.check("add item sheet: describing");
        await h.tap((p) => p.getByRole("button", { name: /^\+ add a note$/i }).first(), "add item: add a note", { optional: true, expectMove: true });
        await h.check("add item sheet: note");
        await h.tap((p) => p.getByRole("button", { name: /^close$/i }).last(), "add item: close", { optional: true, expectMove: true });
      }
      await h.tap((p) => p.getByRole("button", { name: /^add a slot to the utility pocket$/i }).first(), "add slots", { optional: true, expectMove: true });
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
      // Messages in the Guild Hall (owner, Nov 13): a party member's conversation opens in place.
      await h.goto("/feed");
      if (await h.tap((p) => p.locator("[data-message-friend]").first(), "feed: open a conversation", { optional: true, expectMove: true })) {
        await h.settle(900);
        await h.check("feed: conversation");
      }
      // A board scroll (owner, Nov 12–13): pull its bottom roller down to unroll more quests; the top roller rolls it up;
      // its title opens the board.
      await h.goto("/boards");
      {
        const pull = h.page.locator("main [data-scroll-pull]").first();
        if (await pull.count()) {
          await pull.scrollIntoViewIfNeeded().catch(() => {});
          const box = await pull.boundingBox();
          if (box) {
            await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await h.page.mouse.down();
            await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 4 });
            await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 90, { steps: 4 });
            await h.page.mouse.up();
            await h.settle(500);
            await h.check("boards: pulled the scroll open");
          }
        } else h.record({ kind: "scroll-pull", severity: "warning", target: "board scroll", detail: "No scroll had a roller to pull (no board with more than one quest?)" });
      }
      if (await h.tap((p) => p.locator("main .board-card .scroll-rod-tap.top").first(), "boards: roll up a scroll", { optional: true })) {
        await h.settle(450);
        await h.check("boards: rolled up");
        await h.tap((p) => p.locator("main .board-card .scroll-rod-tap.top").first(), "boards: unroll it", { optional: true });
      }
      // All Quests › List, by due date: each row says its due day, and past-due ones can be hidden (owner, Nov 13).
      await h.goto("/quests");
      if (await h.tap((p) => p.getByRole("radio", { name: /due soonest/i }).first(), "list: due soonest", { optional: true })) {
        await h.settle(400);
        await h.check("list: due soonest, past-due choices");
        await h.tap((p) => p.getByRole("radio", { name: /hide past due/i }).first(), "list: hide past due", { optional: true });
        await h.settle(400);
        await h.check("list: past due hidden");
        await h.tap((p) => p.getByRole("radio", { name: /all past due/i }).first(), "list: all past due", { optional: true });
        await h.tap((p) => p.getByRole("radio", { name: /newest/i }).first(), "list: newest", { optional: true });
      }
      // Find a quest from the boards list.
      await h.goto("/boards");
      await h.page.getByLabel("Find a quest").first().fill("insurance").catch(() => {});
      await h.settle(900);
      await h.check("boards: find a quest");
      // …and a board by name (owner [f6349b0f]): boards first, a sub-board says which board it's in.
      await h.page.getByLabel("Find a quest").first().fill("garden").catch(() => {});
      await h.settle(900);
      await h.check("boards: find a board");
      // A board's sub-board opens in place like a folder (Nov 6), with "See board ›".
      await h.goto("/boards");
      if (await h.tap((p) => p.locator('[data-fb-name="Sub-board: Garden beds"]').first(), "open a sub-board in place", { optional: true, expectMove: true })) {
        await h.settle(900);
        await h.check("boards: sub-board folder");
        await h.tap((p) => p.locator('[data-fb-name="Sub-board: Seeds to order"]').first(), "open a folder inside it", { optional: true, expectMove: true });
        await h.settle(900);
        await h.check("boards: folder in a folder");
        // Hold or right-click a sub-board: "Open the board ›" opens it as the popup, and the page behind doesn't run
        // down to its bottom (owner, Nov 6 and 12).
        const before = await h.page.evaluate(() => window.scrollY);
        await h.page.locator('[data-fb-name="Sub-board: Garden beds"]').first().click({ button: "right" }).catch(() => {});
        await h.settle(400);
        await h.check("boards: sub-board menu");
        if (await h.tap((p) => p.locator("[data-menu=sub-board] a", { hasText: /open the board/i }).first(), "open the board", { optional: true, expectMove: true })) {
          await h.settle(1500);
          const y = await h.page.evaluate(() => window.scrollY);
          if (y - before > 120) h.record({ kind: "page-jumped", severity: "error", target: "board popup", detail: `the page behind the board popup scrolled from ${before}px to ${y}px` });
          await h.check("board popup from a folder");
        }
      }
      // The first board.
      await h.goto("/boards");
      if (await h.tap((p) => p.locator("main a[data-board-title][href^='/boards/'], main a[href^='/boards/']").first(), "open a board", { optional: true, expectMove: true })) {
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
  {
    // Per-quest extras (split plan, S2): the fixtures give two quests a place, a drive time, a card colour and a
    // "12 of 32 pages" count; these shots are the before/after for moving them to columns.
    name: "questextras",
    async run(h) {
      await h.goto("/", { name: "questextras", reset: true });
      await h.settle(1500);
      if (await h.tap("text=Pick up medication", "open the quest", { expectMove: true })) {
        await h.settle(600);
        await h.check("quest editor: place on its pill");
        if (await h.tap((p) => p.getByRole("button", { name: /^location: cvs on main street/i }).first(), "place pill", { optional: true, expectMove: true })) {
          await h.check("quest editor: place panel");
        }
        // Progress counted in pills ("1 of 4 pills") and the card's colour, from the pills under the divider.
        if (await h.tap((p) => p.getByRole("button", { name: /^progress$/i }).first(), "progress pill", { optional: true, expectMove: true })) {
          await h.settle(500);
          await h.check("quest editor: 1 of 4 pills");
        } else h.record({ kind: "step-skipped", severity: "info", target: "questextras", detail: "no Progress pill in the editor" });
        if (await h.tap((p) => p.getByRole("button", { name: /^color$/i }).first(), "color pill", { optional: true, expectMove: true })) {
          await h.settle(500);
          await h.check("quest editor: card colour");
        }
      }
      await h.goto("/calendar?view=day", { name: "questextras-calendar" });
      await h.settle(1500);
      await h.page.locator("[title^='Edit \"Goblin']").first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
      await h.settle(300);
      await h.check("calendar: card colour and place");
    },
  },
];
