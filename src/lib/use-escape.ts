"use client";

import { useEffect, useEffectEvent } from "react";

/**
 * Close a popup with Escape, wherever focus is. Popups stack: only the most
 * recently opened one closes, so Escape peels them off one at a time.
 */
const stack: number[] = [];
/** Popups that always come first (the feedback box floats over everything, whenever it opened). */
const first = new Set<number>();
let nextId = 1;
let listening = false;
const handlers = new Map<number, () => void>();

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const top = [...stack].reverse().find((id) => first.has(id)) ?? stack[stack.length - 1];
  const fn = top !== undefined ? handlers.get(top) : undefined;
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  fn();
}

export function useEscape(onEscape: () => void, active = true, priority = false) {
  const handle = useEffectEvent(onEscape);
  useEffect(() => {
    if (!active) return;
    const id = nextId++;
    stack.push(id);
    if (priority) first.add(id);
    handlers.set(id, () => handle());
    if (!listening) {
      window.addEventListener("keydown", onKeyDown, true);
      listening = true;
    }
    return () => {
      handlers.delete(id);
      first.delete(id);
      const i = stack.lastIndexOf(id);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active, priority]);
}
