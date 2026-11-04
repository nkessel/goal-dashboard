/**
 * Calendars of interest (owner, Nov 4): for weekly and monthly planning. Two kinds:
 *  - feed: a calendar link the app can read (.ics / webcal / iCal); its events show in week and month views.
 *  - link: a website or page with a calendar the app can't read; kept here to open in a tap.
 * Kept in profiles.life_wheel.interestCalendars.
 */
export type InterestCalendar = { id: string; name: string; url: string; kind: "feed" | "link"; on?: boolean; color?: string | null };

export const INTEREST_SEED: InterestCalendar[] = [
  { id: "tbe", name: "Temple Beth Elohim", url: "https://tbewellesley.org/events", kind: "link" },
  { id: "tbz", name: "TBZ", url: "https://www.tbzbrookline.org/calendar/", kind: "link" },
];

export const INTEREST_COLORS = ["#7a5fb0", "#2f7f8a", "#b0623a", "#5b8a3a", "#a8475e", "#3f62a8"];

/** A link that looks like a calendar feed the app can read. */
export function looksLikeFeed(url: string): boolean {
  return /^webcal:/i.test(url) || /\.ics(\?|$)/i.test(url) || /[?&](ical|outlook-ical|ics)=/i.test(url) || /\/ical\//i.test(url) || /calendar\.google\.com\/calendar\/ical/i.test(url);
}

export function cleanUrl(raw: string): string | null {
  let u = raw.trim();
  if (!u) return null;
  if (/^webcal:\/\//i.test(u)) u = u.replace(/^webcal:/i, "https:");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeInterest(raw: unknown): InterestCalendar[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((x): x is InterestCalendar => !!x && typeof x === "object" && typeof (x as InterestCalendar).url === "string" && typeof (x as InterestCalendar).name === "string")
    .slice(0, 40)
    .map((x) => ({ id: String(x.id || x.url).slice(0, 60), name: x.name.slice(0, 80), url: x.url.slice(0, 600), kind: x.kind === "feed" ? "feed" : "link", on: x.on !== false, color: typeof x.color === "string" ? x.color : null }));
}
