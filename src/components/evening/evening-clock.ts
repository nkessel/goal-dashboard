"use client";

import { useSyncExternalStore } from "react";

const MODE_KEY = "evening-mode";
const MODE_EVENT = "evening-mode-change";

/** The evening runs 2:30pm–5:30am; after midnight still belongs to the evening before. */
const EVENING_START = 14 * 60 + 30;
const EVENING_END = 5 * 60 + 30;

/** The viewer's local calendar day as YYYY-MM-DD. */
export function localDayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The evening's day: before 5:30am it's still the previous day's evening. */
export function eveningDayKey(d = new Date()): string {
  return localDayKey(new Date(d.getTime() - EVENING_END * 60_000));
}

const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
};

/** This evening's day key (null during server render) — rites count toward it. */
export function useLocalDay(): string | null {
  return useSyncExternalStore(subscribeMinute, () => eveningDayKey(), () => null);
}

/** True from 2:30pm until 5:30am local time (false during server render). */
export function useIsAfternoon(): boolean {
  return useSyncExternalStore(
    subscribeMinute,
    () => {
      const d = new Date();
      const m = d.getHours() * 60 + d.getMinutes();
      return m >= EVENING_START || m < EVENING_END;
    },
    () => false
  );
}

function subscribeMode(cb: () => void) {
  window.addEventListener(MODE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(MODE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function readMode(): boolean {
  try {
    return window.localStorage.getItem(MODE_KEY) === eveningDayKey();
  } catch {
    return false;
  }
}

/** Whether the screen is flipped to the evening side (remembered until 5:30am). */
export function useEveningMode(): boolean {
  return useSyncExternalStore(subscribeMode, readMode, () => false);
}

export function setEveningMode(on: boolean) {
  try {
    if (on) window.localStorage.setItem(MODE_KEY, eveningDayKey());
    else window.localStorage.removeItem(MODE_KEY);
  } catch {
    /* storage unavailable — the flip still works for this visit */
  }
  window.dispatchEvent(new Event(MODE_EVENT));
}
