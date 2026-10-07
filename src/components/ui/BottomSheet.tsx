"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Shared popup shell: slides up from the bottom over a darkening backdrop,
 * and closes with a "minimize toward the center" shrink instead of sliding
 * back down (see .sheet-slide-up-in / .sheet-minimize-out / .overlay-fade-*
 * in globals.css). Used by the New Quest FAB and the Today's Battle "add a
 * quest" picker.
 *
 * Owns its own closing animation timing so callers just pass `onClose` and
 * don't have to know the delay — children get a `requestClose` (via the
 * render-prop `children`) that plays the closing animation first, instead
 * of calling `onClose` directly and unmounting instantly.
 */
export function BottomSheet({
  onClose,
  theme = "calm",
  children,
}: {
  onClose: () => void;
  theme?: "calm" | "adventure";
  children: (requestClose: () => void) => React.ReactNode;
}) {
  const isAdventure = theme === "adventure";
  const [closing, setClosing] = useState(false);

  function requestClose() {
    // Functional update so a double-fire (Escape held down, or a stray
    // second click while already closing) reads the *latest* `closing`
    // value at commit time rather than whatever was captured in whichever
    // closure called this — avoids needing a ref just to dodge staleness.
    setClosing((already) => {
      if (already) return already;
      setTimeout(onClose, 220);
      return true;
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestClose's setClosing updater always reads fresh state, doesn't need to be a dep
  }, []);

  // Portaled to <body> so no transformed/animated ancestor (page slide-in,
  // hover lift) can trap the "fixed" overlay inside itself, and centered on
  // screen rather than pinned to the bottom edge.
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        closing ? "overlay-fade-out" : "overlay-fade-in"
      }`}
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        // Defensive: don't bubble into whatever's underneath (e.g. a card's
        // own click-to-edit) — closing the sheet by tapping the backdrop
        // shouldn't also trigger something behind it.
        e.stopPropagation();
        requestClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-md flex-col gap-3 rounded-2xl p-4 parchment parchment-framed shadow-2xl ${
          closing ? "sheet-minimize-out" : "sheet-slide-up-in"
        }`}
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        {children(requestClose)}
      </div>
    </div>,
    document.body
  );
}
