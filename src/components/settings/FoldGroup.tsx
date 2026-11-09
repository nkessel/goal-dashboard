"use client";

import { useEffect, useRef, useState } from "react";
import { Fold } from "@/components/ui/Fold";

/**
 * One folded group of settings inside a section: tap its bar to open or close it (it slides
 * both ways). While it's closed, `value` shows what it's set to. Settings search opens one by
 * sending it a "settings-group-open" event (data-settings-group).
 *
 * Was a native <details> (owner, Nov 5: "His look" didn't fold on every click); the app's own
 * fold always toggles on a click and animates like every other tray.
 */
export function FoldGroup({ id, title, hint, value, isAdventure, open: startOpen, children }: { /** Found by Settings search (data-settings-group). */ id?: string; title: string; hint?: string; value?: React.ReactNode; isAdventure?: boolean; open?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!startOpen);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const show = () => setOpen(true);
    el.addEventListener("settings-group-open", show);
    return () => el.removeEventListener("settings-group-open", show);
  }, []);
  return (
    <div ref={box} data-settings-group={id} data-open={open ? "true" : "false"} className="rounded-xl" style={{ border: "1px solid rgba(139,112,64,.3)" }}>
      {/* The whole bar is the tap target. */}
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full cursor-pointer flex-wrap items-baseline gap-x-2 px-3 py-2 text-left">
        <span className={isAdventure === false ? "text-sm font-bold" : "font-display text-[15px]"}>{title}</span>
        {value && !open && (
          <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
            {value}
          </span>
        )}
        <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className="ml-auto self-center" style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 220ms ease", opacity: 0.6 }}>
          <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Fold open={open}>
        <div className="px-3 pb-2">
          {hint && (
            <p className="mb-2 mt-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
              {hint}
            </p>
          )}
          {children}
        </div>
      </Fold>
    </div>
  );
}
