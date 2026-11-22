import type { Task } from "@/lib/data/types";

export type QuestDraft = {
  title?: string;
  description?: string;
  estimateMinutes?: number | null;
  /** 0–5, e.g. from clicking a spot on the Priority Matrix. */
  importance?: number;
  urgency?: number;
  effort?: number;
};

export type QuestEditorMode =
  | { kind: "edit"; task: Task }
  | {
      kind: "create";
      boardId?: string | null;
      pinToBattle?: boolean;
      /** @deprecated Today's Quests no longer has a limit; kept for callers. */
      todayFull?: boolean;
      /** Start as a quick power-up (prefills a short time). */
      powerUp?: boolean;
      /** "Doing now": log something already under way — created and completed at once. */
      doingNow?: boolean;
      /** A tiny task: 5 minutes and no portrait to start with; half height on Today. */
      tiny?: boolean;
      /** Place the new quest on the calendar (e.g. from a Google event). */
      schedule?: { startISO: string; endISO: string; googleEventId?: string };
      prefill?: QuestDraft;
      /** A follow-up: the new quest waits right after this one. */
      after?: { id: string; title: string };
    };
