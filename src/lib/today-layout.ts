/**
 * The Today screen's parts: their order and which are hidden (kept per
 * browser, arranged in place from Today's gear). Due soon, Today's Quests,
 * Daily Habits and Additional Quests live in one board (cards drag between
 * them), so they stay together, in the order they have among themselves.
 */
export type TodayPart = "stats" | "plan" | "chapter" | "due" | "today" | "habits" | "other" | "evening" | "add" | "victories";

export const TODAY_PARTS: { key: TodayPart; label: string; hint: string }[] = [
  { key: "stats", label: "Your level and XP", hint: "Level, XP, coins and streak" },
  { key: "plan", label: "Planning nudge", hint: "The evening prompt or a nudge to plan" },
  { key: "chapter", label: "This week's chapter", hint: "The week's story, when there is one" },
  { key: "due", label: "Due soon", hint: "Quests due within your reach" },
  { key: "today", label: "Today's Quests", hint: "Your pinned quests for today" },
  { key: "habits", label: "Daily Habits", hint: "Small repeating quests" },
  { key: "other", label: "Additional Quests", hint: "The drawer of everything else for today" },
  { key: "evening", label: "Begin the evening", hint: "The button that turns Today to evening" },
  { key: "add", label: "Add a quest", hint: "The quick add box" },
  { key: "victories", label: "Today's victories", hint: "What you've done today" },
];
export const BOARD_PARTS: TodayPart[] = ["due", "today", "habits", "other"];

export type TodayLayout = { order: TodayPart[]; hidden: TodayPart[] };
export const DEFAULT_TODAY_LAYOUT: TodayLayout = { order: ["stats", "plan", "chapter", "due", "habits", "today", "other", "evening", "add", "victories"], hidden: [] };

const KEY = "today-layout";
const EVENT = "today-layout";
const known = new Set(TODAY_PARTS.map((p) => p.key));

function clean(raw: unknown): TodayLayout {
  const r = (raw ?? {}) as Partial<TodayLayout>;
  const order = (Array.isArray(r.order) ? r.order : []).filter((k): k is TodayPart => known.has(k as TodayPart));
  for (const [i, k] of DEFAULT_TODAY_LAYOUT.order.entries()) if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter((k): k is TodayPart => known.has(k as TodayPart));
  return { order: [...new Set(order)], hidden: [...new Set(hidden)] };
}

/** Before this layout, the board's own sections were ordered on their own: carry that over. */
function migrated(): TodayLayout | null {
  try {
    const old = JSON.parse(window.localStorage.getItem("today-section-order") ?? "null") as unknown;
    if (!Array.isArray(old)) return null;
    const sub = old.filter((x): x is TodayPart => x === "habits" || x === "today" || x === "other");
    const rest = DEFAULT_TODAY_LAYOUT.order.filter((k) => !sub.includes(k));
    const at = rest.indexOf("due") + 1;
    return clean({ order: [...rest.slice(0, at), ...sub, ...rest.slice(at)], hidden: [] });
  } catch {
    return null;
  }
}

let cache: { raw: string | null; value: TodayLayout } | null = null;
export function readTodayLayout(): TodayLayout {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    /* storage unavailable */
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULT_TODAY_LAYOUT;
  try {
    value = raw ? clean(JSON.parse(raw)) : (migrated() ?? DEFAULT_TODAY_LAYOUT);
  } catch {
    /* a broken saved layout falls back to the default */
  }
  cache = { raw, value };
  return value;
}
export const serverTodayLayout = () => DEFAULT_TODAY_LAYOUT;

export function saveTodayLayout(l: TodayLayout | null) {
  try {
    if (l) window.localStorage.setItem(KEY, JSON.stringify(clean(l)));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}
export function subscribeTodayLayout(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
