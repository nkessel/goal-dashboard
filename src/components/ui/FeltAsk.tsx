"use client";

import { useEffect, useRef, useState } from "react";
import { setFeltAction, type FeltTarget } from "@/app/felt-actions";
import { FaceRating, type FaceValue } from "@/components/ui/FaceRating";

/**
 * "How do you feel?" (owner, Nov 19): one row of five faces, always optional. Tapping a face saves it at once and
 * shows "✓ Saved" with an Undo; no other button. On the celebrations (quests, habits) and the fail scene, and as a
 * row in place under a logged event (`FeltInline`).
 */
export function FeltAsk({ target, light = false, onDone, size }: { target: FeltTarget; light?: boolean; onDone?: () => void; size?: number }) {
  const [value, setValue] = useState<FaceValue | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const ink = light ? "#efe6cc" : "var(--t-ink, #2a1c10)";
  const pick = (v: FaceValue | null) => {
    setValue(v);
    setError(null);
    clearTimeout(timer.current);
    setFeltAction(target, v)
      .then(() => {
        setSaved(v != null);
        // Long enough to take it back with Undo before a row in place folds away.
        if (v != null && onDone) timer.current = setTimeout(onDone, 4000);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't save it."));
  };
  return (
    <div className="flex flex-col items-center gap-1" data-felt-ask>
      {/* "Saved", with Undo to its right (owner, Nov 19). */}
      <span className="font-display flex items-center gap-2.5 text-[16px]" style={{ color: ink }}>
        {saved ? "✓ Saved" : "How do you feel?"}
        {saved && (
          <button type="button" onClick={() => pick(null)} className="text-[13px] underline underline-offset-2" style={{ color: light ? "#d9c79a" : "var(--t-ink-soft)" }}>
            Undo
          </button>
        )}
      </span>
      <FaceRating value={value} light={light} size={size} onChange={pick} />
      {error && (
        <span className="text-[12px]" style={{ color: light ? "#f2b8a8" : "var(--t-warn)" }}>
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * The same row, in place under what you just ticked or logged (no floating strip, so it never covers anything):
 * it slides open, waits a while, and slides closed untouched; × closes it now.
 */
export function FeltInline({ target, onClose, light = false }: { target: FeltTarget; onClose: () => void; light?: boolean }) {
  const [leaving, setLeaving] = useState(false);
  const hold = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const close = useRef(() => {});
  useEffect(() => {
    close.current = () => {
      setLeaving(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(onClose, 260);
    };
    const wait = () => {
      timer.current = setTimeout(() => (hold.current ? wait() : close.current()), 12000);
    };
    wait();
    return () => clearTimeout(timer.current);
  }, [onClose]);
  return (
    <div className={`relative w-full basis-full ${leaving ? "felt-out" : "felt-in"}`} onPointerEnter={() => (hold.current = true)} onPointerLeave={() => (hold.current = false)} data-felt-inline>
      <button type="button" aria-label="Close" onClick={() => close.current()} className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-[17px]" style={{ color: light ? "#d9b45f" : "#8a6c2c" }}>
        ×
      </button>
      <div className="pt-1">
        <FeltAsk target={target} light={light} size={24} onDone={() => close.current()} />
      </div>
    </div>
  );
}

