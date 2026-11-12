"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CloseIcon } from "@/components/ui/Icons";
import { fromFeedback } from "@/lib/from-feedback";

const KEY = "today-cal-shown";
const EVENT = "today-cal-shown";
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
function readShown() {
  try {
    return window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}
function saveShown(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Slide Today's day calendar out on a phone (a quest card dragged to the screen's right edge asks for it). */
export function peekTodayCalendar() {
  window.dispatchEvent(new Event("today-cal-peek"));
}

/**
 * Today with its day calendar beside it (owner, Nov 12: "the calendar next to the today screen so the user can
 * see their day and just drag items into the calendar"). Wider screens: side by side, the calendar sticking
 * while Today scrolls; its – folds it to the edge tab. Phones: a gilded tab on the right edge slides it out
 * over the right of the screen (dragging a card to that edge opens it too); tapping outside slides it away.
 */
export function TodayWithCalendar({ calendar, children }: { calendar: React.ReactNode; children: React.ReactNode }) {
  const shown = useSyncExternalStore(subscribe, readShown, () => true);
  const [peek, setPeek] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const open = () => setPeek(true);
    window.addEventListener("today-cal-peek", open);
    return () => window.removeEventListener("today-cal-peek", open);
  }, []);
  // Phones: a tap outside the slid-out calendar puts it away (not while a card is being dragged).
  useEffect(() => {
    if (!peek) return;
    const away = (e: PointerEvent) => {
      if (fromFeedback(e) || document.body.hasAttribute("data-quest-drag")) return;
      const t = e.target as Element | null;
      if (panel.current?.contains(t) || t?.closest?.("[data-today-cal-tab], [role=menu], [role=dialog], [aria-modal]")) return;
      setPeek(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [peek]);

  return (
    <div className="md:flex md:items-start md:gap-5">
      <div className={`min-w-0 flex-1 md:max-w-xl ${shown ? "" : "md:mx-auto"}`}>{children}</div>
      <aside
        ref={panel}
        data-today-cal
        data-peek={peek ? "true" : undefined}
        aria-label="Today's calendar"
        className={`today-cal fixed right-0 z-[44] flex w-[min(82vw,340px)] flex-col md:sticky md:right-auto md:top-14 md:z-[5] md:h-[calc(100dvh-4.5rem)] md:w-[300px] md:shrink-0 lg:w-[360px] xl:w-[400px] ${shown ? "" : "md:hidden"}`}
      >
        <div className="flex items-center gap-2 px-1 pb-1.5">
          <h2 className="m-0 min-w-0 flex-1 truncate font-display text-[17px]" style={{ color: "var(--t-cream, var(--t-ink))", textShadow: "0 1px 2px rgba(0,0,0,.45)" }}>
            Today&rsquo;s calendar
          </h2>
          <Link href="/calendar?view=day" className="shrink-0 text-[12.5px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--t-gold)" }}>
            Open ›
          </Link>
          <button
            type="button"
            onClick={() => (setPeek(false), saveShown(false))}
            aria-label="Fold the calendar to the edge"
            title="Fold to the edge"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-[20px] leading-none hover:bg-white/10 md:flex"
            style={{ color: "var(--t-gold)" }}
          >
            –
          </button>
          <button type="button" onClick={() => setPeek(false)} aria-label="Close the calendar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10 md:hidden" style={{ color: "var(--t-gold)" }}>
            <CloseIcon size={12} />
          </button>
        </div>
        <div data-cal-scroller className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl" style={{ boxShadow: "0 8px 22px rgba(0,0,0,.35)" }}>
          {calendar}
        </div>
      </aside>
      {/* The edge tab: always on phones (when the calendar is away), on wider screens once it's folded. */}
      <button
        type="button"
        data-today-cal-tab
        onClick={() => (shown ? setPeek(true) : (saveShown(true), setPeek(true)))}
        aria-label="Show today's calendar"
        title="Today's calendar: drag a quest card onto a time"
        className={`today-cal-tab bring-tab fixed right-0 top-[38%] z-[43] flex w-8 flex-col items-center gap-1 rounded-l-xl py-3 ${peek ? "pointer-events-none opacity-0" : ""} ${shown ? "md:hidden" : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- calendar glyph */}
        <img src="/design/ui-calendar.png" alt="" width={16} height={16} className="h-4 w-4" />
        <span className="font-display text-[12px] font-semibold [writing-mode:vertical-rl]">Calendar</span>
      </button>
    </div>
  );
}
