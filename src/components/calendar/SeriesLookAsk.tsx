"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { applySeriesLookAction, seriesAskAction } from "@/app/actions";
import { SCOPE_LABELS, type SeriesScope } from "@/lib/series-look";
import { CloseIcon } from "@/components/ui/Icons";

/** Ask whether a quest's new look should go on its repeating event's other quests. */
export function askSeriesLook(taskId: string) {
  window.dispatchEvent(new CustomEvent("series-look-check", { detail: { taskId } }));
}

/**
 * After the portrait, XP, coins, board or card colour of one quest of a repeating event changes, a small card
 * at the foot of the screen asks "Same look for every …? Just this one · This and later · All" (owner, Nov 18).
 * It asks only when the look really differs from the series', and not again for one kept to itself.
 */
export function SeriesLookAsk() {
  const router = useRouter();
  const [ask, setAsk] = useState<{ taskId: string; title: string; others: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ taskId: string }>).detail?.taskId;
      if (!id) return;
      if (timer.current) clearTimeout(timer.current);
      // The editor saves as it closes: look once that has landed.
      timer.current = setTimeout(() => {
        seriesAskAction(id)
          .then((r) => {
            if (!r) return;
            setDone(null);
            setLeaving(false);
            setAsk({ taskId: id, ...r });
          })
          .catch(() => {});
      }, 1400);
    };
    window.addEventListener("series-look-check", on);
    return () => window.removeEventListener("series-look-check", on);
  }, []);

  function close() {
    setLeaving(true);
    setTimeout(() => (setAsk(null), setLeaving(false), setDone(null)), 220);
  }
  function pick(scope: SeriesScope) {
    if (!ask) return;
    start(async () => {
      try {
        const r = await applySeriesLookAction(ask.taskId, scope);
        setDone(scope === "one" ? "Kept for this one only." : r.changed ? `Saved for ${r.changed + 1} of them${scope === "following" ? ", and the ones to come" : " and every one to come"}.` : "Saved for the ones to come.");
        router.refresh();
        setTimeout(close, 1800);
      } catch (e) {
        setDone(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  if (!ask || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-label="Same look for every one?"
      data-series-ask
      className={`parchment fixed left-1/2 z-[95] w-[min(360px,calc(100vw-24px))] -translate-x-1/2 rounded-2xl px-4 pb-3 pt-3 ${leaving ? "pop-leave" : "card-pop-in"}`}
      style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))", border: "1px solid #b39a6a", boxShadow: "0 14px 34px rgba(0,0,0,.38)" }}
    >
      <button type="button" aria-label="Not now" onClick={close} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
        <CloseIcon size={12} />
      </button>
      <p className="m-0 pr-6 font-display text-[16px] leading-snug" style={{ color: "var(--t-ink)" }}>
        Same look for every “{ask.title}”?
      </p>
      <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
        Its portrait, XP, coins, board and card colour.
      </p>
      {done ? (
        <p className="m-0 mt-2 text-[13.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
          {done}
        </p>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(["one", "following", "all"] as SeriesScope[]).map((k) => (
            <button
              key={k}
              type="button"
              disabled={pending}
              data-scope={k}
              onClick={() => pick(k)}
              className="hover-glow h-9 rounded-full px-3.5 text-[13.5px] font-semibold"
              style={k === "all" ? { background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" } : { border: "1px solid rgba(139,112,64,.5)", color: "var(--t-ink)" }}
            >
              {SCOPE_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
