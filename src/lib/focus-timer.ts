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
  /** The app-wide focus view should be shown (see FocusTimerPill). Per window, never saved. */
  showing: boolean;
};

const EMPTY: FocusTimerState = { task: null, mode: "countdown", length: 25, elapsed: 0, runStart: null, open: false, showing: false };
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
    const same = keepOpen && state.task?.id === saved.task.id;
    return { ...EMPTY, ...saved, open: same ? state.open : false, showing: same ? state.showing : false };
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
      const { open: _open, showing: _showing, ...rest } = state; // eslint-disable-line @typescript-eslint/no-unused-vars
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

/**
 * Open focus mode for a quest. One app-wide host shows it, so it never
 * depends on (or closes with) the card or popup it was opened from.
 */
export function openFocusMode(task: NonNullable<FocusTimerState["task"]>) {
  load();
  const minutes = task.estimate_minutes && task.estimate_minutes <= 240 ? task.estimate_minutes : 25;
  if (state.task?.id === task.id) state = { ...state, task, showing: true };
  else if (state.task && state.runStart !== null) state = { ...state, showing: true }; // a timer is running for another quest: show that one
  else state = { ...EMPTY, task, length: minutes, showing: true };
  persist();
  emit();
  window.dispatchEvent(new CustomEvent("focus-mode-open"));
}

export function closeFocusMode() {
  setFocusTimer({ showing: false });
}

export const FOCUS_POP_OUT = "focus-pop-out";
type PipApi = { requestWindow: (o: { width: number; height: number }) => Promise<Window> };
export const focusPipApi = () => (typeof window === "undefined" ? undefined : (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture);
/** The timer can float in its own little always-on-top window (Chrome and Edge on a computer). */
export const canPopOutWindow = () => !!focusPipApi();
/** Float the focus timer in its own window, over every other app (FocusTimerPill opens it). Call it from a click. */
export function popOutFocusTimer() {
  window.dispatchEvent(new Event(FOCUS_POP_OUT));
}
