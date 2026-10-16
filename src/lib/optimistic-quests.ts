"use client";

import { useSyncExternalStore } from "react";

/**
 * Quests just created, shown on the Today screen at once while the server
 * catches up. Each has a temporary id; once the real quest arrives in the
 * page data (matched by `realId`) the stand-in disappears.
 */
export type OptimisticQuest = {
  tempId: string;
  realId: string | null;
  title: string;
  description: string | null;
  xp: number;
  estimate: number | null;
  placement: "today" | "additional";
  iconUrl: string | null;
};

let items: OptimisticQuest[] = [];
let failure: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function addOptimisticQuest(q: Omit<OptimisticQuest, "tempId" | "realId">): string {
  const tempId = `temp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  items = [...items, { ...q, tempId, realId: null }];
  emit();
  return tempId;
}

/** The server made it (`realId`), or it failed (null, with a message). */
export function resolveOptimisticQuest(tempId: string, realId: string | null, error?: string) {
  items = realId ? items.map((q) => (q.tempId === tempId ? { ...q, realId } : q)) : items.filter((q) => q.tempId !== tempId);
  if (!realId && error) failure = error;
  emit();
}

/** Drop stand-ins whose real quest has arrived. */
export function settleOptimisticQuests(arrivedIds: Set<string>) {
  const next = items.filter((q) => !q.realId || !arrivedIds.has(q.realId));
  if (next.length !== items.length) {
    items = next;
    emit();
  }
}

export function takeOptimisticFailure(): string | null {
  const f = failure;
  failure = null;
  return f;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: OptimisticQuest[] = [];

export function useOptimisticQuests(): OptimisticQuest[] {
  return useSyncExternalStore(subscribe, () => items, () => EMPTY);
}
