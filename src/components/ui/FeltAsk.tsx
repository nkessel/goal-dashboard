"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { setFeltAction, type FeltTarget } from "@/app/felt-actions";
import { FaceRating, type FaceValue } from "@/components/ui/FaceRating";

/**
 * "How do you feel?" (owner, Nov 19): one row of five faces, always optional. Tapping a face saves it at once and
 * the row folds away with a quiet ✓; no extra button. Used inline on the celebration and the fail screen, and as a
 * small strip near the bottom after a habit tick or a logged event (`askFelt`).
 */
export function FeltAsk({ target, light = false, onDone, size }: { target: FeltTarget; light?: boolean; onDone?: () => void; size?: number }) {
  const [value, setValue] = useState<FaceValue | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const ink = light ? "#efe6cc" : "var(--t-ink, #2a1c10)";
  return (
    <div className="flex flex-col items-center gap-1" data-felt-ask>
      <span className="font-display text-[16px]" style={{ color: ink }}>
        {saved ? "✓ Kept" : "How do you feel?"}
      </span>
      <FaceRating
        value={value}
        light={light}
        size={size}
        onChange={(v) => {
          setValue(v);
          setError(null);
          setFeltAction(target, v)
            .then(() => {
              if (v == null) return;
              setSaved(true);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => onDone?.(), 900);
            })
            .catch((e) => setError(e instanceof Error ? e.message : "Couldn't save it."));
        }}
      />
      {error && (
        <span className="text-[12px]" style={{ color: light ? "#f2b8a8" : "var(--t-warn)" }}>
          {error}
        </span>
      )}
    </div>
  );
}

/** Ask how something felt in the small strip near the bottom (after a habit tick, a logged event…). */
export function askFelt(target: FeltTarget) {
  window.dispatchEvent(new CustomEvent<FeltTarget>("felt-ask", { detail: target }));
}

/** The strip itself: mounted once in the app shell. It slides up, waits a while, and slides away untouched. */
export function FeltStrip() {
  const [ask, setAsk] = useState<{ target: FeltTarget; key: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const hold = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portals need the browser's document
    setReady(true);
    const close = () => {
      setLeaving(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setAsk(null);
        setLeaving(false);
      }, 260);
    };
    const wait = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => (hold.current ? wait() : close()), 9000);
    };
    const on = (e: Event) => {
      const t = (e as CustomEvent<FeltTarget>).detail;
      if (!t) return;
      setLeaving(false);
      setAsk({ target: t, key: Date.now() });
      wait();
    };
    const done = () => close();
    window.addEventListener("felt-ask", on);
    window.addEventListener("felt-ask-done", done);
    return () => {
      window.removeEventListener("felt-ask", on);
      window.removeEventListener("felt-ask-done", done);
      clearTimeout(timer.current);
    };
  }, []);
  if (!ready || !ask) return null;
  return createPortal(
    <div
      key={ask.key}
      className={leaving ? "felt-strip-out" : "felt-strip-in"}
      onPointerEnter={() => (hold.current = true)}
      onPointerLeave={() => (hold.current = false)}
      onFocus={() => (hold.current = true)}
      style={{ position: "fixed", left: "50%", bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)", zIndex: 70, width: "min(360px, calc(100vw - 24px))", borderRadius: 18, padding: "8px 10px 10px", background: "linear-gradient(180deg,#fbf3dc,#efdfb8)", border: "1px solid #b39a6a", boxShadow: "0 10px 26px rgba(40,25,5,.3)" }}
      data-felt-strip
    >
      <button type="button" aria-label="Close" onClick={() => window.dispatchEvent(new Event("felt-ask-done"))} className="absolute right-1.5 top-1 flex h-7 w-7 items-center justify-center rounded-full text-[17px]" style={{ color: "#8a6c2c" }}>
        ×
      </button>
      <FeltAsk target={ask.target} size={26} onDone={() => window.dispatchEvent(new Event("felt-ask-done"))} />
    </div>,
    document.body,
  );
}
