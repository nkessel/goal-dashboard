"use client";

import { useState } from "react";
import { sessionRef } from "@/lib/calendar-task-window";
import { addTaskSessionAction, setTaskPlanByAction, unscheduleTaskAction } from "@/app/actions";
import type { Task } from "@/lib/data/types";
import { planByIn, slotWords } from "./dates";

type Slot = { start: string; end: string };

/**
 * The quest editor's scheduling state (E7): the day drawn in place (move it, or another session),
 * taking it off the calendar, and "Schedule within" for the auto-scheduler's list. The picked slot
 * itself stays in the dialog, because Save reads it for a new quest; so does the saved-slot record
 * (`onUnscheduled` clears it). `planDays` is read by Save too, so it is returned.
 */
export function useQuestScheduling({ task, slot, setSlot, initialSlot, onUnscheduled }: {
  task: Task | null;
  slot: Slot | null;
  setSlot: (s: Slot | null) => void;
  initialSlot: Slot | null;
  onUnscheduled: () => void;
}) {
  // The scheduling priority list beside the calendar.
  const [toSchedule, setToSchedule] = useState(task?.schedule_rank != null);
  const [schedNote, setSchedNote] = useState<string | null>(null);
  // The day drawn in place: to move its time, or to add another session.
  const [whenOpen, setWhenOpen] = useState<"move" | "more" | null>(null);
  const [addingSession, setAddingSession] = useState(false);
  const [sessionNote, setSessionNote] = useState<string | null>(null);
  function pickWhen(picked: { start: string; end: string }) {
    if (whenOpen !== "more" || !task) {
      setSlot(picked);
      setWhenOpen(null);
      return;
    }
    setAddingSession(true);
    addTaskSessionAction(sessionRef(task), picked.start, picked.end)
      .then(() => (setSessionNote(`Another session: ${slotWords(picked)}`), setWhenOpen(null)))
      .catch((e) => setSessionNote(e instanceof Error ? e.message : "Couldn't add that session."))
      .finally(() => setAddingSession(false));
  }
  function takeOffCalendar() {
    setWhenOpen(null);
    if (!task || slot !== initialSlot || !initialSlot) return setSlot(null);
    setSlot(null);
    unscheduleTaskAction(sessionRef(task))
      .then(() => onUnscheduled())
      .catch((e) => (setSlot(initialSlot), setSessionNote(e instanceof Error ? e.message : "Couldn't take it off the calendar.")));
  }
  // "Schedule within": days from today to its plan-by, while it's on the list to schedule.
  const [planDays, setPlanDays] = useState<number | null>(() => {
    if (task?.schedule_rank == null || !task.plan_by) return null;
    const d = new Date(task.plan_by);
    d.setHours(12, 0, 0, 0);
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return Math.max(0, Math.round((d.getTime() - t.getTime()) / 86_400_000));
  });
  function rateWithin(days: number | null) {
    setPlanDays(days);
    setToSchedule(days !== null);
    if (!task) return;
    setSchedNote(null);
    setTaskPlanByAction(task.id, days === null ? null : planByIn(days))
      .then(() => setSchedNote(days === null ? "Off the list to schedule" : "On the list to schedule"))
      .catch((e) => setSchedNote(e instanceof Error ? e.message : "Couldn't update the list."));
  }
  return { toSchedule, schedNote, whenOpen, setWhenOpen, addingSession, sessionNote, pickWhen, takeOffCalendar, planDays, rateWithin };
}
