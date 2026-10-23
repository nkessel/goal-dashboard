"use client";

import { useEffect } from "react";
import { appDefaultsAction } from "@/app/actions";

const SEEDED_KEY = "app-defaults-seeded";

/**
 * Settings this device hasn't chosen yet start from the app-wide defaults
 * (set by the app's owner). A setting chosen here is never overwritten.
 * Checked once per visit.
 */
export function SettingsDefaultsSeed() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SEEDED_KEY)) return;
      window.sessionStorage.setItem(SEEDED_KEY, "1");
    } catch {
      return;
    }
    appDefaultsAction()
      .then((defaults) => {
        for (const [key, value] of Object.entries(defaults)) {
          try {
            if (value === null || window.localStorage.getItem(key) !== null) continue;
            window.localStorage.setItem(key, value);
            // Let anything already showing that setting pick it up.
            window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
          } catch {
            /* storage unavailable */
          }
        }
      })
      .catch(() => {});
  }, []);
  return null;
}
