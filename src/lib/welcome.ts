/**
 * The welcome screen: what's on it, in what order, and the words it uses.
 * It opens on the day's first visit, and again when you come back after a
 * few hours since your last check-in ("welcome back"). All of it is chosen
 * in Settings › Visual effects › The welcome screen.
 */
import type { FxSettings } from "./celebration-fx";

export type WelcomeEl = "toucan" | "checkin" | "focus" | "intention" | "plan" | "streak" | "line" | "bar" | "reward" | "due";

export const WELCOME_ELS: { key: WelcomeEl; label: string; hint: string }[] = [
  { key: "toucan", label: "The toucan's greeting", hint: "A line from the Great Toucan Spirit, in your check-in style" },
  { key: "checkin", label: "Check-in", hint: "Energy, mood and the rest (sleep times on the day's first visit only)" },
  { key: "focus", label: "Today's main quest", hint: "Pick the one that matters most (it goes to the top of Today), or write a new one" },
  { key: "intention", label: "Today's intention", hint: "A line on what you want today to be about, kept in your journal (day's first visit only)" },
  { key: "plan", label: "Plan my day", hint: "A button to plan the day with the toucan around what's due and your calendar" },
  { key: "streak", label: "Your streak", hint: "How many days in a row (day's first visit only)" },
  { key: "line", label: "The day's wise line", hint: "A different encouragement each day" },
  { key: "bar", label: "Your level bar", hint: "Filling with today's XP (day's first visit only)" },
  { key: "reward", label: "XP and coins", hint: "What arriving earned you (day's first visit only)" },
  { key: "due", label: "Due soon", hint: "Anything due today or tomorrow" },
];

const DEFAULT_ORDER: WelcomeEl[] = ["toucan", "checkin", "focus", "intention", "plan", "streak", "line", "bar", "reward", "due"];
const DEFAULT_HIDE: WelcomeEl[] = ["toucan", "due"];
const KEYS = new Set<string>(DEFAULT_ORDER);

/** The parts in your order (any new ones join at the end). */
export function welcomeOrder(fx: FxSettings): WelcomeEl[] {
  const saved = (fx.welcomeOrder ?? []).filter((k): k is WelcomeEl => KEYS.has(k));
  return [...new Set([...saved, ...DEFAULT_ORDER])];
}

/** Whether a part shows (older settings for the line, streak and bar still count). */
export function welcomeShows(fx: FxSettings, el: WelcomeEl): boolean {
  if (el === "line" && fx.welcomeLine === false) return false;
  if (el === "streak" && fx.welcomeStreak === false) return false;
  if (el === "bar" && fx.welcomeBar === false) return false;
  return !(fx.welcomeHide ?? DEFAULT_HIDE).includes(el);
}

/** Show or hide a part, as a settings patch. */
export function toggleEl(fx: FxSettings, el: WelcomeEl): Partial<FxSettings> {
  const on = welcomeShows(fx, el);
  const hide = new Set(fx.welcomeHide ?? DEFAULT_HIDE);
  if (on) hide.add(el);
  else hide.delete(el);
  const patch: Partial<FxSettings> = { welcomeHide: [...hide] };
  // Turning one on clears the older switch for it too.
  if (!on && el === "line") patch.welcomeLine = true;
  if (!on && el === "streak") patch.welcomeStreak = true;
  if (!on && el === "bar") patch.welcomeBar = true;
  return patch;
}

/** Move a part up or down, as a settings patch. */
export function moveEl(fx: FxSettings, el: WelcomeEl, dir: -1 | 1): Partial<FxSettings> {
  const order = welcomeOrder(fx);
  const i = order.indexOf(el);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return {};
  [order[i], order[j]] = [order[j], order[i]];
  return { welcomeOrder: order };
}

/** Hours between check-ins after the day's first one (0 = no more that day). Any whole number from 1 to 12; 5 unless chosen. */
export const backHours = (fx: FxSettings) => {
  const h = fx.welcomeBackHours;
  return typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 12 ? h : 5;
};

export const BACK_GREETINGS = ["Welcome back, adventurer", "The realm missed you", "Back on the path, I see", "There you are again!"];

/** Lines from a box of text, one per line. */
export const linesOf = (text: string | undefined) =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);

/** The same pick all day (or all of this visit), walking through a list. */
export function pickFor(key: string, list: string[]) {
  let n = 0;
  for (const c of key) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return list[n % list.length];
}

/** The "welcome back" greeting: yours if you wrote some, otherwise one of the built-in ones. */
export function backGreeting(fx: FxSettings, key: string) {
  const own = linesOf(fx.welcomeBackText);
  return pickFor(key, own.length ? own : BACK_GREETINGS);
}
