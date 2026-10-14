"use client";

import { useSyncExternalStore } from "react";
import type { CreateKind } from "@/components/create/CreateSheet";

/**
 * While a board peek is open, the one + button on screen adds to that board
 * (instead of a second + appearing inside the popup — so nothing flashes when
 * the popup closes).
 */
export type FabTarget = { kinds: CreateKind[]; boardId?: string; label: string };

let current: FabTarget | null = null;
const listeners = new Set<() => void>();

export function setFabTarget(t: FabTarget | null) {
  current = t;
  listeners.forEach((l) => l());
}

export function useFabTarget(): FabTarget | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null
  );
}
