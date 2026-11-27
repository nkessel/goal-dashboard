"use client";

import { useEffect, useState } from "react";
import { XP_GAINED, type XpGained } from "@/lib/xp-live";

/**
 * An XP figure drawn by the server that moves at once when XP is awarded on this screen (see `xpGained`).
 * When the server's figure changes (its refresh caught up), that figure is shown as it is.
 */
export function LiveXp({ base, kind, format = false }: { base: number; kind: keyof XpGained; format?: boolean }) {
  const [delta, setDelta] = useState(0);
  const [seen, setSeen] = useState(base);
  if (seen !== base) {
    setSeen(base);
    setDelta(0);
  }
  useEffect(() => {
    const on = (e: Event) => setDelta((d) => d + ((e as CustomEvent<XpGained>).detail?.[kind] ?? 0));
    window.addEventListener(XP_GAINED, on);
    return () => window.removeEventListener(XP_GAINED, on);
  }, [kind]);
  const n = Math.max(0, base + delta);
  return <>{format ? n.toLocaleString("en-US") : n}</>;
}
