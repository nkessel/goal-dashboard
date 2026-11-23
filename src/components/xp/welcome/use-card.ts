"use client";

// The welcome card's own measuring and placing, moved whole out of WelcomeCard (split plan W4). Each hook owns its
// state and refs and takes the card's ref.
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { readJson } from "./shared";

/** The pinned cap and foot: their parchment lines up with the card's own as it scrolls and resizes. */
export function usePinnedPaper(cardRef: RefObject<HTMLDivElement | null>) {
  const footRef = useRef<HTMLDivElement>(null);
  // The pinned cap at the card's top too (the band the toucan perches on and the corner buttons sit in).
  const capRef = useRef<HTMLDivElement>(null);
  const alignFoot = () => {
    const c = cardRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();
    for (const f of [footRef.current, capRef.current]) {
      if (!f) continue;
      const fr = f.getBoundingClientRect();
      f.style.backgroundPosition = `${Math.round(cr.left + c.clientLeft - fr.left)}px ${Math.round(cr.top + c.clientTop - fr.top)}px`;
    }
  };
  // Once (it re-ran on every render, measuring the card each time, during the mist's opening).
  useLayoutEffect(() => {
    alignFoot();
    window.addEventListener("resize", alignFoot);
    const ro = new ResizeObserver(alignFoot);
    if (cardRef.current) ro.observe(cardRef.current);
    return () => {
      window.removeEventListener("resize", alignFoot);
      ro.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on purpose (see above); `alignFoot` reads only refs
  }, []);
  return { footRef, capRef, alignFoot };
}

/** A spacer under the parts that holds the scroll still while a part folds shut, and gives the room back on the way up. */
export function useHeldScroll(cardRef: RefObject<HTMLDivElement | null>) {
  // A part folding shut near the bottom must not pull everything down (the card would scroll back to
  // fit, moving what you tapped; ui-check, Nov 2): a spacer under the parts holds the scroll still, and
  // gives the room back as you scroll up.
  const spacerRef = useRef<HTMLDivElement>(null);
  const holdScroll = () => {
    const c = cardRef.current;
    const sp = spacerRef.current;
    if (!c || !sp) return;
    const st = c.scrollTop;
    if (st <= 0) return;
    const until = performance.now() + 700;
    const tick = () => {
      const max = c.scrollHeight - c.clientHeight;
      if (max < st - 0.5) {
        sp.style.height = `${(parseFloat(sp.style.height) || 0) + (st - max)}px`;
        c.scrollTop = st;
      }
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const lastTop = useRef(0);
  const giveBack = () => {
    const c = cardRef.current;
    const sp = spacerRef.current;
    if (!c || !sp) return;
    const h = parseFloat(sp.style.height) || 0;
    const up = lastTop.current - c.scrollTop;
    lastTop.current = c.scrollTop;
    if (h > 0 && up > 0) sp.style.height = `${Math.max(0, h - up)}px`;
  };
  return { spacerRef, holdScroll, giveBack };
}

/** Where the card sits and how wide (kept on this device), never off the screen; drag and resize read and write it. */
export function useCardPlacement(cardRef: RefObject<HTMLDivElement | null>) {
  // Where you've put it, and how wide (kept on this device).
  const [at, setAt] = useState<{ x: number; y: number }>(() => readJson("welcome-card-at", { x: 0, y: 0 }));
  const [cardW, setCardW] = useState<number>(() => readJson("welcome-card-w", 500));
  const movingRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  // Never off the screen: a spot (or width) kept from a wider window, or a drag too far, comes back in.
  useLayoutEffect(() => {
    // Only a new width counts: the keyboard (and Chrome's toolbar) change the height alone, and the
    // card's spot mustn't be pulled up for good while a field has focus.
    let lastW = -1;
    const fitIn = () => {
      const c = cardRef.current;
      if (!c || movingRef.current || window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      const w = c.offsetWidth;
      const maxX = Math.max(0, (window.innerWidth - w) / 2 - 16);
      const maxY = Math.max(0, window.innerHeight * 0.4);
      setAt((a) => {
        const x = Math.round(Math.max(-maxX, Math.min(maxX, a.x)));
        const y = Math.round(Math.max(0, Math.min(maxY, a.y)));
        return x === a.x && y === a.y ? a : { x, y };
      });
    };
    fitIn();
    window.addEventListener("resize", fitIn);
    return () => window.removeEventListener("resize", fitIn);
  }, [cardW, cardRef]);
  const sizingRef = useRef<{ x: number; w: number } | null>(null);
  return { at, setAt, cardW, setCardW, movingRef, sizingRef };
}
