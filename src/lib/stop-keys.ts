import type { KeyboardEvent } from "react";

/**
 * Keep typing, Space and arrows inside a card's controls (so they don't start a drag),
 * but let Escape and the save shortcuts (Ctrl/⌘+S, Ctrl/⌘+Enter) reach the window, where
 * dialogs listen for them. Stopping those too meant a quest opened from its card never
 * saved with Ctrl+S (owner, Nov 2).
 */
export function stopKeysButSave(e: KeyboardEvent) {
  if (e.key === "Escape") return;
  if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S" || e.key === "Enter")) return;
  e.stopPropagation();
}
