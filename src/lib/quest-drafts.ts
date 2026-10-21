/**
 * Unfinished new quests, kept on this device: whenever the quest creator
 * closes before a quest is made (on purpose, or because something went
 * wrong), what was written waits here to be picked up again.
 */
export type QuestDraftSave = {
  id: string;
  at: number;
  title: string;
  description: string;
  estimate: string;
  xp: number;
  importance: number;
  urgency: number;
  effort: number;
  energyGain: number;
  boardId: string | null;
  dueDate: string;
  dueTime: string;
  placement: "today" | "additional" | "none";
  steps: { key: string; title: string; parentKey?: string | null }[];
  tags: string[];
};

const KEY = "quest-drafts";

export function loadDrafts(): QuestDraftSave[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as QuestDraftSave[];
    return Array.isArray(list) ? list.filter((d) => d && typeof d.id === "string").sort((a, b) => b.at - a.at) : [];
  } catch {
    return [];
  }
}
function store(list: QuestDraftSave[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("quest-drafts"));
}
export function saveDraft(d: QuestDraftSave) {
  store([{ ...d, at: Date.now() }, ...loadDrafts().filter((x) => x.id !== d.id)]);
}
export function removeDraft(id: string) {
  store(loadDrafts().filter((x) => x.id !== id));
}

/** A fresh name for a draft or a not-yet-saved step. */
export function freshKey(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
