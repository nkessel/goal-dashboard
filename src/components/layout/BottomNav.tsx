"use client";

import { PerchedOwl } from "./PerchedOwl";
import { ToucanGuide } from "@/components/toucan/ToucanGuide";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useViewTransitionNavigate } from "@/components/ui/ViewTransitionProvider";

type Theme = "calm" | "adventure";

/**
 * Simple line icons for Calm (per HANDOFF.md "Theme switching" §3 — Calm
 * keeps hand-drawn SVGs, only Adventure swaps to the painted ui-*.png set).
 */
function calmIcon(name: string, color: string) {
  switch (name) {
    case "calendar":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.6" />
          <path d="M3 9h18M8 3v4M16 3v4" stroke={color} strokeWidth="1.6" />
        </svg>
      );
    case "grid":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="4" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.6" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.6" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.6" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.6" />
        </svg>
      );
    case "now":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.5" fill={color} />
        </svg>
      );
    case "insights":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "target":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1.6" />
          <circle cx="12" cy="12" r="4.8" stroke={color} strokeWidth="1.6" />
          <circle cx="12" cy="12" r="1.6" fill={color} />
        </svg>
      );
    default:
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="9" r="3" stroke={color} strokeWidth="1.6" />
          <circle cx="17" cy="10" r="2.3" stroke={color} strokeWidth="1.6" />
          <path d="M4 19c.5-3 2.5-5 5-5s4.5 2 5 5" stroke={color} strokeWidth="1.6" fill="none" />
          <path d="M14.5 19c.3-2.2 1.8-3.8 3.5-3.8" stroke={color} strokeWidth="1.6" fill="none" />
        </svg>
      );
  }
}

const ITEMS: {
  href: string;
  key: "calendar" | "grid" | "now" | "insights" | "party";
  /** Other paths that belong to this tab. */
  also?: string[];
  /** Deliberate divergence from mockup.png, per HANDOFF.md §5: Goals/Boards
   * uses ui-grid (four squares), Priority uses ui-target (bullseye) — the
   * opposite of the original painted reference. Keep it this way. */
  adventureIcon: string;
  adventureLabel: string;
  calmLabel: string;
}[] = [
  { href: "/calendar", key: "calendar", adventureIcon: "ui-scroll.png", adventureLabel: "Calendar", calmLabel: "Calendar" },
  { href: "/boards", key: "grid", adventureIcon: "ui-grid.png", adventureLabel: "All Quests", calmLabel: "Quests", also: ["/matrix"] },
  { href: "/", key: "now", adventureIcon: "ui-compass.png", adventureLabel: "Today's Quest", calmLabel: "Now" },
  { href: "/insights", key: "insights", adventureIcon: "ui-insights.svg", adventureLabel: "Insights", calmLabel: "Insights" },
  { href: "/feed", key: "party", adventureIcon: "ui-party-simple.svg", adventureLabel: "Party", calmLabel: "Friends" },
];

/** Index of the nav item a pathname belongs to, or -1 if it's not one of
 * the main tabs (a detail page, settings, etc). */
function navIndex(pathname: string) {
  return ITEMS.findIndex((item) => onTab(item, pathname));
}

function onTab(item: { href: string; also?: string[] }, pathname: string) {
  if (item.href === "/") return pathname === "/";
  return [item.href, ...(item.also ?? [])].some((h) => pathname.startsWith(h));
}

