"use client";

import { useEffect } from "react";
import { getOwnWordsAction, saveOwnWordsAction, type OwnWords } from "@/app/actions";
import { loadFx, patchFx, subscribeFx, type FxSettings } from "@/lib/celebration-fx";

/** What of the welcome settings lives on your account rather than in this browser. */
const pick = (fx: FxSettings): OwnWords => ({ lines: fx.welcomeOwnLines ?? "", linesOn: fx.welcomeOwnOn, reflect: fx.reflectQuestions, reflectOn: fx.welcomeReflectOn });
const SYNCED = "own-words-synced";
const sig = (w: OwnWords) => JSON.stringify([w.lines ?? "", w.linesOn ?? null, w.reflect ?? null, w.reflectOn ?? null]);

/**
 * Keeps your own wise lines and reflection questions on your account: on load the
 * account's copy comes in (or this browser's goes up, the first time), and every
 * change after that is saved there a moment later.
 */
export function OwnWordsSync() {
  useEffect(() => {
    let live = true;
    let last = "";
    let timer: number | undefined;
    let ready = false;
    getOwnWordsAction()
      .then((acct) => {
        if (!live) return;
        const local = pick(loadFx());
        if (acct && (acct.lines !== undefined || acct.reflect !== undefined)) {
          // The first time this browser meets the account, both are kept (the account's words first,
          // then any written only here); after that the account's copy wins, so a removal sticks.
          let first = true;
          try {
            first = !localStorage.getItem(SYNCED);
            localStorage.setItem(SYNCED, "1");
          } catch {}
          if (!first) local.lines = local.reflect = undefined;
          const lineSet = (t?: string) => (t ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
          const lines = [...new Set([...lineSet(acct.lines), ...lineSet(local.lines)])].join("\n");
          const reflect = acct.reflect || local.reflect ? [...new Set([...(acct.reflect ?? []), ...(local.reflect ?? [])])] : undefined;
          const merged: OwnWords = { lines, linesOn: acct.linesOn ?? local.linesOn, reflect, reflectOn: acct.reflectOn ?? local.reflectOn };
          last = sig(merged);
          if (sig(local) !== last) patchFx({ welcomeOwnLines: lines, welcomeOwnOn: merged.linesOn, reflectQuestions: reflect, welcomeReflectOn: merged.reflectOn });
          if (sig({ ...acct, lines: acct.lines ?? "" }) !== last) void saveOwnWordsAction(merged).catch(() => {});
        } else {
          try {
            localStorage.setItem(SYNCED, "1");
          } catch {}
          last = sig(local);
          if ((local.lines ?? "").trim() || local.reflect || local.reflectOn) void saveOwnWordsAction(local).catch(() => {});
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
      timer = window.setTimeout(() => void saveOwnWordsAction(now).catch(() => {}), 900);
    });
    return () => {
      live = false;
      clearTimeout(timer);
      unsub();
    };
  }, []);
  return null;
}
