"use client";

import { useSyncExternalStore } from "react";

/**
 * Quests failed, or completions undone, on this page a moment ago: their cards show the new state before fresh
 * data arrives (owner, Nov 18: a second tap on a card that still looked open showed an error; Nov 13: "after
 * undoing the quest, it still showed checked for a few seconds").
 */
const failed = new Set<string>();
const reopened = new Set<string>();
const subs = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  subs.forEach((f) => f());
};

export function markFailedNow(id: string) {
  failed.add(id);
  reopened.delete(id);
  emit();
}

export function markReopenedNow(id: string) {
  reopened.add(id);
  failed.delete(id);
  emit();
}

function useVersion() {
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => version,
    () => 0
  );
}

export function useFailedNow(id: string | undefined): boolean {
  useVersion();
  return !!id && failed.has(id);
}

export function useReopenedNow(id: string | undefined): boolean {
  useVersion();
  return !!id && reopened.has(id);
}
