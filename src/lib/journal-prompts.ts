import type { FxSettings } from "@/lib/celebration-fx";

/** One prompt in the welcome screen's Journal: a pill, its question, and the XP it pays once a day. */
export type JournalPrompt = { id: string; label: string; prompt: string; xp: number };

/** "priorities" is the top priorities box (its own UI); the rest are plain writing prompts. */
export const DEFAULT_PROMPTS: JournalPrompt[] = [
  { id: "priorities", label: "Top priorities", prompt: "What are your top priorities today?", xp: 5 },
  { id: "pages", label: "Morning pages", prompt: "Write whatever comes, without stopping or judging it. Stream of consciousness: nothing has to make sense.", xp: 10 },
  { id: "grateful", label: "Gratitude", prompt: "Three things I'm grateful for this morning…", xp: 5 },
  { id: "great", label: "A great day", prompt: "What would make today great?", xp: 5 },
  { id: "showup", label: "Intention", prompt: "How do I want to show up today?", xp: 5 },
  // From the owner's own paper planners (Nov 9).
  { id: "willbe", label: "Today I will be", prompt: "Today I will be…", xp: 5 },
  { id: "universe", label: "Help from the Universe", prompt: "I would like help from the Universe with…", xp: 5 },
];
/** Prompts added after a list was first saved: they join a saved list once (until it's saved again). */
const ADDED_V2 = ["willbe", "dreamt", "universe"];

export function journalPrompts(fx: FxSettings): JournalPrompt[] {
  const list = Array.isArray(fx.journalPrompts) ? fx.journalPrompts.filter((p) => p && p.id && p.label) : [];
  let out = list.length ? list : DEFAULT_PROMPTS;
  if (list.length && fx.journalPromptsV !== 2) out = [...out, ...DEFAULT_PROMPTS.filter((p) => ADDED_V2.includes(p.id) && !out.some((o) => o.id === p.id))];
  // The top priorities pill always stays (it's the app's and the toucan's memory of what matters).
  return out.some((p) => p.id === "priorities") ? out : [DEFAULT_PROMPTS[0], ...out];
}

export const cleanXp = (n: unknown) => Math.max(0, Math.min(50, Math.round(Number(n) || 0)));
