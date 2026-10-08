"use client";

import { useSyncExternalStore } from "react";

const MODE_KEY = "evening-mode";
const MODE_EVENT = "evening-mode-change";

/** The viewer's local calendar day as YYYY-MM-DD. */
export function localDayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
};

/** Today's local day key (null during server render). */
export function useLocalDay(): string | null {
  return useSyncExternalStore(subscribeMinute, () => localDayKey(), () => null);
}

/** True from 2:30pm local time (false during server render). */
export function useIsAfternoon(): boolean {
  return useSyncExternalStore(
    subscribeMinute,
    () => {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes() >= 14 * 60 + 30;
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
    return window.localStorage.getItem(MODE_KEY) === localDayKey();
  } catch {
    return false;
  }
}

/** Whether today's screen is flipped to the evening side (remembered for the day). */
export function useEveningMode(): boolean {
  return useSyncExternalStore(subscribeMode, readMode, () => false);
}

export function setEveningMode(on: boolean) {
  try {
    if (on) window.localStorage.setItem(MODE_KEY, localDayKey());
    else window.localStorage.removeItem(MODE_KEY);
  } catch {
    /* storage unavailable — the flip still works for this visit */
  }
  window.dispatchEvent(new Event(MODE_EVENT));
}
