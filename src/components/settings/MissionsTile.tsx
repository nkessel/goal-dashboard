"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "@/lib/use-escape";

/**
 * Secret Missions as a half-width tile (owner, Nov 4). Tapping it slides its screen in from the right,
 * over the settings, with ‹ Back, so everything stays in one settings box.
 */
export function MissionsTile({ isAdventure, count, open: startOpen = false, children }: { isAdventure: boolean; count: number; open?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(startOpen);
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setLeaving(true);
    window.setTimeout(() => (setOpen(false), setLeaving(false)), 220);
  };
  useEscape(close, open);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`hover-glow flex w-full items-center gap-2.5 px-3.5 py-3 text-left ${isAdventure ? "parchment" : ""}`}
        style={isAdventure ? { borderRadius: 14 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 14 }}
      >
        <span aria-hidden className="text-[20px] leading-none">
          🗝️
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[16px] font-semibold" style={{ color: "var(--t-ink)" }}>
            Secret Missions
          </span>
          <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
            {count ? `${count} sealed` : "None yet"}
          </span>
        </span>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex justify-end" onClick={close} style={{ background: "rgba(10,14,10,.35)" }}>
            <div
              role="dialog"
              aria-label="Secret Missions"
              onClick={(e) => e.stopPropagation()}
              className={`${leaving ? "slide-out-right" : "slide-in-right"} parchment flex h-full w-full max-w-[460px] flex-col overflow-y-auto p-4 shadow-2xl`}
              style={isAdventure ? undefined : { background: "var(--t-card)" }}
            >
              <div className="mb-2 flex items-center gap-2">
                <button type="button" onClick={close} className="flex h-9 items-center gap-1 rounded-full pl-1.5 pr-3 text-[15px] font-semibold hover:bg-black/5" style={{ color: "var(--t-ink)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back
                </button>
                <p className={`m-0 text-[19px] ${isAdventure ? "font-display" : "font-bold"}`} style={{ color: "var(--t-ink)" }}>
                  🗝️ Secret Missions
                </p>
              </div>
              {children}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
