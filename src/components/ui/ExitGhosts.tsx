"use client";

import { useEffect } from "react";

/** Popups, menus and dialogs that animate in. When one is taken off the page without an exit of its own, it fades out instead of vanishing. */
const POPUP = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="tooltip"],.card-pop-in,.pop,.overlay-fade-in,.fade-in,.time-dial,.sheet-slide-up-in';
const ALREADY_LEAVING = /(^|\s)(\S*-out|\S*leave\S*|\S*closing\S*)(\s|$)/;

/**
 * App-wide exit animations. Anything that pops in (a menu, a time dial, a
 * dialog) but is unmounted at once by its owner leaves a brief "ghost" in its
 * place: an inert copy that fades and sinks away (160ms), so nothing on screen
 * ever just blinks out. Only floating things (fixed or absolute) get a ghost,
 * so it can never push the layout around. Opt out with `data-no-ghost`.
 */
export function ExitGhosts() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const mo = new MutationObserver((records) => {
      for (const m of records) {
        const parent = m.target as Element;
        if (!parent.isConnected) continue;
        m.removedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement) || n.dataset.ghost || n.dataset.noGhost !== undefined) return;
          if (!n.matches(POPUP) || ALREADY_LEAVING.test(n.className)) return;
          // Something in it was already playing its own exit (a dive, a fade-out): leave it be.
          if (n.querySelector('[class*="-out"],[class*="leav"],[class*="closing"],[class*="exit"],[data-no-ghost]')) return;
          const ghost = n.cloneNode(true) as HTMLElement;
          ghost.dataset.ghost = "1";
          ghost.setAttribute("aria-hidden", "true");
          ghost.inert = true;
          const before = m.nextSibling && m.nextSibling.parentNode === parent ? m.nextSibling : null;
          try {
            parent.insertBefore(ghost, before);
          } catch {
            return;
          }
          const cs = getComputedStyle(ghost);
          if ((cs.position !== "fixed" && cs.position !== "absolute") || cs.display === "none" || cs.visibility === "hidden") {
            ghost.remove();
            return;
          }
          // Hold still (no replay of its own entrance), then fade away.
          ghost.style.animation = "none";
          ghost.querySelectorAll<HTMLElement>("*").forEach((el) => (el.style.animation = "none"));
          ghost.style.pointerEvents = "none";
          const t = cs.transform === "none" ? "" : cs.transform;
          const a = ghost.animate(
            [
              { opacity: 1, transform: t || "none" },
              { opacity: 0, transform: `${t} translateY(3px) scale(0.98)` },
            ],
            { duration: 160, easing: "ease-in", fill: "forwards" }
          );
          const done = () => ghost.remove();
          a.onfinish = done;
          a.oncancel = done;
          setTimeout(done, 400);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return null;
}
