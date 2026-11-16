/**
 * Every context menu's item order and hidden items (besides the quest card's,
 * which keeps its own store in quest-menu-layout). Kept per browser and chosen
 * in Settings › Layout. Menus mark themselves with data-menu="<id>" and each item
 * with data-mi="<key>"; <MenuLayoutStyles /> arranges them with CSS, so the
 * menus' own code doesn't change.
 */
export type MenuDef = { id: string; title: string; hint: string; items: { key: string; label: string; keep?: boolean; /** Its words change with its state (renamed where it shows, not in Settings). */ varies?: boolean }[] };

export const MENUS: MenuDef[] = [
  {
    id: "habit-editor",
    title: "Habit editor",
    hint: "What shows when you make or edit a habit, and the order.",
    items: [
      { key: "repeats", label: "Repeats" },
      { key: "takes", label: "Takes (minutes)" },
      { key: "coins", label: "Coins" },
      { key: "xp", label: "XP" },
      { key: "due", label: "Due by" },
      { key: "subs", label: "Sub-habits" },
    ],
  },
  {
    id: "calendar-item",
    title: "Calendar items",
    hint: "Right-click or ⋯ on a quest or event in the calendar.",
    items: [
      { key: "open", label: "Edit quest" },
      { key: "unschedule", label: "Remove from calendar / Remove this session", varies: true },
      { key: "edit", label: "Edit (events)" },
      { key: "quest", label: "Turn into a quest (events)", varies: true },
      { key: "followup", label: "Schedule follow-up quest" },
    ],
  },
  {
    id: "habit",
    title: "Daily Habits",
    hint: "The ⋯ on a habit.",
    items: [
      { key: "edit", label: "Edit habit", keep: true },
      { key: "sub", label: "Add a sub-habit" },
      { key: "focus", label: "Focus mode" },
      { key: "core", label: "Make it a core habit / Not a core habit", varies: true },
      { key: "undo-tick", label: "Undo the last one" },
      { key: "snooze", label: "Snooze" },
    ],
  },
  {
    id: "rite",
    title: "Evening rites",
    hint: "The ⋯ on an evening rite.",
    items: [
      { key: "edit", label: "Edit", keep: true },
      { key: "part", label: "Done in part…" },
      { key: "skip", label: "Skip tonight" },
      { key: "delete", label: "Delete" },
    ],
  },
  {
    id: "board",
    title: "Quest boards",
    hint: "Right-click or ⋯ on a board.",
    items: [
      { key: "open", label: "Open board", keep: true },
      { key: "add", label: "Add a quest or sub-board" },
      { key: "edit", label: "Edit board" },
      { key: "nest", label: "Nest into another board…" },
      { key: "unnest", label: "Move to the top level" },
    ],
  },
  {
    id: "matrix",
    title: "Priority Matrix",
    hint: "Tapping a quest or board on the matrix.",
    items: [
      { key: "open", label: "Open quest / Edit board", keep: true, varies: true },
      { key: "collapse", label: "Collapse a board's quests", varies: true },
      { key: "expand-ask", label: "Show a board's quests", varies: true },
      { key: "expand-here", label: "Plot them all where the board is" },
      { key: "expand-unplotted", label: "Put them all in Not yet plotted" },
      { key: "later", label: "Save for later" },
      { key: "unplotted", label: "Move to Not yet plotted" },
      { key: "trash", label: "Remove from priority matrix" },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    hint: "Tapping an item in your backpack.",
    items: [
      { key: "refill", label: "Needs a refill / Refilled", varies: true },
      { key: "quest", label: "Make it a quest" },
      { key: "edit", label: "Edit", keep: true },
      { key: "gone", label: "Gone (take it out)" },
    ],
  },
  {
    id: "notification",
    title: "Notifications",
    hint: "The ⋯ on a notification.",
    items: [
      { key: "read", label: "Mark as read / unread", varies: true },
      { key: "snooze", label: "Snooze…" },
      { key: "delete", label: "Delete" },
    ],
  },
  {
    id: "folder",
    title: "To schedule folders",
    hint: "The ⋯ on a folder in To schedule.",
    items: [
      { key: "rename", label: "Rename", keep: true },
      { key: "remove", label: "Remove folder (keeps its quests)" },
    ],
  },
  {
    id: "streak",
    title: "Streaks",
    hint: "The ⋯ on a streak in Insights.",
    items: [
      { key: "edit", label: "Edit", keep: true },
      { key: "remove", label: "Remove streak" },
    ],
  },
];

/** The planning walks' steps, ordered and hidden the same way (Settings › Planning & evening). */
export const PLANS: MenuDef[] = [
  {
    id: "plan-week",
    title: "Weekly planning",
    hint: "The steps of Plan the week ahead.",
    items: [
      { key: "look", label: "Look back" },
      { key: "wheel", label: "Wheel of life" },
      { key: "sweep", label: "Empty your head" },
      { key: "sort", label: "Sort the haul" },
      { key: "review", label: "Get current" },
      { key: "focus", label: "Lift one area" },
      { key: "rocks", label: "Big rocks" },
      { key: "place", label: "Place it on the calendar" },
      { key: "seal", label: "Seal the week (always last)", keep: true },
    ],
  },
  {
    id: "plan-month",
    title: "Monthly planning",
    hint: "The steps of the new month's plan.",
    items: [
      { key: "look", label: "Look back" },
      { key: "wheel", label: "Life wheel" },
      { key: "focus", label: "This month's focus" },
      { key: "sweep", label: "Empty your head" },
      { key: "sort", label: "Sort the haul" },
      { key: "someday", label: "Someday / Maybe" },
      { key: "place", label: "Key dates" },
      { key: "seal", label: "Seal the month (always last)", keep: true },
    ],
  },
  {
    id: "plan-pair",
    title: "Weekly check-in with Mom",
    hint: "The steps of the check-in together.",
    items: [
      { key: "begin", label: "Before we start", keep: true },
      { key: "good", label: "New and good" },
      { key: "look", label: "Look back" },
      { key: "sweep", label: "Mind sweep" },
      { key: "subtract", label: "Subtract" },
      { key: "rocks", label: "Big rocks" },
      { key: "calendar", label: "Calendar" },
      { key: "swap", label: "Every other week" },
      { key: "light", label: "Attention out" },
    ],
  },
];

/** A planning walk's steps in your order, without the hidden ones ("seal" always last). */
export function arrangeSteps<T extends { key: string }>(id: string, steps: readonly T[], all: MenuLayouts): T[] {
  const def = PLANS.find((p) => p.id === id);
  if (!def || !all[id]) return [...steps];
  const l = layoutFor(def, all[id]);
  const rank = new Map(l.order.map((k, i) => [k, i]));
  const kept = steps.filter((s) => !l.hidden.includes(s.key));
  return kept.sort((a, b) => (a.key === "seal" ? 1 : b.key === "seal" ? -1 : (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99)));
}

export type MenuLayout = { order: string[]; hidden: string[]; /** Your own words for items, by key (or "key:state"). */ labels?: Record<string, string> };
export type MenuLayouts = Record<string, MenuLayout>;

const KEY = "menu-layouts";
const EVENT = "menu-layouts";
const EMPTY: MenuLayouts = {};

export const defaultLayout = (m: MenuDef): MenuLayout => ({ order: m.items.map((i) => i.key), hidden: [] });

/** A saved layout made whole: unknown items dropped, new ones added in their default place. */
export function layoutFor(m: MenuDef, saved: MenuLayout | undefined): MenuLayout {
  const known = new Set(m.items.map((i) => i.key));
  const order = (Array.isArray(saved?.order) ? saved.order : []).filter((k) => known.has(k));
  for (const [i, it] of m.items.entries()) if (!order.includes(it.key)) order.splice(Math.min(i, order.length), 0, it.key);
  const keep = new Set(m.items.filter((i) => i.keep).map((i) => i.key));
  const hidden = (Array.isArray(saved?.hidden) ? saved.hidden : []).filter((k) => known.has(k) && !keep.has(k));
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(saved?.labels ?? {})) if (known.has(k.split(":")[0]) && typeof v === "string" && v.trim()) labels[k] = v.trim().slice(0, 40);
  return { order: [...new Set(order)], hidden: [...new Set(hidden)], ...(Object.keys(labels).length ? { labels } : {}) };
}

