"use client";

import { useEffect } from "react";

/**
 * The browser's own right-click menu never shows (owner, Nov 4): right-click opens the app's
 * menus where a part has one, and otherwise does nothing. Text fields keep the browser's menu
 * (paste, spelling), and so does a press with text selected (copy). On touch screens a long
 * press doesn't select text outside fields either.
 */
export function NoBrowserMenu() {
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("input, textarea, select, [contenteditable='true'], [data-browser-menu]")) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      e.preventDefault();
    };
    // Bubbling on window: the app's own menus (React handlers) have already opened by now.
    window.addEventListener("contextmenu", on);
    // On a touch screen a long press never selects text (owner, Nov 9: the blue highlight, the
    // magnifier and "Copy · Look Up · Translate" came up while holding a card to drag it, and
    // cancelled the drag). Text fields, and anything marked data-selectable, still select.
    let touch = false;
    const down = (e: PointerEvent) => {
      touch = e.pointerType === "touch" || e.pointerType === "pen";
    };
    const select = (e: Event) => {
      if (!touch) return;
      const el = e.target instanceof Element ? e.target : e.target instanceof Node ? e.target.parentElement : null;
      if (el?.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], [data-selectable]")) return;
      e.preventDefault();
    };
    window.addEventListener("pointerdown", down, true);
    document.addEventListener("selectstart", select, true);
    return () => {
      window.removeEventListener("contextmenu", on);
      window.removeEventListener("pointerdown", down, true);
      document.removeEventListener("selectstart", select, true);
    };
  }, []);
  return null;
}
