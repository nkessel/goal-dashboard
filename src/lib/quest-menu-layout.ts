import type { QuestAction } from "@/components/tasks/QuestActionMenu";

/**
 * The quest card's ⋯ menu: the order of its items and which are hidden
 * (kept per browser, chosen in Settings). Edit always stays.
 */
export const MENU_ITEMS: { key: QuestAction; label: string }[] = [
  { key: "edit", label: "Edit quest" },
  { key: "complete", label: "Complete this quest" },
  { key: "focus", label: "Focus mode" },
  { key: "battle", label: "Add to / remove from Today's Quests" },
  { key: "snooze", label: "Snooze until tomorrow" },
  { key: "offtoday", label: "Remove from Additional Quests" },
  { key: "calendar", label: "Schedule on calendar" },
  { key: "board", label: "See quest in its board" },
  { key: "sequence", label: "Create a sequence" },
  { key: "nextstep", label: "Make it the board's next step" },
  { key: "earlier", label: "Already completed…" },
  { key: "delete", label: "Delete quest" },
];
export type MenuLayout = { order: QuestAction[]; hidden: QuestAction[] };
export const DEFAULT_MENU_LAYOUT: MenuLayout = { order: MENU_ITEMS.map((m) => m.key), hidden: [] };

const KEY = "quest-menu-layout";
const EVENT = "quest-menu-layout";
const known = new Set(MENU_ITEMS.map((m) => m.key));

function clean(raw: unknown): MenuLayout {
  const r = (raw ?? {}) as Partial<MenuLayout>;
  const order = (Array.isArray(r.order) ? r.order : []).filter((k): k is QuestAction => known.has(k as QuestAction));
  for (const [i, k] of DEFAULT_MENU_LAYOUT.order.entries()) if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter((k): k is QuestAction => known.has(k as QuestAction) && k !== "edit");
  return { order: [...new Set(order)], hidden: [...new Set(hidden)] };
}

let cache: { raw: string | null; value: MenuLayout } | null = null;
export function readMenuLayout(): MenuLayout {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable */
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULT_MENU_LAYOUT;
  try {
    if (raw) value = clean(JSON.parse(raw));
  } catch {
    /* a broken saved layout falls back to the default */
  }
  cache = { raw, value };
  return value;
}
export const serverMenuLayout = () => DEFAULT_MENU_LAYOUT;
export function saveMenuLayout(l: MenuLayout | null) {
  try {
    if (l) localStorage.setItem(KEY, JSON.stringify(clean(l)));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}
export function subscribeMenuLayout(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The menu's items in the chosen order, without the hidden ones. */
export function arrangeMenu<T extends { key: QuestAction }>(items: T[], layout: MenuLayout): T[] {
  const at = (k: QuestAction) => {
    const i = layout.order.indexOf(k);
    return i < 0 ? 99 : i;
  };
  return items.filter((it) => !layout.hidden.includes(it.key)).sort((a, b) => at(a.key) - at(b.key));
}
