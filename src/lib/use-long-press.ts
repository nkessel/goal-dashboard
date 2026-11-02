"use client";

import { useRef } from "react";

/**
 * Long-press (or right-click) handlers for an element: `onLong` runs after a
 * steady half-second press, or at once on a right-click. A tap that turned
 * into a long press doesn't also count as a click (check `wasLong()` in onClick).
 */
export function useLongPress(onLong: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  return {
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          fired.current = true;
          clear();
          onLong();
        }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) clear();
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        clear();
        fired.current = true;
        onLong();
      },
    },
    /** True right after a long press, so the click that follows can be ignored. */
    wasLong: () => {
      const v = fired.current;
      fired.current = false;
      return v;
    },
  };
}
