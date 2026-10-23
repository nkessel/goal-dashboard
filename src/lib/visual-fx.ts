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
};

export const VISUAL_FX_DEFAULTS: VisualFx = {
  eveningStarShimmer: true,
  eveningBorderShimmer: false,
  eveningStarTwinkle: true,
  victoriesClosed: false,
  victoriesShowXp: true,
  victoriesShowCount: true,
  victoriesShowCoins: false,
  victoriesShowLatest: false,
};

const KEY = "visual-fx";
let cache: VisualFx | null = null;
const listeners = new Set<() => void>();

function read(): VisualFx {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...VISUAL_FX_DEFAULTS, ...(JSON.parse(raw) as Partial<VisualFx>) } : VISUAL_FX_DEFAULTS;
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
