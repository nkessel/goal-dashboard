/**
 * The welcome screen: what's on it, in what order, and the words it uses.
 * It opens on the day's first visit, and again when you come back after a
 * few hours since your last check-in ("welcome back"). All of it is chosen
 * in Settings › Visual effects › The welcome screen.
 */
import type { FxSettings } from "./celebration-fx";

export type WelcomeEl = "toucan" | "checkin" | "focus" | "intention" | "plan" | "streak" | "line" | "bar" | "reward" | "due";

export const WELCOME_ELS: { key: WelcomeEl; label: string; hint: string }[] = [
  { key: "toucan", label: "The toucan's greeting", hint: "The Great Toucan Spirit says hello in the check-in style you chose with him, and asks how you're arriving. Good if you like a warm voice to start with; leave it off for a quieter screen." },
  { key: "checkin", label: "Check-in", hint: "A gilded Check in button that opens energy, mood and anything else you track, right there (plus last night's sleep and wake times on the day's first visit). Your check-ins feed Insights and tell the toucan how you're doing." },
  { key: "focus", label: "Your top priority", hint: "Asks “What's your top priority?” with a box to answer in your own words. The app and the toucan keep it in mind, so his check-ins through the day, the week and the month come back to what really matters to you." },
  { key: "intention", label: "Today is about…", hint: "Today's intention: a line on how you want today to feel or what it's about (e.g. “steady and kind to myself”), kept in your journal. Day's first visit only. Choose it if you like setting a tone as well as a goal." },
  { key: "plan", label: "Plan my day", hint: "One button that opens the toucan to plan the day with you: what's due next first, then what matters most (past due after), fitted around your calendar. Nothing goes on the calendar unless you press." },
  { key: "streak", label: "Your streak", hint: "How many days in a row you've shown up. Day's first visit only. Motivating for some; leave it off if streaks feel like pressure." },
  { key: "line", label: "The day's wise line", hint: "One short encouragement, a different one each day. You can switch off any line you don't like, or add your own." },
  { key: "bar", label: "Your level bar", hint: "Your level, filling with the XP that arriving earned you. Day's first visit only." },
  { key: "reward", label: "XP and coins", hint: "The XP and coins for showing up today, counted up as the screen opens. Day's first visit only." },
  { key: "due", label: "Due soon", hint: "A short list of anything due today or tomorrow, so nothing sneaks up on you. Off by default to keep the screen calm." },
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

export const BACK_GREETINGS = [
  "Welcome back, adventurer",
  "The realm missed you",
  "Back on the path, I see",
  "There you are again!",
  "The hearth kept warm for you",
  "Ah, the wanderer returns",
  "Good to see you, traveller",
  "The quest board awaits your return",
  "Back at the inn, I see",
  "The map lit up when you arrived",
  "Hail, returning hero",
  "The lanterns brighten: you're back",
  "Pull up a chair by the fire",
  "The road brought you home again",
  "Your party is glad you're here",
  "Welcome back to the adventure",
];

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

/** The cheers for arriving, each for its part of the day. */
const CHEERS: Record<"morning" | "day" | "evening", string[]> = {
  morning: ["Huzzah! The day's first step is taken", "Here you are, bright and early!", "The sun rose, and so did you!", "Look who's here at first light!"],
  day: ["Huzzah! Here you are!", "The realm rejoices: you've arrived!", "And there you are, right on time!", "Hail, traveller! You made it!", "Trumpets, please: you're here!"],
  evening: ["Here you are, even now. Huzzah!", "The lanterns are lit for your arrival!", "You came, and the evening is brighter for it!", "Look who walked through the door tonight!"],
};
const PART_OF_DAY = new Map(Object.entries(CHEERS).flatMap(([when, lines]) => lines.map((l) => [l, when] as const)));

/** Your own greetings: those written for welcome back, and any written for the day's first visit before the two lists became one. */
export const ownGreetings = (fx: FxSettings) => [...new Set([...linesOf(fx.welcomeBackText), ...linesOf(fx.welcomeText)])].slice(0, 40);

/** Whether your own greetings and wise lines are in use (yes by default if you wrote some). */
export const backOwnOn = (fx: FxSettings) => fx.welcomeBackOwn ?? (!!ownGreetings(fx).length || fx.welcomeHeading === "custom");
export const ownLinesOn = (fx: FxSettings) => fx.welcomeOwnOn ?? !!linesOf(fx.welcomeOwnLines).length;
/** Your own wise lines, when they're switched on. */
export const ownLines = (fx: FxSettings) => (ownLinesOn(fx) ? linesOf(fx.welcomeOwnLines) : []);

/** Every greeting that can open the welcome screen, in one list: the cheers, the welcome backs, then yours. */
export function greetingPool(fx: FxSettings) {
  return [...new Set([...CHEERS.morning, ...CHEERS.day, ...CHEERS.evening, "A new day dawns, adventurer", ...BACK_GREETINGS, ...(backOwnOn(fx) ? ownGreetings(fx) : [])])];
}

/** The greeting for this visit: one still switched on, picked by `seed` (a morning cheer only in the morning, and so on). */
export function greetingFor(fx: FxSettings, seed: string, hour = new Date().getHours()) {
  const off = new Set(fx.welcomeBackOff ?? []);
  const now = hour < 12 ? "morning" : hour < 17 ? "day" : "evening";
  const on = greetingPool(fx).filter((l) => !off.has(l) && (PART_OF_DAY.get(l) ?? now) === now);
  return pickFor(seed, on.length ? on : BACK_GREETINGS);
}

/** Add a welcome back greeting of your own (it joins the ones that take turns), as a settings patch. */
export function addBackGreeting(fx: FxSettings, line: string): Partial<FxSettings> {
  const l = line.replace(/\s+/g, " ").trim().slice(0, 120);
  const own = ownGreetings(fx);
  if (!l || own.includes(l)) return { welcomeBackOwn: true };
  return { welcomeBackText: [...own, l].join("\n"), welcomeText: "", welcomeBackOwn: true, welcomeBackOff: (fx.welcomeBackOff ?? []).filter((x) => x !== l) };
}
