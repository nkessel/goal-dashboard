"use client";

import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from "react";
import { setEveningMode, useEveningMode } from "./evening-clock";

const FlipContext = createContext<(toEvening: boolean) => void>(() => {});

/** Flip the Today's Quest screen to its evening side (or back). */
export function useFlipToEvening() {
  return useContext(FlipContext);
}

/**
 * Today's Quest has two sides. The day side is the usual screen; the evening
 * side holds the evening rites. Flipping turns the whole screen over like a
 * card: the old side rotates away, the new one rotates in.
 */
export function DayNightFlip({ day, evening }: { day: React.ReactNode; evening: React.ReactNode }) {
  const isEvening = useEveningMode();
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Night sky behind the evening side.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-evening", isEvening);
    return () => document.documentElement.removeAttribute("data-evening");
  }, [isEvening]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const boxRef = useRef<HTMLDivElement>(null);

  function flip(toEvening: boolean) {
    if (toEvening === isEvening || phase !== "idle") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setEveningMode(toEvening);
      window.scrollTo({ top: 0 });
      return;
    }
    // Turn over in place around the middle of what's on screen — no scrolling
    // while it turns; the new side starts at the top once it's edge-on.
    const box = boxRef.current;
    if (box) box.style.setProperty("--flip-y", `${window.scrollY + window.innerHeight / 2 - (box.getBoundingClientRect().top + window.scrollY)}px`);
    setPhase("out");
    timers.current.push(
      setTimeout(() => {
        setEveningMode(toEvening);
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        if (box) box.style.setProperty("--flip-y", `${window.innerHeight / 2}px`);
        setPhase("in");
      }, 300),
      setTimeout(() => setPhase("idle"), 300 + 420)
    );
  }

  // The evening screen's back button (in the top bar, outside this tree) asks via an event.
  const onRequest = useEffectEvent((e: Event) => flip(Boolean((e as CustomEvent<{ toEvening: boolean }>).detail?.toEvening)));
  useEffect(() => {
    const h = (e: Event) => onRequest(e);
    window.addEventListener("day-night-flip", h);
    return () => window.removeEventListener("day-night-flip", h);
  }, []);

  return (
    <FlipContext.Provider value={flip}>
      <div ref={boxRef} className={phase === "out" ? "flip-out" : phase === "in" ? "flip-in" : undefined}>{isEvening ? evening : day}</div>
    </FlipContext.Provider>
  );
}
