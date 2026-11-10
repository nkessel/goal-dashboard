"use client";

import { useEffect } from "react";
import { getWelcomeLayoutAction, saveWelcomeLayoutAction, type WelcomeLayout } from "@/app/actions";
import { loadFx, patchFx, subscribeFx, type FxSettings } from "@/lib/celebration-fx";

const KEYS = ["welcomeOrder", "welcomeHide", "welcomeArchived", "welcomeDawnOn", "welcomeHabitsOn", "welcomeButtons", "welcomeSleep", "welcomeMetrics", "welcomeLine", "welcomeStreak", "welcomeBar"] as const;
const pick = (fx: FxSettings): WelcomeLayout => {
  const out: WelcomeLayout = {};
  for (const k of KEYS) if (fx[k] !== undefined) out[k] = fx[k];
  return out;
};
const sig = (w: WelcomeLayout) => JSON.stringify(KEYS.map((k) => w[k] ?? null));

/**
 * The welcome screen's layout used to live in one browser only, so a part hidden on the laptop
 * still showed on the phone (owner, Nov 10: "why did 'your dawn' still show after I hid it?").
 * Now the account's copy comes in on load (or this browser's goes up, the first time) and
 * every change is saved there a moment later; the latest change wins.
 */
export function WelcomeLayoutSync() {
  useEffect(() => {
    let live = true;
    let last = "";
    let ready = false;
    let timer: number | undefined;
    getWelcomeLayoutAction()
      .then((acct) => {
        if (!live) return;
        const local = pick(loadFx());
        if (acct && Object.keys(acct).some((k) => k !== "at")) {
          last = sig(acct);
          if (sig(local) !== last) {
            const patch: Record<string, unknown> = {};
            for (const k of KEYS) patch[k] = acct[k];
            patchFx(patch as Partial<FxSettings>);
          }
        } else {
          last = sig(local);
          if (Object.keys(local).length) void saveWelcomeLayoutAction(local).catch(() => {});
        }
        ready = true;
      })
      .catch(() => {
        ready = true;
        last = sig(pick(loadFx()));
      });
    const unsub = subscribeFx(() => {
      if (!ready) return;
      const now = pick(loadFx());
      const s = sig(now);
      if (s === last) return;
      last = s;
      clearTimeout(timer);
      timer = window.setTimeout(() => void saveWelcomeLayoutAction(now).catch(() => {}), 900);
    });
    return () => {
      live = false;
      clearTimeout(timer);
      unsub();
    };
  }, []);
  return null;
}
