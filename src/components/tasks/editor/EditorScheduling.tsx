"use client";

import { useState } from "react";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { DateField } from "@/components/ui/DateField";
import { TimeRangePick } from "@/components/ui/TimeRangePick";
import { TimeToken } from "@/components/xp/NightFields";
import { WhenPicker } from "@/components/calendar/WhenPicker";
import { minutesOf, rangeWords } from "@/lib/auto-schedule";
import { saveQuestWindow, useQuestWindow } from "@/lib/use-quest-cal";
import { addDaysYmd, ymd } from "@/lib/when";
import type { Task } from "@/lib/data/types";
import { EarlyBonusFields } from "../EarlyBonusFields";
import { slotWords } from "./dates";
import { applyWhenChoice, editorWhenFace, isRange, WHEN_RANGES, type WhenChoice } from "./when-state";
import type { useQuestScheduling } from "./use-quest-scheduling";

type Slot = { start: string; end: string };
type Early = { xp: number | null; coins: number | null; perDay: number | null };

const SOFT = "var(--t-ink-soft)";
const rule: React.CSSProperties = { borderColor: "rgba(139,112,64,.22)" };
const lit = (on: boolean) => (on ? "true" : undefined);
const pickCls = "qe-fact h-8 rounded-full px-2.5 text-[13px] font-semibold";
const linkCls = "text-[12.5px] font-semibold underline underline-offset-2";

function earlyWords(e: Early): string {
  if (e.xp === null) return "Automatic";
  if (!e.xp && !e.coins && !e.perDay) return "None";
  return [e.xp ? `${e.xp} XP` : "", e.coins ? `${e.coins} coin${e.coins === 1 ? "" : "s"}` : "", e.perDay ? `+${e.perDay} a day` : ""].filter(Boolean).join(" · ");
}

/** The soft gold pencil (24px, no border), as everywhere else (UI-STANDARDS). */
function Pencil({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-label={label} title={label} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px]" style={{ color: "#a88a3f", background: open ? "rgba(217,180,95,.25)" : "transparent" }}>
      ✎
    </button>
  );
}

