"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const COOKIE = "last-path";
// Screens worth coming back to (not sign-in, invites or admin pages).
const KEEP = /^\/(boards|calendar|feed|friends|insights|journal|matrix|plan|power-ups|rewards|settings|summit)(\/|$|\?)/;

/**
 * Remembers the screen you were on, so signing in carries on where you left
 * off (the sign-in reads the cookie). Opening the app fresh still lands on
 * Today, so the welcome screen keeps its morning moment.
 */
export function LastScreen() {
  const path = usePathname();
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
