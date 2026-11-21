"use client";

import { useSyncExternalStore } from "react";

/**
 * The zone dates are drawn in before the page has taken over on the device: the owner's, not the
 * server's (UTC on Vercel), so the server's picture and the browser's first one match (React #418
 * hydration errors otherwise, Nov 21). Same rule as TaskRow's due words.
 */
export const FIRST_ZONE = "America/New_York";

const noopSubscribe = () => () => {};

/** `FIRST_ZONE` on the server and while hydrating; `undefined` (the device's own zone) after. */
export function useDrawZone(): string | undefined {
  return useSyncExternalStore(
    noopSubscribe,
    () => undefined,
    () => FIRST_ZONE,
  );
}
