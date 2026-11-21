"use client";

import { useSyncExternalStore } from "react";

/** The toucan's small exports: what other screens need to talk to him, without loading his whole guide. */

export type PlanTarget = { id: string; title: string; estimate: number | null; dueAt: string | null };
export type Mode = "talk" | "catchup";

export type GuideMode = "simple" | "lite" | "full";
export const readMode = (): GuideMode => {
  try {
    const v = window.localStorage.getItem("toucan-mode");
    return v === "simple" || v === "lite" ? v : "full";
  } catch {
    return "full";
  }
};
export const subscribeMode = (cb: () => void) => {
  window.addEventListener("toucan-mode", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("toucan-mode", cb);
    window.removeEventListener("storage", cb);
  };
};
/** How much the toucan does: simple, a light guide, or the full guide (Settings › Toucan Spirit). */
export function useToucanMode(): GuideMode {
  return useSyncExternalStore(subscribeMode, readMode, () => "full" as const);
}

export function talkToToucan(plan?: PlanTarget, mode: Mode = "talk", say?: string) {
  window.dispatchEvent(new CustomEvent("toucan-talk", { detail: { plan, mode, say } }));
}

export const PLAN_DAY = "Help me plan my day so nothing slips: what's due next first, then what matters most, and anything past due after that. Suggest an order and times that fit around my calendar.";
