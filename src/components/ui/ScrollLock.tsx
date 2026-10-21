"use client";

import { useEffect } from "react";

/**
 * While any popup, editor or sheet is open (anything marked aria-modal), the
 * page behind it stays still. The feedback box isn't modal, so the page can
 * still be scrolled while writing feedback about it.
 */
export function ScrollLock() {
  useEffect(() => {
    const html = document.documentElement;
    let locked = false;
    const check = () => {
      const open = !!document.querySelector('[aria-modal="true"]');
      if (open === locked) return;
      locked = open;
      html.classList.toggle("scroll-locked", open);
    };
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
    check();
    return () => {
      mo.disconnect();
      html.classList.remove("scroll-locked");
    };
  }, []);
  return null;
}
