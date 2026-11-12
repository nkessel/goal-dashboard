"use client";

import { useSyncExternalStore } from "react";
import { questCalExtrasAction, setCalCardLookAction, setQuestDriveAction, type CalCardLook } from "@/app/actions";

// Driving time to a quest's place (minutes each way) and its calendar card's look, kept on the account
// (`life_wheel.questDrives`, `life_wheel.calCardLooks`), read once per page load (owner, Nov 12).
let drives: Record<string, number> = {};
let looks: Record<string, CalCardLook> = {};
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function subscribe(cb: () => void) {
  subs.add(cb);
  loading ??= questCalExtrasAction()
    .then((r) => {
      drives = { ...r.drives, ...drives };
      looks = { ...r.looks, ...looks };
      emit();
    })
    .catch(() => {});
  return () => subs.delete(cb);
}

/** Minutes of driving each way to the quest's place, or null. A session (`s:`) shares its quest's. */
export function useQuestDrive(taskId: string | undefined): number | null {
  return useSyncExternalStore(subscribe, () => (taskId ? (drives[taskId] ?? null) : null), () => null);
}
export function useAllQuestDrives(): Record<string, number> {
  return useSyncExternalStore(subscribe, () => drives, () => EMPTY_DRIVES);
}
const EMPTY_DRIVES: Record<string, number> = {};

export function saveQuestDrive(taskId: string, minutes: number | null) {
  const next = { ...drives };
  if (minutes && minutes > 0) next[taskId] = Math.round(minutes);
  else delete next[taskId];
  drives = next;
  emit();
  return setQuestDriveAction(taskId, minutes);
}

export function useCalCardLook(taskId: string | undefined): CalCardLook | null {
  return useSyncExternalStore(subscribe, () => (taskId ? (looks[taskId] ?? null) : null), () => null);
}

export function saveCalCardLook(taskId: string, look: CalCardLook | null) {
  const next = { ...looks };
  if (look && (look.color || look.image)) next[taskId] = look;
  else delete next[taskId];
  looks = next;
  emit();
  return setCalCardLookAction(taskId, look);
}

/** "25 min", "1 hr", "1 hr 15". */
export function driveWords(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r}` : `${h} hr`;
}
