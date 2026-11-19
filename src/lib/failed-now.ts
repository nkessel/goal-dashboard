"use client";

import { useSyncExternalStore } from "react";

/**
 * Quests failed on this page a moment ago: their cards look failed and stop offering "Quest failure"
 * before fresh data arrives (owner, Nov 18: a second tap on a card that still looked open showed an error).
 */
const ids = new Set<string>();
const subs = new Set<() => void>();
let version = 0;

export function markFailedNow(id: string) {
  ids.add(id);
  version++;
  subs.forEach((f) => f());
}

export function useFailedNow(id: string | undefined): boolean {
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => version,
    () => 0
  );
  return !!id && ids.has(id);
}
