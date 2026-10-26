"use client";

import { useSyncExternalStore } from "react";

/**
 * What the Guild Hall shows about your party, chosen in Settings: the XP
 * each finished quest earned, this week's party board, and everyone's
 * streaks. Saved on this device.
 */
export type PartyView = { xp: boolean; week: boolean; streaks: boolean; quiet: boolean };
export const PARTY_VIEW_DEFAULTS: PartyView = { xp: true, week: true, streaks: true, quiet: false };
export const PARTY_VIEW_OPTIONS: { key: keyof PartyView; label: string; hint: string }[] = [
  { key: "xp", label: "XP on each quest", hint: "“+40 XP” beside every quest a friend finishes" },
  { key: "week", label: "This week's party board", hint: "everyone's XP and quests this week, side by side" },
  { key: "streaks", label: "Streaks", hint: "each friend's quest streak on the board" },
  { key: "quiet", label: "Who's been quiet", hint: "friends with no quests in 3+ days, with a nudge to send support" },
];
const KEY = "party-view";
const listeners = new Set<() => void>();
let cached: PartyView | null = null;

function read(): PartyView {
  if (cached) return cached;
  try {
    cached = { ...PARTY_VIEW_DEFAULTS, ...(JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<PartyView>) };
  } catch {
    cached = PARTY_VIEW_DEFAULTS;
  }
  return cached;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function setPartyView(patch: Partial<PartyView>) {
  cached = { ...read(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}
export function usePartyView(): PartyView {
  return useSyncExternalStore(subscribe, read, () => PARTY_VIEW_DEFAULTS);
}
