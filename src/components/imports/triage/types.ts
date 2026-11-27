import { createContext } from "react";
import type { ImportCard } from "@/lib/data/import-cards";
import { quickPlanDays } from "@/lib/schedule-horizon";

export type BoardOpt = { id: string; title: string; color: string | null; /** The board it sits inside, if any. */ parent?: string | null };

export type Step = "board" | "plan" | "matters" | "often" | "time" | "review";

export type Kind = ImportCard["kind"];

export const KINDS: { key: Kind; label: string; icon: string }[] = [
  { key: "quest", label: "Quests", icon: "⚔" },
  { key: "habit", label: "Habits", icon: "🌱" },
  { key: "project", label: "Projects", icon: "🗺" },
  { key: "shopping", label: "To buy", icon: "🛒" },
  { key: "ritual", label: "Ritual of connection", icon: "💞" },
  { key: "reward", label: "Rewards", icon: "🎁" },
  { key: "done", label: "Already done", icon: "✓" },
];

export const KIND_ONE: Record<Kind, string> = { quest: "⚔ Quest", schedule: "📅 To schedule", habit: "🌱 Habit", project: "🗺 Project", shopping: "🛒 To buy", ritual: "💞 Ritual of connection", reward: "🎁 Reward", done: "✓ Already done" };

/** What Import makes of each kind. */
export const SERVER_KIND = (k: Kind): "quest" | "habit" | "done" | "project" | "reward" | "ritual" => (k === "habit" || k === "done" || k === "project" || k === "reward" || k === "ritual" ? k : "quest");

export type Draft = {
  kind: Kind;
  title: string;
  description: string;
  steps: string[];
  /** To buy: items to put in the Treasure Chest as rewards instead (taken out of the buy list). */
  rewards?: string[];
  boardId: string | null | undefined;
  due: string | null | undefined;
  /** "Plan it within" this many days (0 = today); null = no need to schedule. */
  planDays: number | null | undefined;
  /** Rated on the card already ("Schedule within…"), so the steps don't ask again. */
  rated?: boolean;
  urgency: number | null | undefined;
  importance: number | null | undefined;
  minutes: number | null | undefined;
  /** Habits: "daily", "weekdays", "days" (pick weekdays) or an interval. */
  often: "daily" | "weekdays" | "days" | "week" | "2week" | "month" | undefined;
  days: number[];
};

export const INK = "var(--t-ink)";

export const SOFT = "var(--t-ink-soft)";

export const GOLD = "#8a6116";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const pad = (n: number) => String(n).padStart(2, "0");

export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The clock, read when a choice is drawn or made.
export const now = () => new Date();

export const inDays = (n: number) => {
  const d = now();
  d.setDate(d.getDate() + n);
  return keyOf(d);
};

export const nextDow = (dow: number) => {
  const d = now();
  d.setDate(d.getDate() + (((dow - d.getDay() + 7) % 7) || 7));
  return keyOf(d);
};

