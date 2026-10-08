"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
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

  function flip(toEvening: boolean) {
    if (toEvening === isEvening || phase !== "idle") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setEveningMode(toEvening);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setPhase("out");
    timers.current.push(
      setTimeout(() => {
        setEveningMode(toEvening);
        setPhase("in");
      }, 300),
      setTimeout(() => setPhase("idle"), 300 + 420)
    );
  }

  return (
    <FlipContext.Provider value={flip}>
      <div className={phase === "out" ? "flip-out" : phase === "in" ? "flip-in" : undefined}>{isEvening ? evening : day}</div>
    </FlipContext.Provider>
  );
}
