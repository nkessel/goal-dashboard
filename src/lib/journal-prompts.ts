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
];

export function journalPrompts(fx: FxSettings): JournalPrompt[] {
  const list = Array.isArray(fx.journalPrompts) ? fx.journalPrompts.filter((p) => p && p.id && p.label) : [];
  const out = list.length ? list : DEFAULT_PROMPTS;
  // The top priorities pill always stays (it's the app's and the toucan's memory of what matters).
  return out.some((p) => p.id === "priorities") ? out : [DEFAULT_PROMPTS[0], ...out];
}

export const cleanXp = (n: unknown) => Math.max(0, Math.min(50, Math.round(Number(n) || 0)));
