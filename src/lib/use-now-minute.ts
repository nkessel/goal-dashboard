import { useSyncExternalStore } from "react";

/** The current minute, ticking once a minute (0 on the server, so nothing time-dependent renders there). */
export function useNowMinute() {
  return useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, 30_000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 60_000),
    () => 0
  );
}
