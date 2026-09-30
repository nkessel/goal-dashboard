"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

type StartViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => Promise<void> | void) => { finished: Promise<void> };
};

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
  const pendingResolveRef = useRef<(() => void) | null>(null);
  const currentPathnameRef = useRef(pathname);
  const previousPathnameRef = useRef<string | null>(null);

  // Fires after every commit where the pathname changed — including the one
  // caused by our own router.push() below — releasing whatever transition is
  // waiting on it, and shifting the current pathname into "previous" so
  // getPreviousPathname() always reflects one step back from wherever the
  // user is now. Tracks every route change regardless of how it was
  // triggered (ViewTransitionLink, a plain next/link Link, BottomNav), since
  // they all funnel through Next's router and update usePathname() here.
  useEffect(() => {
    if (currentPathnameRef.current !== pathname) {
      previousPathnameRef.current = currentPathnameRef.current;
      currentPathnameRef.current = pathname;
    }
    pendingResolveRef.current?.();
    pendingResolveRef.current = null;
  }, [pathname]);

  function navigate(href: string) {
    const doc = document as StartViewTransitionDoc;
    if (typeof doc.startViewTransition !== "function") {
      router.push(href);
      return null;
    }

    return doc.startViewTransition(() => {
      return new Promise<void>((resolve) => {
        // A prior transition that never saw its pathname change (e.g. two
        // rapid taps) shouldn't hang around forever holding a stale frame.
        pendingResolveRef.current?.();
        pendingResolveRef.current = resolve;
        router.push(href);
        // Safety net: if the pathname somehow never changes (navigation
        // error, same-URL edge case), don't freeze the UI indefinitely.
        setTimeout(() => {
          if (pendingResolveRef.current === resolve) {
            pendingResolveRef.current = null;
            resolve();
          }
        }, 1500);
      });
    });
  }

  function getPreviousPathname() {
    return previousPathnameRef.current;
  }

  return (
    <ViewTransitionContext.Provider value={{ navigate, getPreviousPathname }}>
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
