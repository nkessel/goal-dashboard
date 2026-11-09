"use client";

import { useSyncExternalStore } from "react";

/**
 * Small visual-effect switches (Settings → Visual Effects), saved on this
 * device like the celebration settings. Changes apply live, in every window.
 */
export type VisualFx = {
  /** Evening Routine button: a wave of light running across the stars. */
  eveningStarShimmer: boolean;
  /** Evening Routine button: light sweeping around the gold border. */
  eveningBorderShimmer: boolean;
  /** Evening Routine button: stars gently fading in and out. */
  eveningStarTwinkle: boolean;
  /** Victories Today is folded closed. */
  victoriesClosed: boolean;
  /** What a closed Victories Today shows in its header. */
  victoriesShowXp: boolean;
  victoriesShowCount: boolean;
  victoriesShowCoins: boolean;
  victoriesShowLatest: boolean;
  /** What shows while the next screen loads: one look, or several that take turns at random. */
  loadingLooks: LoadingLook[];
  /** A wise line (from the welcome screen's rotation) under the loading look. */
  loadingTips: boolean;
  /** Quietly load the screens you visit most while nothing is happening. */
  preload: boolean;
};

export type LoadingLook = "toucan" | "compass" | "quill" | "fireflies" | "pages" | "bar";
export const LOADING_LOOKS: { key: LoadingLook; label: string; hint: string }[] = [
  { key: "toucan", label: "Flying toucan", hint: "the Great Toucan Spirit flies across while it loads" },
  { key: "compass", label: "Compass", hint: "a gilded compass rose turning" },
  { key: "quill", label: "Quill", hint: "a quill writing the next page" },
  { key: "fireflies", label: "Fireflies", hint: "small lights drifting and glowing" },
  { key: "pages", label: "Page turns", hint: "an open book, its pages turning" },
  { key: "bar", label: "Just the gold bar", hint: "a thin line along the top" },
];

export const VISUAL_FX_DEFAULTS: VisualFx = {
  eveningStarShimmer: true,
  eveningBorderShimmer: false,
  eveningStarTwinkle: true,
  victoriesClosed: false,
  victoriesShowXp: true,
  victoriesShowCount: true,
  victoriesShowCoins: false,
  victoriesShowLatest: false,
  loadingLooks: ["toucan"],
  loadingTips: true,
  preload: true,
};

const KEY = "visual-fx";
let cache: VisualFx | null = null;
const listeners = new Set<() => void>();

function read(): VisualFx {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return VISUAL_FX_DEFAULTS;
    const saved = JSON.parse(raw) as Partial<VisualFx> & { loadingLook?: LoadingLook };
    const known = (k: unknown): k is LoadingLook => LOADING_LOOKS.some((l) => l.key === k);
    const listed = Array.isArray(saved.loadingLooks) ? saved.loadingLooks.filter(known) : [];
    const looks = listed.length ? listed : known(saved.loadingLook) ? [saved.loadingLook] : VISUAL_FX_DEFAULTS.loadingLooks;
    return { ...VISUAL_FX_DEFAULTS, ...saved, loadingLooks: looks };
  } catch {
    return VISUAL_FX_DEFAULTS;
  }
}

function get(): VisualFx {
  if (!cache) cache = read();
  return cache;
}

export function setVisualFx(patch: Partial<VisualFx>): boolean {
  cache = { ...get(), ...patch };
  listeners.forEach((l) => l());
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = read();
    l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useVisualFx(): VisualFx {
  return useSyncExternalStore(subscribe, get, () => VISUAL_FX_DEFAULTS);
}
