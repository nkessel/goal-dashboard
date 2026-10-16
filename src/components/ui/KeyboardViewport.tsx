"use client";

import { useEffect } from "react";

/**
 * Keeps popups clear of the on-screen keyboard, app-wide.
 *
 * iPhone Safari slides the keyboard over the page without resizing it, so a
 * popup centered on the full screen ends up half under the keyboard. This
 * publishes the part of the screen that is actually visible:
 *   --vvh     visible height (px)
 *   --vv-top  how far the visible area is scrolled down (px)
 *   html[data-kb]      the keyboard is up (globals.css then fits every
 *                      full-screen overlay into the visible area)
 *   html[data-typing]  a text field has focus on a touch screen (bottom bar,
 *                      + button and feedback button step aside)
 * Android Chrome resizes the page itself (see `interactiveWidget` in the root
 * layout), so there the regular layout already fits and data-kb stays off.
 *
 * It also scrolls a focused field back into view once the keyboard settles.
 */
export function KeyboardViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const touch = window.matchMedia("(pointer: coarse)").matches;

    const update = () => {
      if (!vv) return;
      // Pinch-zoom also shrinks the visual viewport; only a keyboard does it at scale 1.
      const hidden = window.innerHeight - vv.height * vv.scale;
      const keyboard = vv.scale < 1.1 && hidden > 120;
      root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      root.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
      if (keyboard) root.setAttribute("data-kb", "");
      else root.removeAttribute("data-kb");
    };

    const isTextField = (el: Element | null): el is HTMLElement => {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
      return el instanceof HTMLInputElement && !["range", "checkbox", "radio", "button", "submit", "color", "file"].includes(el.type);
    };

    let settle: number | undefined;
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as Element | null;
      if (!isTextField(el)) return;
      if (touch) root.setAttribute("data-typing", "");
      // After the keyboard has slid up, bring the field back into sight if it's hidden.
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (document.activeElement !== el) return;
        const r = el.getBoundingClientRect();
        const top = vv ? vv.offsetTop : 0;
        const bottom = top + (vv ? vv.height : window.innerHeight);
        if (r.top < top + 8 || r.bottom > bottom - 8) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 350);
    };
    const onFocusOut = () => {
      // Moving straight to another field keeps the typing state.
      window.setTimeout(() => {
        if (!isTextField(document.activeElement)) root.removeAttribute("data-typing");
      }, 60);
    };

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      window.clearTimeout(settle);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.removeAttribute("data-kb");
      root.removeAttribute("data-typing");
    };
  }, []);
  return null;
}
