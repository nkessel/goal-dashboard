"use client";

import { useEffect } from "react";
import { fromFeedback } from "@/lib/from-feedback";

/**
 * Ctrl/⌘+Enter or Ctrl/⌘+S saves whichever dialog or popup you're in: it
 * presses that popup's main button (marked data-submit, or a submit button).
 * The quest editor handles these keys itself (data-save-keys), and the
 * feedback box has its own Ctrl+Enter.
 */
export function SaveKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = e.key === "s" || e.key === "S";
      if (!(e.ctrlKey || e.metaKey) || e.altKey || !(s || e.key === "Enter")) return;
      if (e.defaultPrevented || fromFeedback(e) || document.querySelector("[data-save-keys]")) return;
      const popups = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"], [role="alertdialog"]')].filter((el) => !el.closest("[data-feedback-root]"));
      const active = document.activeElement;
      const box = popups.find((el) => active && el.contains(active)) ?? popups[popups.length - 1];
      if (!box) return;
      const btn =
        box.querySelector<HTMLButtonElement>("[data-submit]:not(:disabled)") ??
        box.querySelector<HTMLButtonElement>('button[type="submit"]:not(:disabled)');
      if (btn) {
        e.preventDefault();
        btn.click();
        return;
      }
      const form = box.querySelector("form");
      if (form) {
        e.preventDefault();
        form.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
