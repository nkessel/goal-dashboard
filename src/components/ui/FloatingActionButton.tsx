"use client";

import { useEffect, useRef } from "react";

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
        // A gilded ring around a gold coin, like the avatar's frame.
        className="fab-ring hover-glow fab-rise pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full p-[3px] transition-transform hover:scale-105 active:scale-95"
        style={
          isAdventure
            ? {
                background: "linear-gradient(155deg, #fff1c2 0%, #e2bf68 30%, #8a6c2c 62%, #c9a24e 82%, #f4dc94 100%)",
                boxShadow: "0 0 0 1.5px #2e2410, 0 0 18px rgba(217,180,95,.28), 0 6px 14px rgba(0,0,0,.5)",
              }
            : { background: "var(--t-card)", boxShadow: "0 0 0 1px var(--t-card-border), 0 6px 16px rgba(0,0,0,.22)" }
        }
      >
        <span
          className="flex h-full w-full items-center justify-center rounded-full"
          style={
            isAdventure
              ? {
                  background: "radial-gradient(circle at 34% 28%, #fbe7a6, #e0b75a 48%, #a9802c 100%)",
                  boxShadow: "0 0 0 1px rgba(58,42,14,.6), inset 0 1.5px 0 rgba(255,250,225,.65), inset 0 -4px 7px rgba(90,60,12,.35)",
                }
              : { background: "var(--t-accent)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.25)" }
          }
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            style={{ transform: expanded ? "rotate(45deg)" : undefined, transition: "transform 150ms", filter: isAdventure ? "drop-shadow(0 1px 0 rgba(255,245,210,.6))" : undefined }}
          >
            <path d="M12 5v14M5 12h14" stroke={isAdventure ? "#2a1c10" : "#fff"} strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </span>
      </button>
    </div>
  );
}
