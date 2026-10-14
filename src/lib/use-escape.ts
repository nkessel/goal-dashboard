"use client";

import { useEffect, useEffectEvent } from "react";

/**
 * Close a popup with Escape, wherever focus is. Popups stack: only the most
 * recently opened one closes, so Escape peels them off one at a time.
 */
const stack: number[] = [];
let nextId = 1;
let listening = false;
const handlers = new Map<number, () => void>();

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const top = stack[stack.length - 1];
  const fn = top !== undefined ? handlers.get(top) : undefined;
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  fn();
}

export function useEscape(onEscape: () => void, active = true) {
  const handle = useEffectEvent(onEscape);
  useEffect(() => {
    if (!active) return;
    const id = nextId++;
    stack.push(id);
    handlers.set(id, () => handle());
    if (!listening) {
      window.addEventListener("keydown", onKeyDown, true);
      listening = true;
    }
    return () => {
      handlers.delete(id);
      const i = stack.lastIndexOf(id);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}
