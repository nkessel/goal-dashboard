"use client";

import { eveningDayKey } from "@/components/evening/evening-clock";

/**
 * What you kept from the toucan's question (owner, Nov 19): your words for today, shown in a small floating
 * target you can open all day. Kept on this device; the words are also in today's journal.
 */
export type Kept = { day: string; text: string; id: string | null; x?: number; y?: number };

const KEY = "toucan-kept";
let cache: { raw: string | null; value: Kept | null } = { raw: null, value: null };

export function readKept(): Kept | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cache.raw) return cache.value;
  let value: Kept | null = null;
  try {
    const k = raw ? (JSON.parse(raw) as Kept) : null;
    value = k && typeof k.text === "string" && k.day === eveningDayKey() ? k : null;
  } catch {
    value = null;
  }
  cache = { raw, value };
  return value;
}

function write(k: Kept | null) {
  try {
    if (k) window.localStorage.setItem(KEY, JSON.stringify(k));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: it shows until the page reloads */
  }
  window.dispatchEvent(new Event("toucan-kept"));
}

export function keepImportant(text: string, id: string | null) {
  const was = readKept();
  write({ day: eveningDayKey(), text, id, x: was?.x, y: was?.y });
}

export function moveKept(x: number, y: number) {
  const k = readKept();
  if (k) write({ ...k, x, y });
}

export function putAwayKept() {
  write(null);
}

export function subscribeKept(cb: () => void) {
  window.addEventListener("toucan-kept", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("toucan-kept", cb);
    window.removeEventListener("storage", cb);
  };
}
