"use client";

import { useSyncExternalStore } from "react";
import type { Task } from "@/lib/data/types";

/**
 * The focus timer lives outside the focus view, so it can keep running after
 * the view closes (shown as a small floating pill) and pick up again when the
 * quest is reopened.
 */
export type FocusTimerState = {
  task: (Task & { categoryLabel?: string | null }) | null;
  mode: "countdown" | "stopwatch";
  /** Countdown length in minutes. */
  length: number;
  /** Seconds banked before the current run. */
  elapsed: number;
  /** When the current run started (ms), or null while paused. */
  runStart: number | null;
  /** The focus view for this quest is on screen. */
  open: boolean;
};

const EMPTY: FocusTimerState = { task: null, mode: "countdown", length: 25, elapsed: 0, runStart: null, open: false };
let state: FocusTimerState = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getFocusTimer() {
  return state;
}

export function setFocusTimer(patch: Partial<FocusTimerState>) {
  state = { ...state, ...patch };
  emit();
}

export function resetFocusTimer() {
  state = EMPTY;
  emit();
}

/** Make sure the store is following this quest (a fresh timer when it's a different one). */
export function adoptFocusTask(task: NonNullable<FocusTimerState["task"]>, minutes: number) {
  if (state.task?.id === task.id) {
    if (state.task !== task) state = { ...state, task };
    return;
  }
  state = { ...EMPTY, task, length: minutes };
  emit();
}

export function spentSeconds(s: FocusTimerState, now: number) {
  return s.elapsed + (s.runStart !== null ? Math.max(0, now - s.runStart) / 1000 : 0);
}

export function toggleFocusTimer() {
  const now = Date.now();
  if (state.runStart !== null) setFocusTimer({ elapsed: spentSeconds(state, now), runStart: null });
  else setFocusTimer({ runStart: now });
}

export function useFocusTimer(): FocusTimerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => EMPTY
  );
}
