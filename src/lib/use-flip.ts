"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Manual FLIP (First-Last-Invert-Play) animation for a reordering list —
 * makes cards visibly slide into their new position instead of teleporting
 * there instantly. Works alongside useDragReorder's live-splice reordering:
 * every time the rendered order changes (mid-drag reflow, or the final
 * settle), each item is measured before/after and animated across the
 * difference.
 *
 * Items that appear for the first time *after* the initial mount (a new
 * quest added from the FAB, a new goal or board) instead play a gentle
 * fade + rise entrance, rather than popping in instantly. The very first
 * render's items are never treated as "new" — only ones added afterward.
 *
 * Usage: const register = useFlip(items, (item) => item.id); then put
 * ref={register(id)} on each item's root DOM node.
 */
export function useFlip<T>(items: T[], getId: (item: T) => string) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const knownIds = useRef(new Set<string>());
  const hasMounted = useRef(false);
  const key = items.map(getId).join("|");

  useLayoutEffect(() => {
    const newRects = new Map<string, DOMRect>();
    nodes.current.forEach((el, id) => {
      newRects.set(id, el.getBoundingClientRect());
    });

    newRects.forEach((newRect, id) => {
      const el = nodes.current.get(id);
      if (!el) return;
      const prevRect = prevRects.current.get(id);

      if (!prevRect) {
        if (hasMounted.current && !knownIds.current.has(id)) {
          el.style.transition = "none";
          el.style.opacity = "0";
          el.style.transform = "translateY(8px) scale(0.96)";
          // Force a reflow so the browser registers the starting state
          // before we animate away from it.
          el.getBoundingClientRect();
          requestAnimationFrame(() => {
            el.style.transition = "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 220ms ease";
            el.style.opacity = "";
            el.style.transform = "";
          });
        }
        knownIds.current.add(id);
        return;
      }

      knownIds.current.add(id);
      const dx = prevRect.left - newRect.left;
      const dy = prevRect.top - newRect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect();
      requestAnimationFrame(() => {
        el.style.transition = "transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        el.style.transform = "";
      });
    });

    // Forget ids that are no longer rendered (completed/deleted/moved away)
    // so a reused id later is treated as new again rather than skipped.
    knownIds.current.forEach((id) => {
      if (!newRects.has(id)) knownIds.current.delete(id);
    });

    prevRects.current = newRects;
    hasMounted.current = true;
  }, [key]);

  function register(id: string) {
    return (el: HTMLElement | null) => {
      if (el) nodes.current.set(id, el);
      else nodes.current.delete(id);
    };
  }

  return register;
}