/**
 * The quest's When pill's panel (When 2, layout 5c, owner Nov 18): one "Complete by" question. Each date
 * is Flexible (a goal the auto-scheduler aims for; it never reads late) or Fixed (it has to be done by then).
 * Under it, only what applies: the early bonus (Fixed only), the time of day, and a time on the calendar.
 * Same picks and words as the import card's When panel (`imports/triage/AttrPills.tsx`).
 *
 * The values stay with the dialog, which saves and drafts them as before: a Fixed date is the due date,
 * a Flexible one is "plan within N days" (the list to schedule, `sched.rateWithin`). "Pick a time" still
 * opens `WhenPicker` here; When 3 swaps in the mini calendar. WH-n comments match the review codes.
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
  early: Early;
  onEarlyChange: (v: Early) => void;
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
  const { schedNote, whenOpen, setWhenOpen, addingSession, sessionNote, pickWhen, takeOffCalendar, planDays, rateWithin } = sched;
  const fields = { dueDate, dueTime, planDays };
  const fixed = !!dueDate;
  const set = dueDate !== "" || planDays !== null;
  // Picking: the quick picks and the Flexible · Fixed switch. Once set, they fold into one pill (tap it to change).
  const [picking, setPicking] = useState(!set);
  const [other, setOther] = useState(false);
  const [earlyOpen, setEarlyOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  // The clock is read once, when the panel opens (and again on each tap), never on every draw.
  const [now] = useState(() => new Date());
  const today = ymd(now);
  const choose = (c: WhenChoice) => {
    const next = applyWhenChoice(fields, c, new Date());
    if (next.dueDate !== dueDate) setDueDate(next.dueDate);
    if (next.dueTime !== dueTime) setDueTime(next.dueTime);
    if (next.planDays !== planDays) rateWithin(next.planDays);
    if (c.kind === "clear") {
      setPicking(true);
      setOther(false);
    }
  };
  const dayOf = fixed ? dueDate : planDays != null && !isRange(planDays) ? addDaysYmd(today, planDays) : null;
  const days = [
    { label: "Today", day: today },
    { label: "Tomorrow", day: addDaysYmd(today, 1) },
  ];
  const otherDay = dayOf && !days.some((d) => d.day === dayOf) ? dayOf : null;
  const face = editorWhenFace(fields, null, now);
  // The list's own "On the list" / "Off the list" words would repeat the line under the panel; errors still show.
  const note = schedNote && !/^(On|Off) the list/.test(schedNote) ? schedNote : null;

  const completeBy = (
    <div className="flex flex-col gap-2" data-when-panel>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${labelCls} shrink-0`}>Complete by</span>
        {picking || !set ? (
          <>
            {days.map((q) => (
              <button key={q.label} type="button" aria-pressed={dayOf === q.day} onClick={() => (dayOf === q.day ? choose({ kind: "clear" }) : choose({ kind: "day", day: q.day }))} className={pickCls} data-open={lit(dayOf === q.day)}>
                {q.label}
              </button>
            ))}
            {WHEN_RANGES.map((r) => {
              const on = !fixed && planDays === r.days;
              return (
                <button key={r.label} type="button" aria-pressed={on} onClick={() => (on ? choose({ kind: "clear" }) : choose({ kind: "range", days: r.days }))} className={pickCls} data-open={lit(on)}>
                  {r.label}
                </button>
              );
            })}
            <button type="button" aria-expanded={other} onClick={() => setOther((v) => !v)} className={pickCls} data-open={lit(other || !!otherDay)}>
              {otherDay ? face.words.replace(/^(By|Around) /, "") : "Other…"}
            </button>
          </>
        ) : (
          // WH-2: once set, the picks fold into one pill: dashed for Flexible, solid gold for Fixed, and a ×.
          <span className="inline-flex items-center gap-0.5">
            <button type="button" onClick={() => setPicking(true)} aria-label={`Change the date: ${face.words}`} className="qe-fact flex h-8 items-center rounded-full px-3 text-[13px] font-semibold" data-open={lit(fixed)} data-when-face style={{ borderStyle: fixed ? "solid" : "dashed", color: face.late ? "#a8321e" : undefined }}>
              {face.words}
            </button>
            <button type="button" onClick={() => choose({ kind: "clear" })} aria-label="No date" title="No date" className="flex h-8 w-6 items-center justify-center" style={{ color: SOFT }}>
              <CloseIcon size={10} />
            </button>
          </span>
        )}
      </div>
      <Fold open={other && (picking || !set)}>
        <div className="flex items-center gap-2 pb-0.5">
          <span className={`${labelCls} shrink-0`}>On or by</span>
          <DateField value={dayOf ?? ""} min={today} onChange={(d) => (d ? choose({ kind: "day", day: d }) : choose({ kind: "clear" }), setOther(false))} ariaLabel="Complete by date" placeholder="Pick a day" className="h-8 min-w-0 flex-1 rounded-lg border px-2 text-[15px]" style={fieldStyle} />
        </div>
      </Fold>
      {/* The owner's two words (Nov 18), shown while picking once there's a date. */}
      <Fold open={set && picking}>
        <div className="flex flex-wrap items-center gap-2" data-when-firm>
          <span className="text-[13px]" style={{ color: SOFT }}>
            This date is
          </span>
          <span className="inline-flex h-8 overflow-hidden rounded-full text-[12.5px] font-semibold" style={{ border: "1px solid rgba(139,112,64,.55)" }} role="group" aria-label="Flexible or fixed">
            {[
              { f: false, label: "Flexible" },
              { f: true, label: "Fixed" },
            ].map((o) => (
              <button key={o.label} type="button" aria-pressed={fixed === o.f} onClick={() => choose({ kind: "firm", firm: o.f })} className="px-3" style={{ background: fixed === o.f ? "rgba(217,180,95,.55)" : "transparent", color: fixed === o.f ? "var(--t-ink)" : SOFT }}>
                {o.label}
              </button>
            ))}
          </span>
          <span className="min-w-0 flex-1 text-[12px] leading-snug" style={{ color: SOFT }}>
            {fixed ? "Has to be done by then." : "A goal: it can slide if your week fills up."}
          </span>
          {/* WH-3: a Fixed date can have a time it's due by. */}
          {fixed && <TimeToken value={dueTime} onChange={setDueTime} label="Due by (optional)" kind="any" compact placeholder="by a time" quiet />}
          <button type="button" onClick={() => (setPicking(false), setOther(false))} className={linkCls} style={{ color: SOFT }}>
            Done
          </button>
        </div>
      </Fold>
      {/* WH-4: the early bonus, Fixed only, as one quiet line that opens in place. */}
      {fixed && (
        <div className="flex flex-col gap-1.5" data-when-early>
          <span className="flex min-h-6 items-center gap-1 text-[13px]" style={{ color: "var(--t-ink)" }}>
            <span className="font-semibold">Early bonus:</span>
            <span style={{ color: SOFT }}>{earlyWords(early)}</span>
            <Pencil open={earlyOpen} onClick={() => setEarlyOpen((v) => !v)} label="Change the early bonus" />
          </span>
          <Fold open={earlyOpen}>
            <div className="pb-1">
              <EarlyBonusFields value={early} onChange={onEarlyChange} chipBorder={chipBorder} />
            </div>
          </Fold>
        </div>
      )}
    </div>
  );

  if (doingNow) return completeBy;

  const rangeSet = !!(timeWindow?.from || timeWindow?.to);
  return (
    <>
      {completeBy}
      <div className="flex flex-col gap-2 border-t pt-2" style={rule}>
        {/* WH-5: the time of day, one quiet line once set ("Before 12 pm ✎"), else a quiet link. */}
        {task && !fixedSchedule && (
          <div data-quest-window className="flex flex-col gap-1.5">
            {rangeSet ? (
              <span className="flex min-h-6 items-center gap-1 text-[13px]" style={{ color: "var(--t-ink)" }}>
                {rangeWords(minutesOf(timeWindow?.from), minutesOf(timeWindow?.to))}
                <Pencil open={rangeOpen} onClick={() => setRangeOpen((v) => !v)} label="Change the time of day" />
              </span>
            ) : (
              <button type="button" onClick={() => setRangeOpen((v) => !v)} aria-expanded={rangeOpen} className={`${linkCls} self-start`} style={{ color: SOFT }}>
                Time of day
              </button>
            )}
            <Fold open={rangeOpen}>
              <TimeRangePick small value={{ from: timeWindow?.from ?? "", to: timeWindow?.to ?? "" }} onChange={(v) => void saveQuestWindow(task.id, v.from || v.to ? { ...(v.from ? { from: v.from } : {}), ...(v.to ? { to: v.to } : {}) } : null)} startWord="After" />
            </Fold>
          </div>
        )}
        {/* WH-6: a time on the calendar: "On your calendar Thu 3–3:30pm · Change · ×", or the "Pick a time" link. */}
        <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1" data-when-slot>
          {shownSlot ? (
            <>
              <span className="text-[13px] tabular-nums" style={{ color: "var(--t-ink)" }}>
                On your calendar {slotWords(shownSlot)}
              </span>
              {!fixedSchedule && (
                <>
                  <button type="button" onClick={() => setWhenOpen((o) => (o === "move" ? null : "move"))} aria-expanded={whenOpen === "move"} className={linkCls} style={{ color: SOFT }}>
                    Change
                  </button>
                  {slot && slot !== initialSlot && (
                    <button type="button" onClick={() => (setSlot(initialSlot), setWhenOpen(null))} className={linkCls} style={{ color: SOFT }}>
                      Undo
                    </button>
                  )}
                  <button type="button" onClick={takeOffCalendar} aria-label="Take it off the calendar" title="Take it off the calendar" className="flex h-8 w-6 items-center justify-center" style={{ color: SOFT }}>
                    <CloseIcon size={10} />
                  </button>
                </>
              )}
            </>
          ) : (
            <button type="button" onClick={() => setWhenOpen((o) => (o === "move" ? null : "move"))} aria-expanded={whenOpen === "move"} className={`${linkCls} self-start`} style={{ color: SOFT }}>
              Pick a time
            </button>
          )}
          {/* A quest already on the calendar can get another session (it ran long; more of it tomorrow). */}
          {task && initialSlot && slot === initialSlot && !fixedSchedule && (
            <button type="button" onClick={() => setWhenOpen((o) => (o === "more" ? null : "more"))} aria-expanded={whenOpen === "more"} className="qe-fact flex h-8 items-center rounded-full px-3 text-[12.5px] font-semibold" data-open={lit(whenOpen === "more")}>
              ＋ Another session
            </button>
          )}
        </div>
        {sessionNote && (
          <span className="text-[12.5px]" style={{ color: SOFT }} role="status">
            {sessionNote}
          </span>
        )}
        <Fold open={whenOpen !== null}>
          {whenOpen !== null && (
            <div className="pt-1">
              <WhenPicker key={whenOpen} minutes={Math.max(15, Number(estimate) || 30)} title={title.trim() || "This quest"} isAdventure={isAdventure} initial={whenOpen === "move" ? (slot?.start ?? null) : null} placing={addingSession} onPick={pickWhen} />
            </div>
          )}
        </Fold>
        {/* WH-7: say what happens, as the import card does: a date alone waits on the auto-scheduler's list. */}
        {set && !shownSlot && (
          <span className="text-[12px] leading-snug" style={{ color: SOFT }} data-when-lands>
            {fixed ? "On the auto-scheduler's list, to be placed before it's due." : "On the auto-scheduler's list, aiming for that."} Not on your calendar until you Auto-schedule it or pick a time.
          </span>
        )}
        {note && (
          <span className="text-[12px]" style={{ color: SOFT }} role="status">
            {note}
          </span>
        )}
      </div>
    </>
  );
}
