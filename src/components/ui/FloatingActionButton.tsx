"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { readFabStyle, subscribeFx } from "@/lib/celebration-fx";

/**
 * The round floating "+" action button from the Claude Design mockups
 * (Goals/Quest Board, Matrix, Calendar) — pinned above the bottom nav,
 * centered in the mobile-width column, rather than an inline dashed
 * "+ New …" row. Each page that wants one renders this only while its
 * add-form is collapsed, and swaps to the inline form in place when open.
 */
export function FloatingActionButton({
  onClick,
  label,
  theme = "calm",
  expanded = false,
  raised = false,
}: {
  onClick: () => void;
  label: string;
  theme?: "calm" | "adventure";
  /** True to rotate the "+" into an "×" — for a FAB that toggles a small
   * speed-dial menu open (see BoardFabMenu) rather than a form directly. */
  expanded?: boolean;
  /** Above a board popup (z 47) rather than under it. */
  raised?: boolean;
}) {
  const isAdventure = theme === "adventure";
  const look = useSyncExternalStore(subscribeFx, readFabStyle, () => "seal" as const);
  const coin = isAdventure && look === "coin";
  const plain = isAdventure && look === "plain";
  const seal = isAdventure && look === "seal";
  const wrapRef = useRef<HTMLDivElement>(null);

  // Pinch-zoom: keep the button at the same spot and size on screen instead
  // of letting it drift with the zoomed page.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = wrapRef.current;
    if (!vv || !el) return;
    const place = () => {
      const s = vv.scale;
      if (s <= 1.02) {
        el.style.left = "var(--fab-x, 50%)";
        el.style.top = "";
        el.style.bottom = "";
        el.style.transform = "translateX(-50%)";
        el.style.transformOrigin = "";
        return;
      }
      const fabX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fab-x")) || window.innerWidth / 2;
      el.style.left = `${vv.offsetLeft + fabX / s}px`;
      el.style.top = `${vv.offsetTop + vv.height - (80 + 56) / s}px`;
      el.style.bottom = "auto";
      el.style.transformOrigin = "top left";
      el.style.transform = `scale(${1 / s}) translateX(-50%)`;
    };
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => {
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      data-hide-when-typing
      className={`pointer-events-none fixed bottom-20 flex justify-center ${expanded ? "z-[49]" : raised ? "z-[48]" : "z-[46]"}`}
      // Same fixed-chrome-in-a-remounted-shell issue as BottomNav (see the
      // comment there) — without its own view-transition-name the FAB gets
      // dragged along with the page-level slide/fade on every navigation.
      style={{ viewTransitionName: "app-fab", left: "var(--fab-x, 50%)", transform: "translateX(-50%)" }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        // An enamelled seal in a gilded, notched bezel: the gold plus is the one bright thing.
        className="fab-ring hover-glow fab-rise pointer-events-auto relative flex h-14 w-14 touch-manipulation select-none items-center justify-center rounded-full p-[4px] transition-transform duration-100 hover:scale-105 active:scale-95"
        style={
          seal
            ? {
                background: "conic-gradient(from 200deg, #fff1c2, #c9a24e 12%, #7a5c22 26%, #e2bf68 40%, #fff6d6 50%, #a8812e 64%, #f4dc94 78%, #8a6c2c 90%, #fff1c2)",
                boxShadow: "0 0 0 1.5px #2e2410, 0 0 22px rgba(242,210,126,.35), 0 8px 16px rgba(0,0,0,.55)",
              }
            : coin
              ? { background: "linear-gradient(155deg, #fff1c2 0%, #e2bf68 30%, #8a6c2c 62%, #c9a24e 82%, #f4dc94 100%)", boxShadow: "0 0 0 1.5px #2e2410, 0 0 18px rgba(217,180,95,.28), 0 6px 14px rgba(0,0,0,.5)" }
              : plain
                ? { background: "#eedcb8", boxShadow: "0 0 0 1.5px #8a6c2c, 0 6px 14px rgba(0,0,0,.45)" }
                : { background: "var(--t-card)", boxShadow: "0 0 0 1px var(--t-card-border), 0 6px 16px rgba(0,0,0,.22)" }
        }
      >
        {seal && (
          // The bezel's fine notches.
          <svg aria-hidden className="pointer-events-none absolute inset-0" viewBox="0 0 56 56">
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i / 24) * Math.PI * 2;
              const r1 = 25.6;
              const r2 = i % 6 === 0 ? 23.2 : 24.4;
              return <line key={i} x1={(28 + Math.cos(a) * r1).toFixed(2)} y1={(28 + Math.sin(a) * r1).toFixed(2)} x2={(28 + Math.cos(a) * r2).toFixed(2)} y2={(28 + Math.sin(a) * r2).toFixed(2)} stroke="rgba(58,40,10,.55)" strokeWidth={i % 6 === 0 ? 1.2 : 0.7} strokeLinecap="round" />;
            })}
          </svg>
        )}
        <span
          className="relative flex h-full w-full items-center justify-center rounded-full"
          style={
            seal
              ? {
                  background: "radial-gradient(circle at 36% 30%, #5a4020 0%, #2e1f0e 52%, #180f06 100%)",
                  boxShadow: "0 0 0 1px rgba(255,236,180,.35), inset 0 2px 3px rgba(255,230,170,.18), inset 0 -5px 9px rgba(0,0,0,.55)",
                }
              : coin
                ? { background: "radial-gradient(circle at 34% 28%, #fbe7a6, #e0b75a 48%, #a9802c 100%)", boxShadow: "0 0 0 1px rgba(58,42,14,.6), inset 0 1.5px 0 rgba(255,250,225,.65), inset 0 -4px 7px rgba(90,60,12,.35)" }
                : plain
                  ? { background: "linear-gradient(180deg, #f6ecd2, #e6d3a6)" }
                  : { background: "var(--t-accent)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.25)" }
          }
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            style={{ transform: expanded ? "rotate(45deg)" : undefined, transition: "transform 150ms", filter: seal ? "drop-shadow(0 0 4px rgba(242,210,126,.65))" : coin ? "drop-shadow(0 1px 0 rgba(255,245,210,.6))" : undefined }}
          >
            {seal ? (
              <>
                <defs>
                  <linearGradient id="fab-plus" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#fff6d6" />
                    <stop offset=".5" stopColor="#f2d27e" />
                    <stop offset="1" stopColor="#c9a24e" />
                  </linearGradient>
                </defs>
                <path d="M12 4.5v15M4.5 12h15" stroke="url(#fab-plus)" strokeWidth="2.8" strokeLinecap="round" />
                <path d="M12 2.6l.9 1.4-.9 1.4-.9-1.4zM12 18.6l.9 1.4-.9 1.4-.9-1.4zM2.6 12l1.4-.9 1.4.9-1.4.9zM18.6 12l1.4-.9 1.4.9-1.4.9z" fill="#f6dc8e" />
              </>
            ) : (
              <path d="M12 5v14M5 12h14" stroke={isAdventure ? "#2a1c10" : "#fff"} strokeWidth="2.6" strokeLinecap="round" />
            )}
          </svg>
        </span>
      </button>
    </div>
  );
}
