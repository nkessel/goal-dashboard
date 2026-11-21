/**
 * The calendar's quest and event menus (right-click or hold a card): the order of their rows,
 * which are hidden and your own words for them (owner, Nov 16 f562c138, asked again Nov 20).
 * Kept per browser, like the quest card's ⋯ menu (`quest-menu-layout.ts`). "Edit" always stays.
 */
export type CalMenuKind = "task" | "event";
export type CalMenuLayout = { order: string[]; hidden: string[]; labels?: Record<string, string> };

export const CAL_MENU_ITEMS: Record<CalMenuKind, { key: string; label: string }[]> = {
  task: [
    { key: "open", label: "Edit quest" },
    { key: "complete", label: "Complete quest" },
    { key: "unschedule", label: "Remove from calendar" },
    { key: "another", label: "+ Additional time block for this quest" },
    { key: "place", label: "Add location or travel time" },
    { key: "followup", label: "Schedule follow-up quest" },
    { key: "fail", label: "✕ Quest failure" },
  ],
  event: [
    { key: "edit", label: "Edit" },
    { key: "quest", label: "Turn into a quest" },
    { key: "followup", label: "Schedule follow-up quest" },
    { key: "delete", label: "Delete…" },
  ],
};
const ALWAYS = new Set(["open", "edit"]);
const key = (k: CalMenuKind) => `cal-menu-layout-${k}`;
const EVENT = "cal-menu-layout";

function clean(kind: CalMenuKind, raw: unknown): CalMenuLayout {
  const known = CAL_MENU_ITEMS[kind].map((m) => m.key);
  const r = (raw ?? {}) as Partial<CalMenuLayout>;
  const order = (Array.isArray(r.order) ? r.order : []).filter((k): k is string => known.includes(k as string));
  for (const [i, k] of known.entries()) if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter((k): k is string => known.includes(k as string) && !ALWAYS.has(k as string));
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.labels ?? {})) if (known.includes(k) && typeof v === "string" && v.trim()) labels[k] = v.trim().slice(0, 40);
  return { order: [...new Set(order)], hidden: [...new Set(hidden)], labels };
}

const defaults: Record<CalMenuKind, CalMenuLayout> = {
  task: { order: CAL_MENU_ITEMS.task.map((m) => m.key), hidden: [] },
  event: { order: CAL_MENU_ITEMS.event.map((m) => m.key), hidden: [] },
};
const cache: Partial<Record<CalMenuKind, { raw: string | null; value: CalMenuLayout }>> = {};
export function readCalMenuLayout(kind: CalMenuKind): CalMenuLayout {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(kind));
  } catch {
    /* storage unavailable */
  }
  const c = cache[kind];
  if (c && c.raw === raw) return c.value;
  let value = defaults[kind];
  try {
    if (raw) value = clean(kind, JSON.parse(raw));
  } catch {
    /* a broken saved layout falls back to the default */
  }
  cache[kind] = { raw, value };
  return value;
}
export const serverCalMenuLayout = (kind: CalMenuKind) => defaults[kind];
export function saveCalMenuLayout(kind: CalMenuKind, l: CalMenuLayout) {
  try {
    localStorage.setItem(key(kind), JSON.stringify(clean(kind, l)));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}
export function subscribeCalMenuLayout(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
export const calMenuCanHide = (k: string) => !ALWAYS.has(k);
/** Rows in the chosen order (hidden ones dropped unless `withHidden`). */
export function arrangeCalMenu<T extends { key: string }>(rows: T[], layout: CalMenuLayout, withHidden = false): T[] {
  const at = (k: string) => {
    const i = layout.order.indexOf(k);
    return i < 0 ? 99 : i;
  };
  return rows.filter((r) => withHidden || !layout.hidden.includes(r.key)).sort((a, b) => at(a.key) - at(b.key));
}
