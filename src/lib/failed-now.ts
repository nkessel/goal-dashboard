"use client";

import { useSyncExternalStore } from "react";

/**
 * Quests completed, failed, or reopened on this page a moment ago: their cards show the new state at once,
 * before the server answers and fresh data arrives (owner, Nov 19: "completing a calendar quest is super buggy";
 * Nov 18: a second tap on a card that still looked open showed an error; Nov 13: "after undoing the quest, it
 * still showed checked for a few seconds").
 *
 * A mark made with `base` (the quest's state as the page last drew it, `questSig`) gives way as soon as fresh
 * data shows anything else, so a change made elsewhere later (undone on Today, say) is never hidden by it.
 */
export type QuestNow = "done" | "failed" | "open";
type Mark = { now: QuestNow; at: string; base?: string };
const marks = new Map<string, Mark>();
const subs = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  subs.forEach((f) => f());
};

/** A quest's state as drawn: what a mark is checked against. */
export function questSig(t: { status: string; failed_at?: string | null; completed_at?: string | null }) {
  return `${t.status}|${t.failed_at ?? ""}|${t.completed_at ?? ""}`;
}

export function markQuestNow(id: string, now: QuestNow, base?: string) {
  marks.set(id, { now, at: new Date().toISOString(), base });
  emit();
}

/** The server said no: the card goes back to what the data says. */
export function clearQuestNow(id: string) {
  if (marks.delete(id)) emit();
}

export const markDoneNow = (id: string, base?: string) => markQuestNow(id, "done", base);
export const markFailedNow = (id: string, base?: string) => markQuestNow(id, "failed", base);
export const markReopenedNow = (id: string, base?: string) => markQuestNow(id, "open", base);

function useVersion() {
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => version,
    () => 0
  );
}

function markFor(id: string | undefined, sig?: string): Mark | null {
  const m = id ? marks.get(id) : undefined;
  if (!m) return null;
  // Fresh data has moved on from what the mark was made over: the data wins from now on (and the mark is spent, so
  // it can't come back if the quest later returns to the state it was marked over).
  if (m.base !== undefined && sig !== undefined && m.base !== sig) {
    marks.delete(id!);
    return null;
  }
  // A mark made without the quest's state in hand only bridges the wait for fresh data.
  if (m.base === undefined && Date.now() - Date.parse(m.at) > 30_000) return null;
  return m;
}

/** The quest as it should look right now: its data, with a change made on this page a moment ago laid over it. */
type QuestLike = { id: string; status: "open" | "completed"; failed_at?: string | null; completed_at?: string | null };
export function useQuestNow<T extends QuestLike>(task: T): T;
export function useQuestNow<T extends QuestLike>(task: T | undefined): T | undefined;
export function useQuestNow<T extends QuestLike>(task: T | undefined): T | undefined {
  useVersion();
  if (!task) return task;
  const m = markFor(task.id, questSig(task));
  if (!m) return task;
  if (m.now === "open") return { ...task, status: "open", failed_at: null, completed_at: null };
  // Done: it paid its XP (what the server will say once it answers), so the card shows it.
  const paid = m.now === "done" && "xp_value" in task ? { xp_awarded: (task as { xp_value: number }).xp_value } : {};
  return { ...task, ...paid, status: "completed", completed_at: task.status === "completed" && task.completed_at ? task.completed_at : m.at, failed_at: m.now === "failed" ? (task.failed_at ?? m.at) : null };
}

export function useFailedNow(id: string | undefined): boolean {
  useVersion();
  return markFor(id)?.now === "failed";
}

export function useReopenedNow(id: string | undefined): boolean {
  useVersion();
  return markFor(id)?.now === "open";
}
