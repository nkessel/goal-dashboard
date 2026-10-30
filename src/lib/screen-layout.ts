/**
 * Any screen's parts: their order and which are hidden, kept per browser and
 * arranged in place from the screen's gear (see `ScreenArrange`). Today has
 * its own (`today-layout.ts`) because its quest parts move as a group.
 */
export type ScreenLayout = { order: string[]; hidden: string[] };

const EVENT = "screen-layout";
const keyOf = (screen: string) => `screen-layout:${screen}`;

/** Known parts only, each once, with any new part slotted in where the default has it. */
export function cleanLayout(raw: unknown, defaults: string[]): ScreenLayout {
  const known = new Set(defaults);
  const r = (raw ?? {}) as Partial<ScreenLayout>;
  const order = (Array.isArray(r.order) ? r.order : []).filter((k): k is string => known.has(k as string));
  for (const [i, k] of defaults.entries()) if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter((k): k is string => known.has(k as string));
  return { order: [...new Set(order)], hidden: [...new Set(hidden)] };
}

const cache = new Map<string, { raw: string | null; defaults: string; value: ScreenLayout }>();
export function readLayout(screen: string, defaults: string[]): ScreenLayout {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(keyOf(screen));
  } catch {
    /* storage unavailable */
  }
  const d = defaults.join("|");
  const hit = cache.get(screen);
  if (hit && hit.raw === raw && hit.defaults === d) return hit.value;
  let value: ScreenLayout = { order: defaults, hidden: [] };
  try {
    if (raw) value = cleanLayout(JSON.parse(raw), defaults);
  } catch {
    /* a broken saved layout falls back to the default */
  }
  cache.set(screen, { raw, defaults: d, value });
  return value;
}

export function saveLayout(screen: string, l: ScreenLayout | null) {
  try {
    if (l) window.localStorage.setItem(keyOf(screen), JSON.stringify(l));
    else window.localStorage.removeItem(keyOf(screen));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeLayout(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