export function BottomNav({ theme, name = null, toucan = null }: { theme: Theme; name?: string | null; toucan?: unknown }) {
  const pathname = usePathname();
  const navigateWithTransition = useViewTransitionNavigate();
  const isAdventure = theme === "adventure";

  const rowRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [highlight, setHighlight] = useState<{ left: number; width: number } | null>(null);
  // Tapped tab, shown as active right away while its screen is still loading.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setPendingHref(null);
  }
  const activePath = pendingHref ?? pathname;

  // Measure the active item's position within the row and slide the
  // highlight box there — kept in sync with `pathname` so it moves at the
  // same moment the screen-level view transition kicks off (see navigate()
  // below), not just when this component happens to re-render.
  useLayoutEffect(() => {
    const activeIndex = navIndex(activePath);
    const row = rowRef.current;
    const el = itemRefs.current[activeIndex];
    if (!row || !el) {
      setHighlight(null);
      return;
    }
    const measure = () => {
      const rowRect = row.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setHighlight({ left: elRect.left - rowRect.left, width: elRect.width });
    };
    measure();
    // Icon size (and therefore item width) changes slightly between
    // active/inactive in Adventure mode, and the row can reflow on resize —
    // recheck on both so the box never drifts out of alignment.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activePath, isAdventure]);

  // The + button sits right above the Today's Quest tab: publish that tab's
  // centre as --fab-x so the button can line up with it at any width.
  useLayoutEffect(() => {
    const center = itemRefs.current[2];
    if (!center) return;
    const place = () => {
      const r = center.getBoundingClientRect();
      document.documentElement.style.setProperty("--fab-x", `${r.left + r.width / 2}px`);
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(center);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [isAdventure]);

  // Whole screen slides in from the right when moving to a tab further
  // right in the nav order, or from the left when moving to one further
  // left — a low-key sense of spatial direction, layered on the browser's
  // native View Transitions API (progressively enhanced; a plain navigation
  // everywhere else). Scoped with the `data-transition` attribute so it
  // doesn't fight the existing board-detail expand/fade transition, which
  // also animates ::view-transition-old/new(root). Actual promise timing
  // (so the transition animates real content instead of a stale frame) is
  // handled centrally by ViewTransitionProvider.
  function navigate(e: MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let opens-in-new-tab work normally
    if (href === pathname) {
      // Already there — swallow the tap instead of letting Link perform a
      // real (if same-URL) navigation, which was refetching/flashing the
      // page for no visible benefit and looked like a stray "blip" on
      // repeated taps of the current tab.
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const fromIndex = navIndex(pathname);
    const toIndex = navIndex(href);
    const direction = pathname.startsWith("/settings")
      ? "nav-up"
      : fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex
        ? "nav-back"
        : "nav-forward";
    document.documentElement.setAttribute("data-transition", direction);
    setPendingHref(href);
    navigateWithTransition(href);
  }

  return (
    <nav
      data-hide-when-typing
      data-app-nav
      className="fixed inset-x-0 bottom-0 z-30 flex w-full items-stretch justify-between"
      style={{
        // Full-width bar anchored to the bottom (HANDOFF.md §4) — not a
        // floating pill. Adventure gets the nav-strip.jpg texture tiled
        // horizontally, with a flat colour fallback while it loads/if it
        // fails; Calm keeps the plain card surface.
        background: isAdventure
          ? `#262c23 url("/design/nav-strip.jpg")`
          : "var(--t-card)",
        backgroundSize: isAdventure ? "auto 100%" : undefined,
        backgroundRepeat: isAdventure ? "repeat-x" : undefined,
        borderTop: isAdventure ? "2px solid #5e5233" : "1px solid var(--t-card-border)",
        boxShadow: isAdventure ? "0 -1px 0 rgba(217,180,95,.25), 0 -8px 20px rgba(0,0,0,.35)" : undefined,
        paddingBottom: "max(10px, env(safe-area-inset-bottom))",
        paddingTop: isAdventure ? 9 : 8,
        // AppShell (and therefore this nav) is re-mounted fresh on every
        // route change rather than living in a persistent layout, so
        // without its own name it gets flattened into the page-wide
        // ::view-transition-old/new(root) snapshot pair and visibly
        // slides/fades along with the page content on every tap — which is
        // what reads as "the navbar is buggy". Giving it a stable name
        // pulls it out of that group; see globals.css for the matching
        // rule that keeps it fully static instead of the UA's default
        // crossfade.
        viewTransitionName: "app-bottom-nav",
      }}
    >
      <div ref={rowRef} className="relative mx-auto flex w-full max-w-md items-stretch justify-between px-1 sm:max-w-lg md:max-w-xl">
        {isAdventure && <PerchedOwl name={name} toucan={toucan} />}
        {isAdventure && <ToucanGuide />}
        {highlight && (
          <div
            aria-hidden
            data-nav-highlight
            className="pointer-events-none absolute transition-[left,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{
              left: highlight.left,
              width: highlight.width,
              top: isAdventure ? 1 : 6,
              bottom: isAdventure ? 1 : 6,
              borderRadius: isAdventure ? 14 : 999,
              zIndex: 0,
              ...(isAdventure
                ? {
                    border: "2px solid var(--t-gold)",
                    background: "linear-gradient(180deg, #7a612d 0%, #4c3d1c 45%, #2c2a19 100%)",
                    boxShadow:
                      "inset 0 0 0 1px rgba(255,235,180,.18), inset 0 1px 0 rgba(255,235,180,.3), inset 0 -8px 14px rgba(0,0,0,.4), 0 0 14px rgba(217,180,95,.3), 0 3px 8px rgba(0,0,0,.5)",
                  }
                : { background: "var(--t-accent-soft)" }),
            }}
          />
        )}
        {ITEMS.map((item, i) => {
          const active = onTab(item, activePath);
          const label = isAdventure ? item.adventureLabel : item.calmLabel;

          return (
            <div key={item.href} className="relative flex min-w-0 flex-auto items-stretch" style={{ zIndex: 1 }}>
              {i > 0 && (
                <div
                  aria-hidden
                  className="self-stretch"
                  style={{
                    width: 1,
                    margin: "7px 0",
                    background: isAdventure ? "rgba(214,200,150,.1)" : "var(--t-card-border)",
                  }}
                />
              )}
              <Link
                href={item.href}
                prefetch={true}
                onClick={(e) => navigate(e, item.href)}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-end ${isAdventure ? "gap-1 px-2 pb-1.5 pt-2" : "gap-1 px-1.5 py-1.5"} transition-transform duration-150 hover:scale-105 active:scale-95`}
              >
                {isAdventure ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- static asset from /public, decorative-only nav glyph */}
                    <img
                      src={`/design/${item.adventureIcon}`}
                      alt=""
                      width={38}
                      height={38}
                      style={{
                        display: "block",
                        width: 38,
                        height: 38,
                        objectFit: "contain",
                        filter: active
                          ? "drop-shadow(0 0 6px rgba(242,210,126,.55)) drop-shadow(0 2px 2px rgba(0,0,0,.5))"
                          : "drop-shadow(0 2px 2px rgba(0,0,0,.5)) saturate(.85)",
                        opacity: active ? 1 : 0.88,
                      }}
                    />
                    <span
                      className="max-w-full truncate whitespace-nowrap leading-tight"
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: "clamp(12px, 3.4vw, 16px)",
                        fontWeight: active ? 600 : 500,
                        letterSpacing: ".01em",
                        color: active ? "#f6e7c1" : "var(--t-nav-inactive)",
                        textShadow: "0 1px 2px rgba(0,0,0,.6)",
                      }}
                    >
                      {label}
                    </span>
                  </>
                ) : active ? (
                  <>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full">
                      {calmIcon(item.key, "var(--t-accent)")}
                    </div>
                    <span style={{ fontSize: 9, color: "var(--t-accent)", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {label}
                    </span>
                  </>
                ) : (
                  <>
                    {calmIcon(item.key, "var(--t-ink-soft)")}
                    <span style={{ fontSize: 9, color: "var(--t-ink-soft)", whiteSpace: "nowrap" }}>{label}</span>
                  </>
                )}
              </Link>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
