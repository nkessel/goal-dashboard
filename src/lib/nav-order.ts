/**
 * The bottom bar's tab order, chosen by holding and dragging a tab (owner, Nov 14).
 * Kept on the account in `life_wheel.navOrder` as the tabs' hrefs, so screen
 * slides (left or right) follow the order the owner sees.
 */
export const NAV_HREFS = ["/calendar", "/boards", "/", "/insights", "/feed"] as const;
export type NavHref = (typeof NAV_HREFS)[number];

/** A full, valid order: unknown entries dropped, missing tabs added in their default place. */
export function normalizeNavOrder(raw: unknown): NavHref[] {
  const known = new Set<string>(NAV_HREFS);
  const seen = new Set<string>();
  const out: NavHref[] = [];
  if (Array.isArray(raw)) for (const h of raw) if (typeof h === "string" && known.has(h) && !seen.has(h)) {
      seen.add(h);
      out.push(h as NavHref);
    }
  NAV_HREFS.forEach((h, i) => {
    if (seen.has(h)) return;
    out.splice(Math.min(i, out.length), 0, h);
  });
  return out;
}

export function isDefaultNavOrder(order: readonly string[]) {
  return order.every((h, i) => h === NAV_HREFS[i]);
}
