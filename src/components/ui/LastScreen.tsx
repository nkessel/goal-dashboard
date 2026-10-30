"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const COOKIE = "last-path";
const SESSION = "app-opened";
// Screens worth coming back to (not sign-in, invites or admin pages).
const KEEP = /^\/(boards|calendar|feed|friends|insights|journal|matrix|plan|power-ups|rewards|settings|summit)(\/|$|\?)/;

/**
 * Remembers the screen you were on, so signing in, or opening the app fresh
 * (from the home screen), carries on where you left off. The cookie lets the
 * sign-in send you back there; within a visit, nothing changes.
 */
export function LastScreen() {
  const path = usePathname();
  const router = useRouter();
  // Opened fresh on Today (the app's start screen): go back to where you were, if that was today.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION)) return;
      window.sessionStorage.setItem(SESSION, "1");
      if (window.location.pathname !== "/" || window.location.search) return;
      const m = document.cookie.match(/(?:^|; )last-path=([^;]*)/);
      const at = Number(document.cookie.match(/(?:^|; )last-path-at=(\d+)/)?.[1] ?? 0);
      const last = m ? decodeURIComponent(m[1]) : "";
      if (last && KEEP.test(last) && Date.now() - at < 12 * 3_600_000) router.replace(last);
    } catch {}
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const full = path + window.location.search;
    // Today counts too, so coming back to it is remembered.
    if (path !== "/" && !KEEP.test(full)) return;
    const age = 60 * 60 * 24 * 30;
    document.cookie = `${COOKIE}=${encodeURIComponent(full.slice(0, 200))}; path=/; max-age=${age}; samesite=lax`;
    document.cookie = `last-path-at=${Date.now()}; path=/; max-age=${age}; samesite=lax`;
  }, [path]);
  return null;
}
