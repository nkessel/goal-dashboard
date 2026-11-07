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
  tiny?: boolean;
  /** Made offline: kept on this device until it's sent (see lib/offline.ts). */
  queued?: boolean;
};

let items: OptimisticQuest[] = [];
let failure: string | null = null;
const listeners = new Set<() => void>();
const KEPT_KEY = "offline-quests";
let restored = false;
/** Quests made offline survive a reload (the kept screen doesn't have them yet). */
function restore() {
  if (restored || typeof window === "undefined") return;
  restored = true;
  try {
    const kept = JSON.parse(window.localStorage.getItem(KEPT_KEY) ?? "[]") as OptimisticQuest[];
    if (Array.isArray(kept)) items = [...items, ...kept.filter((q) => q && q.tempId && !items.some((i) => i.tempId === q.tempId))];
  } catch {
    /* nothing kept */
  }
}
const emit = () => {
  try {
    const kept = items.filter((q) => q.queued && !q.realId);
    if (kept.length) window.localStorage.setItem(KEPT_KEY, JSON.stringify(kept));
    else window.localStorage.removeItem(KEPT_KEY);
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
};

export function addOptimisticQuest(q: Omit<OptimisticQuest, "tempId" | "realId">): string {
  restore();
  const tempId = `temp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  items = [...items, { ...q, tempId, realId: null }];
  emit();
  return tempId;
}

/** This stand-in waits for a connection (kept across reloads until it's sent). */
export function markOptimisticQueued(tempId: string) {
  restore();
  items = items.map((q) => (q.tempId === tempId ? { ...q, queued: true } : q));
  emit();
}

/** The server made it (`realId`), or it failed (null, with a message). */
export function resolveOptimisticQuest(tempId: string, realId: string | null, error?: string) {
  restore();
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
  restore();
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: OptimisticQuest[] = [];

export function useOptimisticQuests(): OptimisticQuest[] {
  return useSyncExternalStore(subscribe, () => (restore(), items), () => EMPTY);
}
