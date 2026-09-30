"use client";

import { createContext, useContext, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

type ViewTransitionContextValue = {
  /**
   * Navigate via the View Transitions API when available, properly
   * synchronized with the actual route change (see below), falling back to
   * a plain router.push everywhere else. Returns the transition object (so
   * callers like BottomNav can react to `.finished`) or null when the API
   * isn't available / nothing to animate.
   */
  navigate: (href: string) => { finished: Promise<void> } | null;
  /**
   * The pathname the user was on immediately before the current one, or
   * null if this is the first page of the session (no in-app navigation has
   * happened yet). Used by things like the Settings "close" button to
   * return wherever the user actually came from rather than a fixed
   * destination. A getter (not reactive state) — it's only read at the
   * moment of an action, never rendered, so it doesn't need to trigger
   * re-renders as it changes.
   */
  getPreviousPathname: () => string | null;
  /** Last pathname visited outside /settings. */
  getLastAppPathname: () => string | null;
};

const ViewTransitionContext = createContext<ViewTransitionContextValue | null>(null);

/**
 * Root-level provider fixing a bug in the previous per-component
 * implementation: `document.startViewTransition(() => router.push(href))`
 * treats the callback as complete the instant it returns, which is *before*
 * Next.js has actually fetched/rendered the new route (router.push() doesn't
 * wait for that). The View Transitions API then captures its "new state"
 * snapshot from the still-old DOM — so the animation plays out old-screen to
 * old-screen (looks like nothing happened, or a tiny blip), and the *real*
 * content swap happens a beat later, outside the transition, which reads as
 * a jump/flash.
 *
 * Fix: return a Promise from the callback that only resolves once the route
 * has actually changed — i.e. once usePathname() here reflects the new URL.
 * The View Transitions API holds the "old" screenshot on screen the whole
 * time that promise is pending (it's designed for exactly this), so the
 * eventual resolve() lines up the "before" and "after" snapshots correctly
 * and the crossfade/slide plays against real content.
 */
export function ViewTransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const currentPathnameRef = useRef(pathname);
  const previousPathnameRef = useRef<string | null>(null);
  // Last screen outside Settings, so closing Settings from any depth
  // (Settings → Avatar → …) returns to the app instead of bouncing between
  // the settings pages.
  const lastAppPathnameRef = useRef<string | null>(pathname.startsWith("/settings") ? null : pathname);
  const pendingRef = useRef<{ direction: string; resolve: () => void } | null>(null);

  // Screen-change animation, played on the NEW screen once it has actually
  // rendered. The earlier View Transitions version snapshotted the "new"
  // state after a fixed timeout, so on a slow server response it animated
  // old-screen-to-old-screen and then jumped. Now the old screen simply
  // stays (dimmed) while the next one loads, and the next one slides in the
  // moment it commits — no matter how long the fetch took.
  useEffect(() => {
    if (currentPathnameRef.current === pathname) return;
    previousPathnameRef.current = currentPathnameRef.current;
    currentPathnameRef.current = pathname;
    if (!pathname.startsWith("/settings")) lastAppPathnameRef.current = pathname;
    const html = document.documentElement;
    const pending = pendingRef.current;
    pendingRef.current = null;
    html.removeAttribute("data-nav-pending");
    html.setAttribute("data-enter", pending?.direction ?? "fade");
    const t = setTimeout(() => {
      html.removeAttribute("data-enter");
      pending?.resolve();
    }, 460);
    return () => clearTimeout(t);
  }, [pathname]);

  function navigate(href: string) {
    const html = document.documentElement;
    const direction = html.getAttribute("data-transition") ?? "fade";
    html.removeAttribute("data-transition");
    pendingRef.current?.resolve();
    let resolve!: () => void;
    const finished = new Promise<void>((r) => (resolve = r));
    pendingRef.current = { direction, resolve };
    html.setAttribute("data-nav-pending", direction);
    // Leaving Settings: let it roll up out of view first, then swap screens.
    const rollUp = direction === "nav-up" || direction === "settings-close";
    const go = () => startTransition(() => router.push(href));
    if (rollUp) setTimeout(go, 260);
    else go();
    // Safety net: never leave the old screen dimmed if the route errors out.
    setTimeout(() => {
      if (pendingRef.current?.resolve === resolve) {
        pendingRef.current = null;
        html.removeAttribute("data-nav-pending");
        resolve();
      }
    }, 10000);
    return { finished };
  }

  function getPreviousPathname() {
    return previousPathnameRef.current;
  }
  function getLastAppPathname() {
    return lastAppPathnameRef.current;
  }

  return (
    <ViewTransitionContext.Provider value={{ navigate, getPreviousPathname, getLastAppPathname }}>
      {/* Thin top progress bar while the next screen loads (see globals.css). */}
      <div className="nav-progress" aria-hidden />
      {children}
    </ViewTransitionContext.Provider>
  );
}

export function useViewTransitionNavigate() {
  const ctx = useContext(ViewTransitionContext);
  if (!ctx) {
    throw new Error("useViewTransitionNavigate must be used within a ViewTransitionProvider");
  }
  return ctx.navigate;
}

export function useViewTransitionHistory() {
  const ctx = useContext(ViewTransitionContext);
  if (!ctx) {
    throw new Error("useViewTransitionHistory must be used within a ViewTransitionProvider");
  }
  return ctx.getPreviousPathname;
}

export function useLastAppPathname() {
  const ctx = useContext(ViewTransitionContext);
  if (!ctx) throw new Error("useLastAppPathname must be used within a ViewTransitionProvider");
  return ctx.getLastAppPathname;
}
