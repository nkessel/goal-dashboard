"use client";

import { useEffect, useState } from "react";
import { keyboardUp } from "@/lib/keyboard-up";

/**
 * While the on-screen keyboard is up, the strip of screen above it ({ top, height }, in the
 * layout viewport a fixed layer lives in); null while it's down. A popup that sits in this strip
 * can't be covered by the keyboard or pushed around by the browser's panning: it follows the
 * pan at once (owner's recording, Nov 3: the portrait picker slid under the keyboard and jumped).
 * Mark the layer with data-kb-fit so the app-wide keyboard handling leaves its size alone.
 */
export function useFitAboveKeyboard(active = true): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    let raf = 0;
    let closing = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const up = keyboardUp();
        if (up) {
          clearTimeout(closing);
          closing = 0;
          const next = { top: Math.round(vv.offsetTop), height: Math.round(vv.height) };
          setBox((b) => (b && b.top === next.top && b.height === next.height ? b : next));
        } else if (!closing) {
          // Let go a moment after it's down, so a hop between fields doesn't flicker.
          closing = window.setTimeout(() => {
            closing = 0;
            setBox(null);
          }, 200);
        }
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(closing);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return active ? box : null;
}
