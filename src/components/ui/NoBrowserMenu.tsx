"use client";

import { useEffect } from "react";

/**
 * The browser's own right-click menu never shows (owner, Nov 4): right-click opens the app's
 * menus where a part has one, and otherwise does nothing. Text fields keep the browser's menu
 * (paste, spelling), and so does a press with text selected (copy).
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
    return () => window.removeEventListener("contextmenu", on);
  }, []);
  return null;
}