/** An item's words: yours if you renamed it, else the usual ones. */
export function menuLabel(all: MenuLayouts, menu: string, key: string, usual: string): string {
  return all[menu]?.labels?.[key]?.trim() || usual;
}

let cache: { raw: string | null; value: MenuLayouts } | null = null;
export function readMenuLayouts(): MenuLayouts {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable */
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") value = parsed as MenuLayouts;
  } catch {
    /* a broken saved layout falls back to the default */
  }
  cache = { raw, value };
  return value;
}
export const serverMenuLayouts = () => EMPTY;

export function saveMenuLayoutFor(id: string, layout: MenuLayout | null) {
  const all = { ...readMenuLayouts() };
  if (layout) all[id] = layout;
  else delete all[id];
  try {
    if (Object.keys(all).length) localStorage.setItem(KEY, JSON.stringify(all));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeMenuLayouts(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The CSS that puts each menu's items in the chosen order and hides the hidden ones. */
export function menuLayoutCss(all: MenuLayouts): string {
  const rules: string[] = [];
  for (const m of MENUS) {
    if (!all[m.id]) continue;
    const l = layoutFor(m, all[m.id]);
    l.order.forEach((k, i) => rules.push(`[data-menu="${m.id}"]>[data-mi="${k}"]{order:${i + 1}}`));
    for (const k of l.hidden) rules.push(`[data-menu="${m.id}"]>[data-mi="${k}"]{display:none!important}`);
  }
  return rules.join("\n");
}
