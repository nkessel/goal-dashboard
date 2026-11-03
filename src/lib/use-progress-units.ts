"use client";

import { useSyncExternalStore } from "react";
import { progressUnitsAction, setProgressUnitAction } from "@/app/actions";
import type { ProgressUnit } from "./progress-units";

// Read once per page load, shared by every quest card and the editor.
let units: Record<string, ProgressUnit> = {};
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function load() {
  loading ??= progressUnitsAction()
    .then((u) => {
      units = { ...u, ...units };
      emit();
    })
    .catch(() => {});
  return loading;
}

function subscribe(cb: () => void) {
  subs.add(cb);
  void load();
  return () => subs.delete(cb);
}

/** This quest's count ("12 of 32 pages"), or null when it's counted in percent. */
export function useProgressUnit(taskId: string | undefined): ProgressUnit | null {
  return useSyncExternalStore(
    subscribe,
    () => (taskId ? (units[taskId] ?? null) : null),
    () => null
  );
}

/** Change it here at once, and on the account. */
export function saveProgressUnit(taskId: string, u: ProgressUnit | null) {
  const next = { ...units };
  if (u) next[taskId] = u;
  else delete next[taskId];
  units = next;
  emit();
  return setProgressUnitAction(taskId, u);
}
