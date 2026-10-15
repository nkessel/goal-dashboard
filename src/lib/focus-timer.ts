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

// Saved in the browser so a running timer survives a reload and shows in
// every window of the app (`open` stays per-window: it's about what's on screen).
const STORAGE_KEY = "focus-timer";
let loaded = false;

function fromStored(raw: string | null, keepOpen: boolean): FocusTimerState {
  if (!raw) return EMPTY;
  try {
    const saved = JSON.parse(raw) as Partial<FocusTimerState>;
    if (!saved.task) return EMPTY;
    return { ...EMPTY, ...saved, open: keepOpen && state.task?.id === saved.task.id ? state.open : false };
  } catch {
    return EMPTY;
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    state = fromStored(window.localStorage.getItem(STORAGE_KEY), false);
  } catch {
    /* storage unavailable */
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = fromStored(e.newValue, true);
    emit();
  });
}

function persist() {
  try {
    if (!state.task) window.localStorage.removeItem(STORAGE_KEY);
    else {
      const { open: _open, ...rest } = state; // eslint-disable-line @typescript-eslint/no-unused-vars
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    }
  } catch {
    /* storage unavailable */
  }
}

export function getFocusTimer() {
  load();
  return state;
}

export function setFocusTimer(patch: Partial<FocusTimerState>) {
  load();
  const onlyOpen = Object.keys(patch).every((k) => k === "open");
  state = { ...state, ...patch };
  if (!onlyOpen) persist();
  emit();
}

export function resetFocusTimer() {
  state = EMPTY;
  persist();
  emit();
}

/** Make sure the store is following this quest (a fresh timer when it's a different one). */
export function adoptFocusTask(task: NonNullable<FocusTimerState["task"]>, minutes: number) {
  load();
  if (state.task?.id === task.id) {
    if (state.task !== task) state = { ...state, task };
    return;
  }
  state = { ...EMPTY, task, length: minutes };
  persist();
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
      load();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getFocusTimer,
    () => EMPTY
  );
}
