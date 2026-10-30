"use client";

import { useCallback, useEffect, useState } from "react";
import { dueSoonCardsAction } from "@/app/actions";
import { dueSoonList } from "@/lib/toucan-guide";
import { dueWindowLabel, readDueHours, saveDueHours } from "@/lib/due-soon";
import type { Task } from "@/lib/data/types";
import { TaskRow } from "./TaskRow";
import { DueWindowPicker } from "./DueWindowPicker";

type Lite = { id: string; title: string; due_at: string | null };
type TaskWithCategory = Task & { categoryLabel?: string | null };

/**
 * Due soon on the welcome screen: a gilded button that says how many quests
 * are due within the reach you chose (the same reach as on Today, changed
 * from the chip on its right), and opens into a drawer of their cards, due
 * next first and past due last.
 */
export function DueSoonDrawer({ tasks, onOpenChange }: { tasks: Lite[]; onOpenChange?: (open: boolean) => void }) {
  const [hours, setHours] = useState(readDueHours);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [cards, setCards] = useState<TaskWithCategory[] | null>(null);
  const [failed, setFailed] = useState(false);
  const soon = dueSoonList(tasks, undefined, hours);
  const ids = soon.map((t) => t.id);
  const shown = cards ? ids.map((id) => cards.find((c) => c.id === id)).filter((c): c is TaskWithCategory => !!c) : null;
  const reach = dueWindowLabel(hours);
  const ink = "#5a4a30";

  useEffect(() => {
    if (!open || cards) return;
    let live = true;
    dueSoonCardsAction()
      .then((c) => live && setCards(c))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, cards]);
  const toggle = () => {
    if (failed) (setFailed(false), setCards(null));
    setOpen(!open);
    onOpenChange?.(!open);
  };
  const pick = (h: number) => {
    setPicking(false);
    setHours(h);
    saveDueHours(h);
  };
  const closePicker = useCallback(() => setPicking(false), []);

  return (
    <div className="w-full">
      {/* One small gilded pill: the count opens the drawer, the reach (on the pill itself) changes how far ahead it looks. */}
      <div className="relative mx-auto flex w-fit items-stretch overflow-visible rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
        <button type="button" onClick={toggle} aria-expanded={open} className="font-display flex h-8 items-center gap-1.5 rounded-l-full pl-3 pr-2 text-[14.5px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Due soon
          <span className="tabular-nums opacity-80">({soon.length})</span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : undefined }}>
            <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span aria-hidden className="my-1.5 w-px" style={{ background: "rgba(74,57,19,.45)" }} />
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          aria-haspopup="dialog"
          aria-label={`Counting quests due in the next ${reach}. Change`}
          className="flex h-8 items-center gap-1 whitespace-nowrap rounded-r-full pl-2 pr-2.5 text-[12.5px] font-semibold"
        >
          {reach}
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden style={{ opacity: 0.8 }}>
            <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {picking && <DueWindowPicker hours={hours} onPick={pick} onClose={closePicker} ink={ink} isAdventure={false} paper />}
      </div>
      {open && (
        <div className="fade-in mt-2 max-h-[46vh] overflow-y-auto rounded-2xl p-1.5" style={{ background: "rgba(60,40,18,.12)", border: "1px solid rgba(139,112,64,.35)" }}>
          {!soon.length ? (
            <p className="m-0 py-2 text-center text-[14px]" style={{ color: ink }}>
              Nothing due in the next {reach}.
            </p>
          ) : shown ? (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-left">
              {shown.map((t) => (
                <TaskRow key={t.id} task={t} theme="adventure" categoryLabel={t.categoryLabel} />
              ))}
            </ul>
          ) : (
            <p className="m-0 py-2 text-center text-[14px]" style={{ color: ink }}>
              {failed ? "Couldn't load the cards. Try again in a moment." : "Opening…"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
