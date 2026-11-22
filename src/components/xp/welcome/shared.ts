import { type WelcomeEl } from "@/lib/welcome";
import { fogOn, liftFog } from "@/lib/welcome-fog";

const CONFETTI_COLORS = ["#f2c94c", "#e2bf63", "#58a04a", "#c0503a", "#4d7fc0", "#f6e6bb"];

export const PIECES = Array.from({ length: 24 }, (_, i) => {
  const angle = ((i * 360) / 24 + (i % 3) * 9) * (Math.PI / 180);
  const dist = 140 + ((i * 41) % 90);
  return { dx: Math.round(Math.cos(angle) * dist), dy: Math.round(Math.sin(angle) * dist * 0.8 - 30), rot: ((i * 97) % 540) - 270, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], round: i % 4 === 0, delay: (i % 5) * 30 };
});

/** Snooze's first line: soon, or Other… for the rest. */
export const SNOOZE_MAIN: { label: string; ms: number | "tomorrow" }[] = [
  { label: "15 min", ms: 15 * 60_000 },
  { label: "30 min", ms: 30 * 60_000 },
  { label: "1 hr", ms: 3_600_000 },
  // Tomorrow right on the first line (owner, Nov 9).
  { label: "Tomorrow", ms: "tomorrow" },
];

/** Other…: longer, this evening (when it's a while off), tomorrow, or a number of minutes. */
export function snoozeOther() {
  const now = new Date();
  const evening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18).getTime() - now.getTime();
  const out: { label: string; ms: number | "tomorrow" }[] = [
    { label: "2 hrs", ms: 2 * 3_600_000 },
    { label: "3 hrs", ms: 3 * 3_600_000 },
  ];
  if (evening > 3.5 * 3_600_000) out.push({ label: "This evening", ms: evening });
  return out;
}

export const GILT = { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } as const;

export const PILL = { border: "1.5px solid #b39a6a", color: "#3d2f18", background: "rgba(255,250,238,.7)" } as const;

/** The greeting's size: full for a short one, a little smaller as it grows (it may wrap onto a second line). */
export function readJson<T>(k: string, fallback: T): T {
  try {
    const v = JSON.parse(window.localStorage.getItem(k) ?? "null") as T | null;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(k: string, v: unknown) {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export const greetingSize = (t: string) => {
  const n = t.trim().length;
  return n <= 26 ? 25 : n <= 40 ? 23 : n <= 60 ? 21 : 19;
};

/** A small round thumbs up or down for the day's wise line. */
/** The toucan's respond line: 168px wide, one 22px line at rest, up to about four lines. */
export const REPLY_W = 184;

export const REPLY_SCALE = 0.8125;

export const REPLY_LINE = 26;

export const REPLY_MAX = 74;

export const FIELD = { background: "rgba(255,250,238,.92)", border: "1px solid #b39a6a", color: "#2a1c10" };

export type PartKey = "checkin" | "sleep" | "focus";

export type ButtonKey = PartKey | "quests" | "habits" | "dawn";

export const isPartKey = (el: string): el is PartKey => el === "checkin" || el === "sleep" || el === "focus";

export const isButtonKey = (el: string): el is ButtonKey => isPartKey(el) || el === "quests" || el === "habits" || el === "dawn";

export const BUTTON_NAMES: Record<ButtonKey, string> = { checkin: "Emotional check-in", sleep: "Sleep check-in", focus: "Journal", quests: "Choose today's quests", habits: "Habits", dawn: "Morning routine" };

/** What a part shows when there's nothing in it right now (while arranging). */
export const EMPTY: Partial<Record<WelcomeEl, string>> = {
  streak: "Shows on the day's first visit, once you have a streak.",
  bar: "Shows on the day's first visit.",
  reward: "Shows on the day's first visit.",
  line: "A new line each day.",
  reflect: "Add a question with its ✎.",
  habits: "Pick habits with its ✎.",
};

export const SNOOZE_PARTS_KEY = "welcome-snoozed-parts";

export const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Parts snoozed today on this device (a new day brings them back). */
export function readSnoozedParts(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const v = JSON.parse(window.localStorage.getItem(SNOOZE_PARTS_KEY) ?? "null") as { day?: string; parts?: string[] } | null;
    return v?.day === localDay() && Array.isArray(v.parts) ? v.parts : [];
  } catch {
    return [];
  }
}

/** The mist stays over the page for a breath as the welcome screen goes, then lifts, and Today fades up beneath it. */
export function revealThroughMist() {
  const e = document.documentElement;
  fogOn(4000);
  e.setAttribute("data-mist-reveal", "");
  window.setTimeout(liftFog, 180);
  window.setTimeout(() => e.removeAttribute("data-mist-reveal"), 1400);
}
