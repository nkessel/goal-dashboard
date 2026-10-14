"use client";

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
}: {
  onClick: () => void;
  label: string;
  theme?: "calm" | "adventure";
  /** True to rotate the "+" into an "×" — for a FAB that toggles a small
   * speed-dial menu open (see BoardFabMenu) rather than a form directly. */
  expanded?: boolean;
}) {
  const isAdventure = theme === "adventure";

  return (
    <div
      className={`pointer-events-none fixed bottom-20 flex justify-center ${expanded ? "z-[49]" : "z-[46]"}`}
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
        className="hover-glow fab-rise pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
        style={{
          background: isAdventure
            ? "radial-gradient(circle at 32% 28%, #f2c96a, var(--t-gold) 55%, var(--t-gold-deep))"
            : "var(--t-accent)",
          border: `3px solid ${isAdventure ? "var(--t-bg-1)" : "var(--t-bg)"}`,
          boxShadow: isAdventure
            ? "inset 0 1px 0 rgba(255,255,255,.5), inset 0 -3px 5px rgba(0,0,0,.25), 0 6px 14px rgba(0,0,0,.45)"
            : "0 6px 16px rgba(0,0,0,.28)",
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          style={{ transform: expanded ? "rotate(45deg)" : undefined, transition: "transform 150ms" }}
        >
          <path
            d="M12 5v14M5 12h14"
            stroke={isAdventure ? "#2a1c10" : "#fff"}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
