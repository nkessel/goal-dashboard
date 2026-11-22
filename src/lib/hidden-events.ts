"use client";

import { useSyncExternalStore } from "react";

/**
 * Google events hidden from the calendar in this browser (the event chip's "Hide from calendar", or an event made
 * into a quest). One store, so the calendar drops the event's whole slot: no phantom border or shadow left behind,
 * and the events beside it get the room back (owner, Nov 19 682be93f, Nov 20 e16f1f7a).
 */
const KEY = "hidden-gcal-events-v1";
const subs = new Set<() => void>();
let cache: { raw: string | null; ids: ReadonlySet<string> } | null = null;
const EMPTY: ReadonlySet<string> = new Set();

function read(): ReadonlySet<string> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache?.ids ?? EMPTY;
  }
  if (cache && cache.raw === raw) return cache.ids;
  let ids: ReadonlySet<string> = EMPTY;
  try {
    ids = raw ? new Set(JSON.parse(raw) as string[]) : EMPTY;
  } catch {}
  cache = { raw, ids };
  return ids;
}

export function hiddenEventIds(): ReadonlySet<string> {
  return typeof window === "undefined" ? EMPTY : read();
}

export function hideEventId(id: string) {
  const next = [...hiddenEventIds(), id].slice(-500);
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...new Set(next)]));
  } catch {
    // best-effort (private browsing, quota)
  }
  subs.forEach((f) => f());
}

export function useHiddenEvents(): ReadonlySet<string> {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      const onStorage = (e: StorageEvent) => e.key === KEY && f();
      window.addEventListener("storage", onStorage);
      return () => {
        subs.delete(f);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => EMPTY
  );
}
