"use client";

import { useSyncExternalStore } from "react";
import { questPlacesAction, setQuestPlaceAction } from "@/app/actions";

// Where each quest happens ("Natick library"), read once per page load and shared by the cards and the editor.
// Kept on the account (`life_wheel.questPlaces`, by quest id) until quests have a column for it (owner, Nov 3).
let places: Record<string, string> = {};
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function subscribe(cb: () => void) {
  subs.add(cb);
  loading ??= questPlacesAction()
    .then((p) => {
      places = { ...p, ...places };
      emit();
    })
    .catch(() => {});
  return () => subs.delete(cb);
}

export function useQuestPlace(taskId: string | undefined): string | null {
  return useSyncExternalStore(subscribe, () => (taskId ? (places[taskId] ?? null) : null), () => null);
}

export function saveQuestPlace(taskId: string, place: string | null) {
  const next = { ...places };
  const p = place?.replace(/\s+/g, " ").trim().slice(0, 80) || null;
  if (p) next[taskId] = p;
  else delete next[taskId];
  places = next;
  emit();
  return setQuestPlaceAction(taskId, p);
}
