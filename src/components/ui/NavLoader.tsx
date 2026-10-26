"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { useVisualFx, type LoadingLook } from "@/lib/visual-fx";

/**
 * While the next screen loads (after a short beat, so quick loads show
 * nothing), a small flourish in the chosen look: a flying toucan, a turning
 * compass or a writing quill. Shown by CSS from html[data-nav-pending].
 */
export function NavLoader() {
  const fx = useVisualFx();
  if (fx.loadingLook === "bar") return null;
  return (
    <div className="nav-loader" aria-hidden>
      <LoadingArt look={fx.loadingLook} />
    </div>
  );
}

/** The art for one loading look (also the Settings preview). */
export function LoadingArt({ look }: { look: LoadingLook }) {
  if (look === "toucan")
    return (
      <span className="nav-loader-toucan">
        <ToucanArt flying size={58} />
      </span>
    );
  if (look === "compass")
    return (
      <svg className="nav-loader-compass" width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="rgba(42,28,16,.88)" stroke="#d9b45f" strokeWidth="2.5" />
        <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(217,180,95,.45)" strokeWidth="1" strokeDasharray="2 4" />
        <path d="M32 8l5 24-5 24-5-24z" fill="#f2d27e" stroke="#8a6116" strokeWidth=".8" />
        <path d="M8 32l24-5 24 5-24 5z" fill="#c99a2e" stroke="#8a6116" strokeWidth=".8" opacity=".8" />
        <path d="M32 8l5 24h-10z" fill="#b0342a" />
        <circle cx="32" cy="32" r="3" fill="#2a1c10" stroke="#f2d27e" />
      </svg>
    );
  if (look === "quill")
    return (
      <svg className="nav-loader-quill" width="96" height="56" viewBox="0 0 96 56">
        <rect x="2" y="30" width="92" height="22" rx="4" fill="rgba(236,218,180,.95)" stroke="#a88a3f" />
        <path className="nav-loader-ink" d="M10 42c6-5 10 5 16 0s10-6 16 0 10 5 16 0 10-6 16 0 8 4 12 0" fill="none" stroke="#3b2a14" strokeWidth="2" strokeLinecap="round" />
        <g className="nav-loader-pen">
          <path d="M14 40L40 4c4 2 6 6 4 10L18 42z" fill="#f6ecd2" stroke="#6b5631" strokeWidth="1.2" />
          <path d="M14 40l4 2-6 3z" fill="#2a1c10" />
        </g>
      </svg>
    );
  return null;
}

const VISITS = "visit-counts";
const noop = () => () => {};

/**
 * Counts which screens you open, and while nothing is happening, quietly
 * loads your most-visited ones so they open faster. Off in Settings.
 */
export function IdlePreload() {
  const pathname = usePathname();
  const router = useRouter();
  const fx = useVisualFx();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => {
    if (!mounted) return;
    const key = pathname.split("?")[0].replace(/\/[0-9a-f-]{20,}.*$/, "");
    try {
      const counts = JSON.parse(localStorage.getItem(VISITS) ?? "{}") as Record<string, number>;
      counts[key] = (counts[key] ?? 0) + 1;
      localStorage.setItem(VISITS, JSON.stringify(counts));
    } catch {
      /* storage unavailable */
    }
  }, [pathname, mounted]);
  useEffect(() => {
    if (!mounted || !fx.preload) return;
    let idle: number | undefined;
    let timer: number | undefined;
    const run = () => {
      try {
        const counts = JSON.parse(localStorage.getItem(VISITS) ?? "{}") as Record<string, number>;
        const here = pathname.split("?")[0];
        Object.entries(counts)
          .filter(([p]) => p !== here && p.startsWith("/") && !p.startsWith("/api") && !p.startsWith("/dev-preview"))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .forEach(([p]) => router.prefetch(p));
      } catch {
        /* storage unavailable */
      }
    };
    // Wait for a few quiet seconds, then load in the browser's idle time.
    const quiet = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
        if (ric) idle = ric(run);
        else run();
      }, 3000);
    };
    quiet();
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, quiet, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (idle !== undefined && cic) cic(idle);
      events.forEach((e) => window.removeEventListener(e, quiet));
    };
  }, [pathname, fx.preload, mounted, router]);
  return null;
}
