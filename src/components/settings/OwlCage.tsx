"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { cleanToucan } from "@/lib/toucan";

const subscribe = (cb: () => void) => {
  window.addEventListener("owl-caged", cb);
  window.addEventListener("owl-free", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("owl-caged", cb);
    window.removeEventListener("owl-free", cb);
    window.removeEventListener("storage", cb);
  };
};
const read = () => {
  try {
    return window.localStorage.getItem("owl-caged") === "1";
  } catch {
    return false;
  }
};
// Which bird it is right now: the little owl, or the Great Toucan Spirit (held to change).
const readSpirit = () => {
  try {
    return window.localStorage.getItem("owl-spirit") === "1";
  } catch {
    return false;
  }
};

/**
 * When the bird has been dropped onto the menu button, it waits here in a
 * gilded cage. Tap the cage to set it free: the door swings open in a burst
 * of golden light and it flies out, back to its perch.
 */
export function OwlCage({ toucan = null, compact = false }: { toucan?: unknown; compact?: boolean }) {
  const caged = useSyncExternalStore(subscribe, read, () => false);
  const spirit = useSyncExternalStore(subscribe, readSpirit, () => false);
  const [freeing, setFreeing] = useState(false);
  const cageRef = useRef<HTMLButtonElement>(null);
  if (!caged && !freeing) return null;

  function setFree() {
    if (freeing) return;
    setFreeing(true);
    const r = cageRef.current?.getBoundingClientRect();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("owl-free", { detail: r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.7 } : undefined }));
    }, 1500);
    setTimeout(() => setFreeing(false), 2600);
  }

  return (
    <div
      className={compact ? "parchment flex min-w-0 flex-1 basis-0 cursor-pointer items-center gap-2 rounded-[14px] px-2.5 py-1.5" : "flex items-center gap-3 rounded-2xl px-3 py-2.5"}
      style={compact ? undefined : { background: "rgba(20,14,30,.06)", border: "1px dashed rgba(139,112,64,.5)" }}
      onClick={compact ? setFree : undefined}
    >
      <button ref={cageRef} type="button" onClick={compact ? undefined : setFree} aria-label="Open the cage and set the bird free" title="Open the cage" className={`owl-cage relative shrink-0 h-20 w-16 ${freeing ? "is-opening" : ""}`} style={compact ? { zoom: 0.625 } as React.CSSProperties : undefined}>
        {!freeing && spirit && (
          // The toucan, in whatever it's wearing, sits behind the bars.
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[36px] flex justify-center">
            <span className="cage-bird block">
              <ToucanArt equipped={cleanToucan(toucan).equipped} size={30} />
            </span>
          </span>
        )}
        <svg viewBox="0 0 64 80" width="64" height="80" aria-hidden className="relative" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="cage-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff1b8" />
              <stop offset=".5" stopColor="#d9b45f" />
              <stop offset="1" stopColor="#8a6116" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="6" r="4" fill="none" stroke="url(#cage-gold)" strokeWidth="2" />
          <path d="M8 30Q8 10 32 10T56 30" fill="none" stroke="url(#cage-gold)" strokeWidth="2.6" />
          {[14, 22, 32, 42, 50].map((x) => (
            <path key={x} d={`M${x} ${x === 32 ? 10 : 14 + Math.abs(32 - x) * 0.4}V72`} stroke="url(#cage-gold)" strokeWidth="1.6" />
          ))}
          <path d="M8 30V72M56 30V72" stroke="url(#cage-gold)" strokeWidth="2.4" />
          <rect x="4" y="70" width="56" height="6" rx="2" fill="url(#cage-gold)" />
          {/* the little prisoner */}
          {!freeing && !spirit && (
            <g className="cage-bird">
              <ellipse cx="32" cy="52" rx="9" ry="11" fill="#f2efe6" />
              <circle cx="29" cy="48" r="1.6" fill="#2a1608" />
              <circle cx="35" cy="48" r="1.6" fill="#2a1608" />
              <path d="M32 50l-1.6 2.6h3.2z" fill="#3b3226" />
              <path d="M20 62h24" stroke="#8a6116" strokeWidth="2" />
            </g>
          )}
          {/* the door */}
          <g className="cage-door">
            <rect x="22" y="40" width="20" height="24" rx="2" fill="rgba(255,241,184,.08)" stroke="url(#cage-gold)" strokeWidth="1.8" />
            <circle cx="40" cy="52" r="1.6" fill="url(#cage-gold)" />
          </g>
        </svg>
      </button>
      {compact ? (
        <span className="min-w-0 text-[13px] leading-snug" style={{ color: "var(--t-ink)" }}>
          <span className="block font-semibold">Your toucan</span>
          Tap the cage to set him free
        </span>
      ) : (
        <span className="text-[14px] leading-snug" style={{ color: "var(--t-ink)" }}>
          Your toucan is in his cage.
          <br />
          <span className="font-semibold">Tap the cage to set it free.</span>
        </span>
      )}
      {freeing &&
        createPortal(
          <div className="cage-glory pointer-events-none fixed inset-0 z-[70]" aria-hidden>
            {(() => {
              const r = cageRef.current?.getBoundingClientRect();
              const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
              const y = r ? r.top + r.height / 2 : window.innerHeight / 2;
              return (
                <>
                  <div className="cage-burst" style={{ left: x, top: y }} />
                  <svg className="cage-rays" style={{ left: x, top: y }} width="900" height="900" viewBox="-450 -450 900 900">
                    {Array.from({ length: 18 }, (_, i) => (
                      <path key={i} d="M0 0L-14 -440L14 -440Z" fill="#ffe9a3" opacity=".35" transform={`rotate(${i * 20})`} />
                    ))}
                  </svg>
                  {Array.from({ length: 26 }, (_, i) => (
                    <span key={i} className="cage-spark" style={{ left: x, top: y, "--dx": `${Math.cos(i * 0.73) * (90 + (i % 5) * 40)}px`, "--dy": `${Math.sin(i * 0.73) * (90 + (i % 5) * 40) - 60}px`, animationDelay: `${(i % 6) * 60}ms` } as React.CSSProperties} />
                  ))}
                  <svg className="cage-flyer" style={{ left: x, top: y }} width="56" height="40" viewBox="0 0 56 40">
                    <path className="cage-wing-l" d="M28 20C20 8 8 4 0 8c6 2 12 6 16 12z" fill="#f6f3ea" />
                    <path className="cage-wing-r" d="M28 20C36 8 48 4 56 8c-6 2-12 6-16 12z" fill="#f6f3ea" />
                    <ellipse cx="28" cy="22" rx="7" ry="10" fill="#fffdf6" />
                    <circle cx="26" cy="18" r="1.3" fill="#2a1608" />
                    <circle cx="30" cy="18" r="1.3" fill="#2a1608" />
                  </svg>
                  <p className="cage-words font-display" style={{ left: x, top: y + 70 }}>
                    Free!
                  </p>
                </>
              );
            })()}
          </div>,
          document.body
        )}
    </div>
  );
}
