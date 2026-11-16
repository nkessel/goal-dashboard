// The app's most-tapped controls, in the order the tap log (`ui_clicks`) ranks them
// (Nov 16: Today 3,864 taps in three weeks, calendar 1,403, boards 1,026).
// h.tap(name, target, { quiet }): target is a RegExp (button name), a CSS selector,
// or (page) => locator. `quiet` taps set a screen up and aren't recorded.
const btn = (re) => (p) => p.getByRole("button", { name: re }).first();

const feedback = async (h) => {
  await h.tap("open feedback", "button[aria-label='Feedback (F)']");
  await h.tap("type in feedback", null, { key: "h" });
  await h.tap("close feedback", (p) => p.locator("[data-feedback-root]").getByRole("button", { name: "Close", exact: true }).first());
  await h.tap("discard", (p) => p.getByRole("button", { name: /discard|throw|yes/i }).first(), { quiet: true, optional: true });
};

const idle = async (h) => {
  // Nothing touched for two seconds: what the screen costs just by being open.
  await h.tap("idle 2s", null, { key: "Shift", wait: 2000 });
};

export const SCENARIOS = [
  {
    name: "today",
    async run(h) {
      await h.goto("/");
      await idle(h);
      await feedback(h);
      await h.tap("quest ⋯ menu open", "button[aria-label='Quest actions']");
      await h.tap("quest ⋯ menu close", null, { key: "Escape" });
      await h.tap("Due soon open", "button[aria-label='Open Due soon']", { optional: true });
      await h.tap("Due soon close", "button[aria-label='Close Due soon']", { optional: true });
      await h.tap("+ open", btn(/create something new/i));
      await h.tap("+ close", null, { key: "Escape" });
      await h.tap("Daily Habits open", (p) => p.locator("button", { hasText: /^Daily Habits/ }).first(), { optional: true });
      await h.tap("tick a habit", (p) => p.locator(".habit-row button[role='checkbox'], .habit-row [aria-label^='Mark']").first(), { optional: true });
      await h.tap("Daily Habits close", (p) => p.locator("button", { hasText: /^Daily Habits/ }).first(), { optional: true });
      await h.tap("toucan open", btn(/toucan spirit|talk with the toucan/i), { optional: true });
      await h.tap("toucan close", null, { key: "Escape" });
    },
  },
  {
    // The owner's bird is the toucan spirit: he perches on every screen.
    name: "toucan",
    async run(h) {
      await h.goto("/");
      await h.page.evaluate(() => localStorage.setItem("owl-spirit", "1"));
      await h.page.reload({ waitUntil: "load" });
      await h.settle(4000);
      await idle(h);
    },
  },
  {
    name: "editor",
    async run(h) {
      await h.goto("/");
      await h.tap("open a quest", ".quest-card");
      await h.tap("type in the title", (p) => p.getByLabel("Title").first(), { quiet: true });
      await h.tap("type in the title", null, { key: "x" });
      await h.tap("XP pill open", (p) => p.locator("[data-tour='fact-xp'], .qe-fact:has-text('XP')").first());
      await h.tap("5 XP more", btn(/5 xp more/i));
      await h.tap("Time pill open", (p) => p.locator("[data-tour='fact-time']").first(), { optional: true });
      await h.tap("Due pill open", (p) => p.locator(".qe-fact", { hasText: /due|plan/i }).first(), { optional: true });
      await h.tap("close the editor", (p) => p.locator("[role='dialog']").getByRole("button", { name: /^close/i }).first());
    },
  },
  {
    name: "calendar",
    async run(h) {
      await h.goto("/calendar?view=week");
      await idle(h);
      await feedback(h);
      await h.tap("calendars list open", btn(/choose which calendars show/i), { optional: true });
      await h.tap("calendars list close", btn(/choose which calendars show/i), { optional: true });
      await h.tap("display settings open", btn(/display settings/i), { optional: true });
      await h.tap("display settings close", btn(/display settings/i), { optional: true });
      await h.tap("open a quest card", ".cal-chip", { optional: true });
      await h.tap("close it", null, { key: "Escape" });
    },
  },
  {
    name: "boards",
    async run(h) {
      await h.goto("/boards");
      await idle(h);
      await feedback(h);
      await h.tap("fold a board scroll", (p) => p.locator("[data-board-card] h3, [data-board-card] button").first(), { optional: true });
      await h.tap("unfold it", (p) => p.locator("[data-board-card] h3, [data-board-card] button").first(), { optional: true });
    },
  },
  {
    name: "welcome",
    async run(h) {
      await h.goto("/", { welcome: true });
      await idle(h);
      await h.tap("Journal open", (p) => p.locator("button[aria-expanded]", { hasText: /journal/i }).first());
      await h.tap("Journal close", (p) => p.locator("button[aria-expanded]", { hasText: /journal/i }).first());
      await h.tap("Emotional check-in open", btn(/emotional check-in/i));
      await h.tap("Emotional check-in close", btn(/emotional check-in/i));
      await h.tap("Habits open", btn(/^habits/i));
      await h.tap("Habits close", btn(/^habits/i));
    },
  },
];
