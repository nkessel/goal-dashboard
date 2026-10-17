"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const KEY = "evening-low-light";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const read = () => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Evening's "low light": a switch at the top of the evening side that dims
 * the whole screen and softens its contrast, so bright parchment doesn't
 * glare at night. Remembered on this device.
 */
export function LowLightToggle() {
  const on = useSyncExternalStore(subscribe, read, () => false);
  function set(v: boolean) {
    try {
      window.localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new StorageEvent("storage"));
  }
  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => set(!on)}
          className="flex h-9 items-center gap-2 rounded-full pl-3 pr-1.5 text-[13.5px] font-semibold"
          style={{ background: "rgba(8,10,30,.55)", border: "1px solid rgba(217,180,95,.35)", color: "#e9dcb8" }}
          title={on ? "Back to full brightness" : "Dim the screen for night"}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill={on ? "#f2d27e" : "none"} stroke="#f2d27e" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          Low light
          <span className="relative h-5 w-9 rounded-full transition-colors" style={{ background: on ? "#a88a3f" : "rgba(255,255,255,.18)" }}>
            <span className="absolute top-0.5 h-4 w-4 rounded-full transition-[left]" style={{ left: on ? 18 : 2, background: on ? "#f6dc8e" : "#cfc6ae" }} />
          </span>
        </button>
      </div>
      {on &&
        createPortal(
          // A warm dimming veil over everything: it darkens the bright parchment
          // most, which is what lowers the contrast. Taps pass straight through.
          <div aria-hidden className="fade-in pointer-events-none fixed inset-0 z-[9999]" style={{ background: "rgb(128,112,96)", mixBlendMode: "multiply" }} />,
          document.body
        )}
    </>
  );
}
