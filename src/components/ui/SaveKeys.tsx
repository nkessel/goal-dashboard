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
      // Ctrl/⌘+S never opens the browser's "Save page" in the app, whether or not there's anything to save.
      const handled = e.defaultPrevented;
      if (s) e.preventDefault();
      if (fromFeedback(e) || document.querySelector("[data-save-keys]")) return;
      const popups = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"], [role="alertdialog"]')].filter((el) => !el.closest("[data-feedback-root]"));
      const active = document.activeElement;
      const first = popups.find((el) => active && el.contains(active)) ?? popups[popups.length - 1];
      if (!first || handled) return;
      const submitIn = (el: HTMLElement) => el.querySelector<HTMLButtonElement>("[data-submit]:not(:disabled)") ?? el.querySelector<HTMLButtonElement>('button[type="submit"]:not(:disabled)');
      // A picker open over a form (a portrait chooser over the habit editor) has nothing to submit: save the form under it.
      const box = submitIn(first) || first.querySelector("form") ? first : ([...popups].reverse().find((el) => el !== first && submitIn(el)) ?? first);
      const btn = submitIn(box);
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
