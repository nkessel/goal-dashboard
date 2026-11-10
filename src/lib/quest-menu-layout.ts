import type { QuestAction } from "@/components/tasks/QuestActionMenu";

/**
 * The quest card's ⋯ menu: the order of its items and which are hidden
 * (kept per browser, chosen in Settings). Edit always stays.
 */
export const MENU_ITEMS: { key: QuestAction; label: string }[] = [
  { key: "edit", label: "Edit quest" },
  { key: "complete", label: "Complete this quest" },
  { key: "focus", label: "Engage Quest" },
  { key: "battle", label: "Add to / remove from Today's Quests" },
  { key: "snooze", label: "Snooze…" },
  { key: "offtoday", label: "Remove from Additional Quests" },
  { key: "calendar", label: "Schedule…" },
  { key: "board", label: "See quest in its board" },
  { key: "sequence", label: "Create a sequence" },
  { key: "nextstep", label: "Make it the board's next step" },
  { key: "earlier", label: "Already completed…" },
  { key: "delete", label: "Delete quest" },
];
/** `labels`: your own words for an item (owner, Nov 10: rename "Focus mode", e.g. "Engage Quest"). */
export type MenuLayout = { order: QuestAction[]; hidden: QuestAction[]; labels?: Partial<Record<QuestAction, string>> };
export const DEFAULT_MENU_LAYOUT: MenuLayout = { order: MENU_ITEMS.map((m) => m.key), hidden: [] };

const KEY = "quest-menu-layout";
const EVENT = "quest-menu-layout";
const known = new Set(MENU_ITEMS.map((m) => m.key));

function clean(raw: unknown): MenuLayout {
  const r = (raw ?? {}) as Partial<MenuLayout>;
  const order = (Array.isArray(r.order) ? r.order : []).filter((k): k is QuestAction => known.has(k as QuestAction));
  for (const [i, k] of DEFAULT_MENU_LAYOUT.order.entries()) if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter((k): k is QuestAction => known.has(k as QuestAction) && k !== "edit");
  const labels: Partial<Record<QuestAction, string>> = {};
  for (const [k, v] of Object.entries(r.labels ?? {})) if (known.has(k as QuestAction) && typeof v === "string" && v.trim()) labels[k as QuestAction] = v.trim().slice(0, 40);
  return { order: [...new Set(order)], hidden: [...new Set(hidden)], labels };
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
