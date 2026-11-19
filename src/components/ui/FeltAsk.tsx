"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { setFeltAction, type FeltTarget } from "@/app/felt-actions";
import { FaceRating, type FaceValue } from "@/components/ui/FaceRating";

/**
 * "How do you feel?" (owner, Nov 19): one row of five faces, always optional. Tapping a face saves it at once and
 * the row folds away with a quiet ✓; no extra button. Used inline on the celebration and the fail screen, and as a
 * row in place under a ticked habit or a logged event (`FeltInline`).
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

/**
 * Which habit is waiting for its face, kept outside the list so a redraw (the save refreshing Today) doesn't lose it.
 */
let pendingHabit: string | null = null;
const listeners = new Set<() => void>();
export function setFeltHabit(id: string | null) {
  pendingHabit = id;
  for (const l of listeners) l();
}
export function useFeltHabit(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => pendingHabit,
    () => null,
  );
}