export const dayLabel = (k: string) => {
  if (k === inDays(0)) return "Today";
  if (k === inDays(1)) return "Tomorrow";
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

export const minutesLabel = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} hr` : `${m} min`);

export const findBoard = (boards: BoardOpt[], hint: string | null) => {
  if (!hint) return undefined;
  const h = hint.trim().toLowerCase();
  return boards.find((b) => b.title.trim().toLowerCase() === h) ?? boards.find((b) => b.title.toLowerCase().includes(h) || h.includes(b.title.toLowerCase()));
};

export function draftFor(card: ImportCard): Draft {
  const r = card.repeat;
  let often: Draft["often"];
  let days: number[] = [];
  if (r?.weekdays?.length) {
    often = "days";
    days = r.weekdays.filter((d) => d >= 0 && d <= 6);
  } else if (r?.times && r.times > 1 && (r.unit ?? "week") === "week") often = "days";
  else if (r?.unit === "day") often = "daily";
  else if (r?.unit === "week") often = (r.every ?? 1) >= 2 ? "2week" : "week";
  else if (r?.unit === "month") often = "month";
  return {
    kind: card.kind,
    title: card.title,
    description: card.description ?? "",
    steps: card.steps,
    boardId: undefined,
    due: card.due_on ?? undefined,
    planDays: card.kind === "habit" || card.kind === "reward" || card.kind === "done" ? undefined : (card.plan_within_days ?? undefined),
    rated: card.plan_within_days != null && card.kind !== "habit",
    urgency: undefined,
    importance: undefined,
    minutes: card.minutes ?? undefined,
    often,
    days,
  };
}

export const chip = (on: boolean, big = false): React.CSSProperties => ({
  border: `1.5px solid ${on ? "#8a6116" : "#b39a6a"}`,
  color: "#2a1c10",
  background: on ? "radial-gradient(circle at 35% 25%, #fff0bd, #e2bb5c 70%, #c9a04a)" : "rgba(255,250,238,.7)",
  boxShadow: on ? "0 0 10px rgba(242,210,126,.5)" : undefined,
  minHeight: big ? 44 : 36,
});

/**
 * Where an import lands, in plain words beside its button (owner, Nov 10: "what does import as a quest
 * mean? does it go on the scheduling calendar? somewhere else?").
 */
export const importWhere = (k: Kind, planDays: number | null | undefined) => {
  const sched = planDays != null && k !== "habit" && k !== "reward" && k !== "done";
  switch (k) {
    case "habit":
      return "Joins your Daily Habits on Today.";
    case "reward":
      return "Goes in your Treasure Chest.";
    case "done":
      return "Counted as done: its XP now, nothing left open.";
    case "project":
      return "Becomes a quest board, a quest for each step.";
    case "ritual":
      return sched ? "Joins your rituals in Insights, and a quest goes on the auto-scheduler's list." : "Joins your rituals of connection in Insights.";
    default:
      return sched
        ? "A quest on its board and in Additional Quests, and on the auto-scheduler's list to get a time on your calendar."
        : "A quest on its board and in Additional Quests. Pick “Schedule within” to also give it a time on your calendar.";
  }
};

// What the button does, in its own words (it used to say just "Import").
export const importLabel = (k: Kind) =>
  k === "done" ? "Log as done ✓" : k === "habit" ? "Import as habit ✦" : k === "reward" ? "Import as reward ✦" : k === "project" ? "Import as board ✦" : k === "shopping" ? "Import as buy list ✦" : k === "schedule" ? "Import to schedule ✦" : k === "ritual" ? "Import as ritual ✦" : "Import as quest ✦";

export const OFTEN: { key: Draft["often"]; label: string }[] = [
  { key: "daily", label: "Every day" },
  { key: "weekdays", label: "Weekdays" },
  { key: "days", label: "Certain days…" },
  { key: "week", label: "Once a week" },
  { key: "2week", label: "Every 2 weeks" },
  { key: "month", label: "Once a month" },
];

export function oftenLabel(d: Draft) {
  if (d.often === "days") return d.days.length ? [1, 2, 3, 4, 5, 6, 0].filter((x) => d.days.includes(x)).map((x) => DAY_NAMES[x]).join(", ") : "Certain days";
  return OFTEN.find((o) => o.key === d.often)?.label ?? "Every day";
}

// The same picks as on the card (owner, Nov 6: "this week, within 2 weeks, 1 month, or other").
export const planOptions = (): { label: string; days: number }[] => quickPlanDays(now());

// Short words for a list row, so the picks fit on one line.
export const rateable = (k: Kind) => k !== "habit" && k !== "reward" && k !== "done";

export function planLabel(d: Draft) {
  const parts: string[] = [];
  if (typeof d.planDays === "number") {
    const o = planOptions().find((x) => x.days === d.planDays);
    parts.push(d.planDays === 0 ? "Plan it today" : o ? `Plan within ${o.label.toLowerCase()}` : `Plan within ${d.planDays} days`);
  } else parts.push("Not on the schedule list");
  if (d.due) parts.push(`due ${dayLabel(d.due)}`);
  return parts.join(", ");
}

export const addLabel = (d: Draft) => (d.kind === "habit" ? "Add the habit" : d.kind === "reward" ? "Add to the Treasure Chest" : d.kind === "project" ? "Make it a board" : d.kind === "done" ? "Log as done ✓" : d.kind === "shopping" ? "Add the buy list" : d.kind === "ritual" ? "Add the ritual" : d.kind === "schedule" || typeof d.planDays === "number" ? "Add to my list to schedule" : "Add the quest");

// ---- Quest details on a card (owner, Nov 6: "easy pills for XP, due date, and other quest attributes … the rest under a button") ----
// Built from the quest editor's own parts (owner, Nov 6: "make sure that any designs … fit the current design language"):
// `.qe-fact` pills, `.qe-fact-panel` panels, the editor's XP bar and coin stepper, Due picks, Time picks and IconScale.

/** A quest's details picked on the card, before importing. Kept on this device by card id. */
export type Attrs = { /** XP a sub-quest pays when done, by its name. */ stepXp?: Record<string, number>; /** Coins a sub-quest pays when done, by its name. */ stepCoins?: Record<string, number>; xp?: number; coins?: number; due?: string | null; tiny?: boolean; minutes?: number | null; importance?: number; urgency?: number; energy?: number; effort?: number; /** A board id; null: no board; unset: the note's suggestion. */ board?: string | null; /** A time on the calendar, picked on the card (owner, Nov 15); placed right after import. */ slot?: { start: string; end: string } | null; /** The date is Fixed (has to be done by then) or Flexible (a goal); owner, Nov 18. Unset: a date from the notes reads as Fixed. */ firm?: boolean; /** One day (owner, Nov 25): no timeframe on purpose; imported onto its board, never onto the auto-scheduler's list, and not asked again. */ oneDay?: boolean };

export type AttrKey = "reward" | "time" | "due" | "tiny" | "importance" | "board";

export const ATTRS: { key: AttrKey; label: string }[] = [
  { key: "reward", label: "XP & coins" },
  { key: "time", label: "Time" },
  { key: "due", label: "When" },
  { key: "importance", label: "Urgency & importance" },
  { key: "board", label: "Board" },
];

export const ATTR_SHOWN_DEFAULT: AttrKey[] = ["reward", "time", "due", "importance", "board"];

export const ATTRS_KEY = "import-attrs";

// v2: the pills were regrouped on Nov 6 (XP & coins one pill; importance, difficulty and energy one pill).
export const ATTR_LAYOUT_KEY = "import-attr-shown-v2";

/** Every import starts at 15 XP and a coin (owner, Nov 6). */
export const XP_DEFAULT = 15;

export const COIN_DEFAULT = 1;

/**
 * Tiny on or off, as the quest editor does it: on fills 5 minutes and two energy boosts only where nothing
 * was set; off takes back exactly what it filled (it used to leave its 5 minutes and energy behind).
 */
export function tinyAttrs(a: Attrs, on: boolean): Attrs {
  if (on) return { ...a, tiny: true, minutes: a.minutes ?? TINY.minutes, energy: a.energy || TINY.energy };
  return { ...a, tiny: false, minutes: a.minutes === TINY.minutes ? undefined : a.minutes, energy: a.energy === TINY.energy ? undefined : a.energy };
}

/** A tiny task: two energy boosts, 15 XP, 5 minutes, a coin (owner, Nov 6). */
export const TINY: Attrs = { tiny: true, energy: 2, xp: 15, minutes: 5, coins: 1 };

export const withAttrs = (k: Kind) => k === "quest" || k === "schedule" || k === "shopping" || k === "done";

/** The boards, for the Board pill (and a new board made from it). */
export const BoardsCtx = createContext<{ boards: BoardOpt[]; add: (b: BoardOpt) => void; /** Save a card's edited sub-quests. */ resteps: (id: string, steps: string[]) => void; adventure?: boolean }>({ boards: [], add: () => {}, resteps: () => {} });

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export const pickOn: React.CSSProperties = { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" };

export const pickOff: React.CSSProperties = { border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink)", background: "rgba(255,250,235,.35)" };

export const fieldStyle: React.CSSProperties = { borderColor: "rgba(139,112,64,.45)", background: "rgba(255,250,238,.6)" };

/** What the picked details mean for the new quest (defaults: 15 XP, a coin). */
export function questExtras(a: Attrs): { xp: number; coins: number; isTiny?: boolean; energyGain?: number; effort?: number } {
  return { xp: a.xp ?? XP_DEFAULT, coins: a.coins ?? COIN_DEFAULT, isTiny: a.tiny || undefined, energyGain: a.energy || undefined, effort: a.effort || undefined };
}

export const XP_MAX = 350;
