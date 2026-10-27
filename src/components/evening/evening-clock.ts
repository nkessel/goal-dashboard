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

/** When the evening routine invites itself to the top of Today (minutes after midnight), or "off". Chosen in Settings. */
export const PROMPT_AT_KEY = "evening-prompt-at";
const PROMPT_HIDDEN_KEY = "evening-prompt-hidden";
const PROMPT_EVENT = "evening-prompt-change";
export const PROMPT_DEFAULT = 17 * 60;

export function readPromptAt(): number | "off" {
  try {
    const raw = window.localStorage.getItem(PROMPT_AT_KEY);
    if (raw === "off") return "off";
    const n = Number(raw);
    return raw && Number.isFinite(n) ? n : PROMPT_DEFAULT;
  } catch {
    return PROMPT_DEFAULT;
  }
}
export function savePromptAt(v: number | "off") {
  try {
    window.localStorage.setItem(PROMPT_AT_KEY, String(v));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(PROMPT_EVENT));
}
/** Hide the invitation until tomorrow evening. */
export function hideEveningPrompt() {
  try {
    window.localStorage.setItem(PROMPT_HIDDEN_KEY, eveningDayKey());
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(PROMPT_EVENT));
}
const subscribePrompt = (cb: () => void) => {
  const t = setInterval(cb, 30_000);
  window.addEventListener(PROMPT_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    clearInterval(t);
    window.removeEventListener(PROMPT_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
/** True while the evening routine sits at the top of Today: from the chosen time until 5:30am, unless hidden tonight. */
export function useEveningPrompt(): boolean {
  return useSyncExternalStore(
    subscribePrompt,
    () => {
      const at = readPromptAt();
      if (at === "off") return false;
      try {
        if (window.localStorage.getItem(PROMPT_HIDDEN_KEY) === eveningDayKey()) return false;
      } catch {
        /* storage unavailable */
      }
      const d = new Date();
      const m = d.getHours() * 60 + d.getMinutes();
      return m >= at || m < EVENING_END;
    },
    () => false
  );
}
