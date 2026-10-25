"use client";

import { useSyncExternalStore } from "react";
import { cleanStyle, DEFAULT_STYLE, type ToucanStyle } from "./toucan-style";

/** Your check-in style, kept in the browser too so the toucan can act on it at once (your account has the real copy). */
const KEY = "toucan-style";
let cache: { raw: string | null; style: ToucanStyle } = { raw: null, style: DEFAULT_STYLE };

export function readStyle(): ToucanStyle {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== cache.raw) cache = { raw, style: raw ? cleanStyle(JSON.parse(raw)) : DEFAULT_STYLE };
  } catch {
    /* storage unavailable */
  }
  return cache.style;
}

export function storeStyle(s: ToucanStyle) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("toucan-style"));
}

function subscribe(cb: () => void) {
  window.addEventListener("toucan-style", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("toucan-style", cb);
    window.removeEventListener("storage", cb);
  };
}

export function useToucanStyle(): ToucanStyle {
  return useSyncExternalStore(subscribe, readStyle, () => DEFAULT_STYLE);
}

/** Opens the check-in quiz (wherever the toucan's guide is on screen). */
export function openStyleQuiz() {
  window.dispatchEvent(new Event("toucan-quiz"));
}
