"use client";

import { useEffect } from "react";

/** A card's "more" button: the ⋯ that opens its menu. */
const isMoreButton = (el: Element) =>
  el instanceof HTMLButtonElement && !el.disabled && (el.textContent?.trim() === "⋯" || /^More( for|$)/.test(el.getAttribute("aria-label") ?? ""));

/**
 * Right-click anywhere on a card opens the same menu as its ⋯ button, across
 * the app. Cards that handle right-click themselves are left alone, and so
 * are text fields and links (their own browser menu is more useful there), and the search
 * stops at `[data-menu-scope]` (a tray under a card keeps its own right-click).
 */
export function ContextMenuBridge() {
  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      if (e.defaultPrevented || e.shiftKey) return;
      const target = e.target as Element | null;
      if (!target || target.closest("input, textarea, select, a, [contenteditable=''], [contenteditable='true'], [data-feedback-root], [role='menu']")) return;
      // The nearest box around the pointer holding exactly one ⋯ button is the card.
      for (let el: Element | null = target, depth = 0; el && el !== document.body && depth < 10; el = el.parentElement, depth++) {
        const buttons = [...el.querySelectorAll("button")].filter(isMoreButton);
        if (buttons.length > 1) return;
        if (buttons.length === 1) {
          e.preventDefault();
          buttons[0].click();
          return;
        }
        // A tray of its own things (tomorrow's quests under their rite) never borrows the card's menu above it (owner, Nov 5).
        if (el.hasAttribute("data-menu-scope")) return;
      }
    };
    document.addEventListener("contextmenu", onMenu);
    return () => document.removeEventListener("contextmenu", onMenu);
  }, []);
  return null;
}
