"use client";

import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { DateField } from "@/components/ui/DateField";
import { TimeRangePick } from "@/components/ui/TimeRangePick";
import { TimeToken } from "@/components/xp/NightFields";
import { WhenPicker } from "@/components/calendar/WhenPicker";
import { saveQuestWindow, useQuestWindow } from "@/lib/use-quest-cal";
import type { Task } from "@/lib/data/types";
import { EarlyBonusFields } from "../EarlyBonusFields";
import { ScheduleWithin } from "../ScheduleWithin";
import { dueQuickPicks, slotWords } from "./dates";
import type { useQuestScheduling } from "./use-quest-scheduling";

type Slot = { start: string; end: string };

/**
 * The Due pill's panel (E7): quick dates, a date and time, the early bonus, then when to do it (the
 * calendar, another session, "Schedule within", the time of day). Its values stay with the dialog,
 * which saves and drafts them; the scheduling state comes from `useQuestScheduling`.
 */
export function EditorScheduling({ task, doingNow, isAdventure, labelCls, fieldStyle, chipBorder, dueDate, setDueDate, dueTime, setDueTime, early, onEarlyChange, fixedSchedule, shownSlot, slot, setSlot, initialSlot, estimate, title, timeWindow, sched }: {
  task: Task | null;
  doingNow: boolean;
  isAdventure: boolean;
  labelCls: string;
  fieldStyle: React.CSSProperties;
  chipBorder: string;
  dueDate: string;
  setDueDate: (v: string) => void;
  dueTime: string;
  setDueTime: (v: string) => void;
  early: { xp: number | null; coins: number | null; perDay: number | null };
  onEarlyChange: (v: { xp: number | null; coins: number | null; perDay: number | null }) => void;
  fixedSchedule: boolean;
  shownSlot: Slot | null;
  slot: Slot | null;
  setSlot: (s: Slot | null) => void;
  initialSlot: Slot | null;
  estimate: string;
  title: string;
  timeWindow: ReturnType<typeof useQuestWindow>;
  sched: ReturnType<typeof useQuestScheduling>;
}) {
  const { toSchedule, schedNote, whenOpen, setWhenOpen, addingSession, sessionNote, pickWhen, takeOffCalendar, planDays, rateWithin } = sched;
  const schedulingBlock = doingNow ? null : (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- card glyph */}
        <img src="/design/ui-calendar.png" alt="" width={15} height={15} className="h-[15px] w-[15px] shrink-0" />
        <span className={`${labelCls} shrink-0`}>Calendar</span>
        <span className="min-w-0 flex-1 truncate text-[13px] tabular-nums" style={{ color: shownSlot ? "var(--t-ink)" : "var(--t-ink-soft)" }}>
          {shownSlot ? slotWords(shownSlot) : "Not on it yet"}
        </span>
        {!fixedSchedule && (
          <>
            {slot && slot !== initialSlot && (
              <button type="button" onClick={() => (setSlot(initialSlot), setWhenOpen(null))} className="text-xs underline" style={{ color: "var(--t-ink-soft)" }}>
                Undo
              </button>
            )}
            <button type="button" onClick={() => setWhenOpen((o) => (o === "move" ? null : "move"))} aria-expanded={whenOpen === "move"} className="qe-fact flex h-8 shrink-0 items-center rounded-full px-3 text-[12.5px] font-semibold" data-open={whenOpen === "move" ? "true" : undefined}>
              {slot ? "Change" : "Find a time"}
            </button>
            {slot && (
              <button type="button" onClick={takeOffCalendar} aria-label="Take it off the calendar" title="Take it off the calendar" className="h-8 w-6 shrink-0 text-[17px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
                <CloseIcon size={10} />
              </button>
            )}
          </>
        )}
      </div>
      {/* A quest already on the calendar can get another session (it ran long; more of it tomorrow). */}
      {task && initialSlot && slot === initialSlot && !fixedSchedule && (
        <button type="button" onClick={() => setWhenOpen((o) => (o === "more" ? null : "more"))} aria-expanded={whenOpen === "more"} className="qe-fact flex h-8 items-center self-start rounded-full px-3 text-[12.5px] font-semibold" data-open={whenOpen === "more" ? "true" : undefined}>
          ＋ Another session
        </button>
      )}
      {sessionNote && (
        <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }} role="status">
          {sessionNote}
        </span>
      )}
      <Fold open={whenOpen !== null}>
        {whenOpen !== null && (
          <div className="pt-1">
            <WhenPicker
              key={whenOpen}
              minutes={Math.max(15, Number(estimate) || 30)}
              title={title.trim() || "This quest"}
              isAdventure={isAdventure}
              initial={whenOpen === "move" ? (slot?.start ?? null) : null}
              placing={addingSession}
              onPick={pickWhen}
            />
          </div>
        )}
      </Fold>
      {/* How soon it needs a time: puts it on the auto-scheduler's list in that group. */}
      <ScheduleWithin days={planDays} onRate={rateWithin} />
      {/* When in the day it may go: the auto-scheduler only looks inside this range. */}
      {task && !fixedSchedule && (
        <div data-quest-window className="flex flex-col gap-1.5">
          <span className={labelCls}>Time of day</span>
          <TimeRangePick small value={{ from: timeWindow?.from ?? "", to: timeWindow?.to ?? "" }} onChange={(v) => void saveQuestWindow(task.id, v.from || v.to ? { ...(v.from ? { from: v.from } : {}), ...(v.to ? { to: v.to } : {}) } : null)} startWord="After" />
        </div>
      )}
      {toSchedule && planDays == null && (
        <span className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
          On the list to schedule
          <button type="button" onClick={() => rateWithin(null)} className="underline underline-offset-2">
            Take it off
          </button>
        </span>
      )}
      {schedNote && (
        <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }} role="status">
          {schedNote}
        </span>
      )}
    </div>
  );
  return (
    <>
                      <div className="flex flex-wrap items-center gap-1">
                        {dueQuickPicks().map((q) => (
                          <button key={q.label} type="button" aria-pressed={dueDate === q.day} onClick={() => setDueDate(q.day)} className="qe-fact h-8 rounded-full px-2.5 text-[13px] font-semibold" data-open={dueDate === q.day ? "true" : undefined}>
                            {q.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`${labelCls} shrink-0`}>Pick a date</span>
                        <DateField value={dueDate} onChange={setDueDate} ariaLabel="Due date" placeholder="No due date" className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-[15px]" style={fieldStyle} />
                        {dueDate && (
                          <>
                            <TimeToken value={dueTime} onChange={setDueTime} label="Due time (optional)" kind="any" compact />
                            <button type="button" onClick={() => (setDueDate(""), setDueTime(""))} aria-label="Clear the due date" title="No due date" className="h-9 w-7 shrink-0 text-[18px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
                              <CloseIcon size={11} />
                            </button>
                          </>
                        )}
                      </div>
                      {/* Finishing early: a reward, right with the date it's measured from. */}
                      {dueDate && (
                        <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: "rgba(139,112,64,.22)" }}>
                          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
                            <span aria-hidden className="text-[12px]">⏱</span> Early bonus
                            <span className="font-normal" style={{ color: "var(--t-ink-soft)" }}>
                              for finishing before it&rsquo;s due
                            </span>
                          </span>
                          <EarlyBonusFields value={early} onChange={onEarlyChange} chipBorder={chipBorder} />
                        </div>
                      )}
                      {/* When to do it: the calendar and the list to schedule. */}
                      {schedulingBlock && (
                        <div className="border-t pt-2" style={{ borderColor: "rgba(139,112,64,.22)" }}>
                          {schedulingBlock}
                        </div>
                      )}
    </>
  );
}
