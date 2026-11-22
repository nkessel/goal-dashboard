"use client";

import { useLayoutEffect, useRef } from "react";
import { msSinceEnterStart, takeStandInSwap } from "@/lib/standin";

/**
 * Sits just before a screen's <main>. When this screen replaces a tab's stand-in, the entrance
 * slide already played on the stand-in: the real <main> carries on from the same point (or
 * simply rests, once the slide is over) instead of sliding in again.
 */
export function SlideContinue() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!takeStandInSwap()) return;
    const main = ref.current?.nextElementSibling as HTMLElement | null;
    if (!main) return;
    if (document.documentElement.hasAttribute("data-enter")) main.style.animationDelay = `-${msSinceEnterStart()}ms`;
    else main.style.animation = "none";
  }, []);
  return <span ref={ref} hidden />;
}
