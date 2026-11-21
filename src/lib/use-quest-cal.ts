"use client";

import { useSyncExternalStore } from "react";
import { questCalExtrasAction, setCalCardLookAction, setQuestDriveAction, setQuestWindowAction, type CalCardLook, type QuestWindow } from "@/app/actions";
import { fromStartup } from "@/lib/startup";

// Driving time to a quest's place (minutes each way) and its calendar card's look, kept on the account
// (`life_wheel.questDrives`, `life_wheel.calCardLooks`), read once per page load (owner, Nov 12).
let drives: Record<string, number> = {};
let looks: Record<string, CalCardLook> = {};
let windows: Record<string, QuestWindow> = {};
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function load() {
  loading ??= fromStartup("questCalExtras", questCalExtrasAction)
    .then((r) => {
      drives = { ...r.drives, ...drives };
      looks = { ...r.looks, ...looks };
      windows = { ...(r.windows ?? {}), ...windows };
      emit();
    })
    .catch(() => {});
  return loading;
}

function subscribe(cb: () => void) {
  subs.add(cb);
  load();
  return () => subs.delete(cb);
}

/** A quest's own time range for the auto-scheduler ("sometime before 2 PM"), kept on the account (`life_wheel.questWindows`). */
export function useQuestWindow(taskId: string | undefined): QuestWindow | null {
  return useSyncExternalStore(subscribe, () => (taskId ? (windows[taskId] ?? null) : null), () => null);
}
export function useAllQuestWindows(): Record<string, QuestWindow> {
  return useSyncExternalStore(subscribe, () => windows, () => EMPTY_WINDOWS);
}
const EMPTY_WINDOWS: Record<string, QuestWindow> = {};
/** Every quest's range, once loaded (for code outside React, like the one-quest placer). */
export async function loadQuestWindows(): Promise<Record<string, QuestWindow>> {
  await load();
  return windows;
}
export function saveQuestWindow(taskId: string, win: QuestWindow | null) {
  const next = { ...windows };
  if (win && (win.from || win.to)) next[taskId] = win;
  else delete next[taskId];
  windows = next;
  emit();
  return setQuestWindowAction(taskId, win);
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
  return setCalCardLookAction(taskId, look).then((r) => {
    // One of a repeating event's quests: ask whether the rest should wear it too (owner, Nov 18).
    window.dispatchEvent(new CustomEvent("series-look-check", { detail: { taskId } }));
    return r;
  });
}

/** "25 min", "1 hr", "1 hr 15". */
export function driveWords(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r}` : `${h} hr`;
}
