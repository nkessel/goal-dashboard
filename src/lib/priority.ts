/**
 * One way of weighing quests, shared by every Priority Lab view. Each factor
 * turns a quest into a number from 0 to 1 ("how strongly this factor pulls
 * it forward"); your weights decide how much each factor counts.
 */

export type FactorKey = "importance" | "urgency" | "due" | "ease" | "quick" | "momentum" | "reward" | "stuck";

/** The fields a quest needs to be weighed (client-safe; mirrors Task). */
export type Weighable = {
  id: string;
  title: string;
  importance: number;
  urgency: number;
  effort?: number | null;
  estimate_minutes: number | null;
  due_at?: string | null;
  is_on_calendar?: boolean;
  scheduled_start?: string | null;
  progress?: number | null;
  xp_value: number;
  reschedule_count: number;
  board_id?: string | null;
  icon_key?: string | null;
  icon_source?: string | null;
};

/**
 * Factor order is fixed (it is also the color order), so a factor keeps its
 * color whatever else is switched on. Colors are the validated categorical
 * slots; on parchment they sit below 3:1, so every view labels factors in text.
 */
export const FACTORS: { key: FactorKey; label: string; short: string; color: string; about: string }[] = [
  { key: "importance", label: "Importance", short: "Important", color: "#2a78d6", about: "How much it matters" },
  { key: "urgency", label: "Urgency", short: "Urgent", color: "#eb6834", about: "How soon it needs you" },
  { key: "due", label: "Due soon", short: "Due soon", color: "#1baf7a", about: "Close to its due date or scheduled time (overdue counts most)" },
  { key: "ease", label: "Low effort", short: "Easy", color: "#eda100", about: "Takes little energy" },
  { key: "quick", label: "Quick", short: "Quick", color: "#e87ba4", about: "Takes little time" },
  { key: "momentum", label: "Momentum", short: "Under way", color: "#008300", about: "Already partly done — finishing feels close" },
  { key: "reward", label: "Reward", short: "Rewarding", color: "#6250d6", about: "Worth a lot of XP" },
  { key: "stuck", label: "Stuck", short: "Stuck", color: "#e34948", about: "Keeps getting rescheduled — give it attention" },
];

export type Weights = Record<FactorKey, number>;
export const MAX_WEIGHT = 5;

export const PRESETS: { key: string; label: string; weights: Weights }[] = [
  { key: "balanced", label: "Balanced", weights: { importance: 4, urgency: 3, due: 3, ease: 1, quick: 1, momentum: 1, reward: 1, stuck: 0 } },
  { key: "deadline", label: "Deadline crunch", weights: { importance: 2, urgency: 5, due: 5, ease: 0, quick: 1, momentum: 1, reward: 0, stuck: 1 } },
  { key: "low", label: "Low energy", weights: { importance: 2, urgency: 1, due: 1, ease: 5, quick: 4, momentum: 2, reward: 0, stuck: 0 } },
  { key: "impact", label: "Big impact", weights: { importance: 5, urgency: 1, due: 1, ease: 0, quick: 0, momentum: 1, reward: 3, stuck: 0 } },
  { key: "finish", label: "Finish things", weights: { importance: 2, urgency: 1, due: 1, ease: 1, quick: 1, momentum: 5, reward: 1, stuck: 0 } },
  { key: "unstick", label: "Unstick", weights: { importance: 2, urgency: 1, due: 1, ease: 2, quick: 1, momentum: 0, reward: 0, stuck: 5 } },
];
export const DEFAULT_WEIGHTS: Weights = PRESETS[0].weights;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Each factor's pull for one quest, 0–1. Unknowns sit in the middle rather than counting against it. */
export function factorValues(t: Weighable, now: number, maxXp: number): Record<FactorKey, number> {
  const when = t.due_at ?? (t.is_on_calendar ? t.scheduled_start : null);
  let due = 0;
  if (when) {
    const days = (new Date(when).getTime() - now) / 86_400_000;
    due = days <= 0 ? 1 : clamp01(Math.exp(-days / 3));
  }
  const minutes = t.estimate_minutes;
  const quick = minutes == null ? 0.5 : clamp01(1 - Math.log(Math.max(minutes, 15) / 15) / Math.log(16));
  const effort = t.effort ?? 0;
  return {
    importance: clamp01((t.importance ?? 0) / 5),
    urgency: clamp01((t.urgency ?? 0) / 5),
    due,
    ease: effort > 0 ? clamp01(1 - (effort - 1) / 4) : 0.5,
    quick,
    momentum: clamp01((t.progress ?? 0) / 100),
    reward: maxXp > 0 ? clamp01((t.xp_value ?? 0) / maxXp) : 0,
    stuck: clamp01((t.reschedule_count ?? 0) / 6),
  };
}

export type Scored<T extends Weighable> = {
  task: T;
  values: Record<FactorKey, number>;
  /** Each factor's share of the score (they add up to `score`). */
  parts: Record<FactorKey, number>;
  /** 0–1: how strongly everything you weigh pulls this quest forward. */
  score: number;
};

export function scoreAll<T extends Weighable>(tasks: T[], weights: Weights, now: number): Scored<T>[] {
  const maxXp = Math.max(1, ...tasks.map((t) => t.xp_value ?? 0));
  const total = FACTORS.reduce((n, f) => n + weights[f.key], 0) || 1;
  return tasks
    .map((task) => {
      const values = factorValues(task, now, maxXp);
      const parts = Object.fromEntries(FACTORS.map((f) => [f.key, (weights[f.key] * values[f.key]) / total])) as Record<FactorKey, number>;
      const score = FACTORS.reduce((n, f) => n + parts[f.key], 0);
      return { task, values, parts, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** The factors doing most of the pulling, for a short "why". */
export function topReasons(parts: Record<FactorKey, number>, n = 2): string[] {
  return FACTORS.filter((f) => parts[f.key] > 0.02)
    .sort((a, b) => parts[b.key] - parts[a.key])
    .slice(0, n)
    .map((f) => f.short.toLowerCase());
}

/** A stable 0–1 number for a string (spreads stars around their board's sector). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}
