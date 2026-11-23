"use client";

// REPEAT-ASK CODE (docs/REPEAT-ASKS.md 1 and 16): the screen's height held still under a phone keyboard, and the card's
// lift over a low field. Moved whole and unchanged out of WelcomeCard (split plan W4); change it only with a real iPhone.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export function useHeldScreen(cardRef: RefObject<HTMLDivElement | null>) {
  // The screen's height, held still while a phone keyboard is up (or a field has focus), so
  // opening and closing it (the feedback box, a field here) never resizes or moves the card.
  const [screenH, setScreenH] = useState<number | null>(null);
  // Keyboard up over a field low on the card (the toucan's respond line, say): the card glides
  // up just enough to show it, and back down when the keyboard goes.
  const [kbLift, setKbLift] = useState(0);
  // Room added under the card's parts while the keyboard is up, so the card can scroll a low field into view.
  const [kbRoom, setKbRoom] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const a = document.activeElement as HTMLElement | null;
        const inside = !!a?.closest("[data-welcome-root]") && (a instanceof HTMLTextAreaElement || a instanceof HTMLInputElement || !!a?.isContentEditable);
        // Against the held height: Chrome on iPhone shrinks innerHeight with the keyboard, so innerHeight alone never shows it.
        const base = Math.max(window.innerHeight, screenRef.current?.h ?? 0);
        if (!inside || base - vv.height < 120) return setKbLift(0), setKbRoom(0);
        setKbLift((cur) => {
          const r = a!.getBoundingClientRect();
          // Where it would sit without the lift.
          const bottom = r.bottom + cur;
          const top = r.top + cur;
          const need = Math.max(0, Math.round(Math.min(bottom - (vv.offsetTop + vv.height - 14), top - vv.offsetTop - 60)));
          // Never so far that the toucan perched on the card's top goes off the screen (ui-check, Nov 6: the
          // Journal's box sits lower): the rest is made up by scrolling the card over a little room at its foot.
          const cardTop = (cardRef.current?.getBoundingClientRect().top ?? 0) + cur;
          const most = Math.max(0, Math.round(cardTop - vv.offsetTop - 64));
          const lift = Math.min(need, most);
          const rest = need - lift;
          setKbRoom(rest);
          if (rest > 0) requestAnimationFrame(() => cardRef.current?.scrollBy({ top: rest, behavior: "smooth" }));
          return lift;
        });
      });
    };
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", check);
      vv.removeEventListener("scroll", check);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `cardRef` is a ref (kept as it was in WelcomeCard)
  }, []);
  // Measured before the first paint, then again only when the screen's width changes (a turn of the phone):
  // iPhone's toolbars and keyboard change its height while you scroll or type, and the card must not follow
  // (that was the bounce while scrolling and the dark band as the keyboard went down; owner's recordings, Nov 2).
  const screenRef = useRef<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const typing = () => {
      const a = document.activeElement;
      return document.documentElement.hasAttribute("data-kb") || a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && !["range", "checkbox", "radio", "button"].includes(a.type));
    };
    const measure = () => {
      const w = window.innerWidth;
      const prev = screenRef.current;
      if (prev && (prev.w === w || typing())) return;
      screenRef.current = { w, h: window.innerHeight };
      setScreenH(window.innerHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);
  return { screenH, kbLift, kbRoom };
}
