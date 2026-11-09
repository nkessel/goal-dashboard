"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dawnAction, dawnDayAction, saveDawnAction, tickDawnAction } from "@/app/actions";
import type { Dawn, DawnDay } from "@/lib/dawn";

const EVT = "dawn-changed";

// Every save rewrites the whole dawn on the server, so they go one at a time (a quick tick right
// after a change would otherwise overwrite it).
let chain: Promise<unknown> = Promise.resolve();
function inTurn<T>(run: () => Promise<T>): Promise<T> {
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

/**
 * Your dawn (settings, stones, days) for one day, shared by every place that shows it: a change
 * in one (the settings panel, the evening plan) shows in the others at once.
 */
export function useDawn(day: string | null) {
  const [dawn, setDawn] = useState<Dawn | null>(null);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!day) return;
    let live = true;
    dawnAction(day).then(
      (r) => live && (setDawn(r.dawn), setDoneIds(r.doneIds)),
      () => live && setError("Your dawn didn't load. Try again in a moment.")
    );
    return () => {
      live = false;
    };
  }, [day]);

  useEffect(() => {
    const on = (e: Event) => setDawn((e as CustomEvent<Dawn>).detail);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);

  const publish = useCallback((next: Dawn) => {
    setDawn(next);
    window.dispatchEvent(new CustomEvent(EVT, { detail: next }));
  }, []);

  /** Change part of one day (optimistic; saved in the background). */
  const patchDay = useCallback(
    (d: string, patch: DawnDay) => {
      setDawn((cur) => {
        if (!cur) return cur;
        const next = { ...cur, days: { ...cur.days, [d]: { ...(cur.days[d] ?? {}), ...patch, ...(patch.answers ? { answers: { ...(cur.days[d]?.answers ?? {}), ...patch.answers } } : {}) } } };
        queueMicrotask(() => window.dispatchEvent(new CustomEvent(EVT, { detail: next })));
        return next;
      });
      inTurn(() => dawnDayAction(d, patch)).catch(() => setError("That didn't save. Check your connection."));
    },
    []
  );

  /** Change your settings, stones, cards, prompts or chapters: shown at once, saved after a short pause (typing stays smooth). */
  const pending = useRef<Partial<Pick<Dawn, "on" | "stones" | "cards" | "prompts" | "chapters" | "chapterPinned">>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSettings = useCallback(
    (patch: Partial<Pick<Dawn, "on" | "stones" | "cards" | "prompts" | "chapters" | "chapterPinned">>) => {
      if (!dawn) return;
      publish({ ...dawn, ...patch, on: { ...dawn.on, ...(patch.on ?? {}) } });
      pending.current = { ...pending.current, ...patch, ...(patch.on ? { on: { ...(pending.current.on ?? dawn.on), ...patch.on } } : {}) };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const p = pending.current;
        pending.current = {};
        inTurn(() => saveDawnAction(p)).catch(() => setError("That didn't save. Check your connection."));
      }, 600);
    },
    [dawn, publish]
  );

  /** Tick a stone, the card or the week's practice (habit-tied stones tick their habit too). */
  const tick = useCallback(
    (d: string, what: { stone: string } | { extra: "card" | "week" | "pmCard" }, on: boolean) => {
      setDawn((cur) => {
        if (!cur) return cur;
        const day0 = { ...(cur.days[d] ?? {}) };
        if ("stone" in what) day0.done = on ? [...new Set([...(day0.done ?? []), what.stone])] : (day0.done ?? []).filter((x) => x !== what.stone);
        else day0[what.extra === "card" ? "cardDone" : what.extra === "week" ? "weekDone" : "pmDone"] = on || undefined;
        return { ...cur, days: { ...cur.days, [d]: day0 } };
      });
      if ("stone" in what) setDoneIds((ids) => (on ? [...new Set([...ids, what.stone])] : ids.filter((x) => x !== what.stone)));
      inTurn(() => tickDawnAction(d, what, on)).catch((e) => setError(e instanceof Error ? e.message : "That didn't save."));
    },
    []
  );

  return { dawn, doneIds, error, patchDay, saveSettings, tick };
}
