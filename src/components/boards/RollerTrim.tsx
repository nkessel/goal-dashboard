"use client";

import { useSyncExternalStore } from "react";

/** How a board scroll's bottom roller is trimmed (owner, Nov 20: swoosh 4B, hairlines as a choice). Per device. */
export type RollerTrim = "ornaments" | "lines" | "plain";
const KEY = "board-roller-trim";
const EVT = "board-roller-trim-change";

function read(): RollerTrim {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "lines" || v === "plain" ? v : "ornaments";
  } catch {
    return "ornaments";
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}
export function useRollerTrim(): [RollerTrim, (t: RollerTrim) => void] {
  const trim = useSyncExternalStore(subscribe, read, () => "ornaments" as RollerTrim);
  const set = (t: RollerTrim) => {
    try {
      window.localStorage.setItem(KEY, t);
    } catch {
      /* private window: the choice lasts until reload */
    }
    window.dispatchEvent(new Event(EVT));
  };
  return [trim, set];
}

/** Woven swoosh: two strokes weaving over and under each other; drawn for the left, mirrored for the right. */
const SWOOSH = "M2 10C12 1 20 1 29 10S46 19 58 9M2 10C12 19 20 19 29 10S46 1 58 11";

export function RollerTrimMark({ side, trim }: { side: "l" | "r"; trim: RollerTrim }) {
  if (trim === "plain") return null;
  if (trim === "lines") return <span aria-hidden className="roller-hair" />;
  return (
    <svg aria-hidden className={`roller-swoosh${side === "r" ? " r" : ""}`} width="58" height="18" viewBox="0 0 60 18">
      <path d={SWOOSH} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
