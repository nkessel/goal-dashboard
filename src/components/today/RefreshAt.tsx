"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes the screen at a moment (a snoozed quest coming back to Today). */
export function RefreshAt({ at }: { at: string }) {
  const router = useRouter();
  useEffect(() => {
    const ms = Date.parse(at) - Date.now();
    if (!Number.isFinite(ms) || ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => router.refresh(), Math.max(0, ms) + 1500);
    return () => clearTimeout(t);
  }, [at, router]);
  return null;
}
