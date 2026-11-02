"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Task } from "@/lib/data/types";
import { planDayTasksAction } from "@/app/actions";

// The planner's code loads only when it's first opened.
const AutoScheduler = dynamic(() => import("./AutoScheduler").then((m) => m.AutoScheduler), { ssr: false });

/** Opens "Plan my day" from anywhere (Today's Quests, the calendar, the toucan). */
export function openPlanMyDay() {
  window.dispatchEvent(new Event("plan-my-day"));
}

/**
 * Plan my day: today's quests (Today's Quests and what's due by tonight) placed in today's free
 * time, around your calendars, timed habits, room for untimed habits, and your [optional] events.
 * Mounted once in the app shell.
 */
export function PlanMyDayHost({ theme }: { theme: "calm" | "adventure" }) {
  const [open, setOpen] = useState<{ tasks: Task[]; day: Date; over: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    const go = () => {
      const day = new Date();
      const over = document.documentElement.hasAttribute("data-welcome-open");
      const end = new Date(day);
      end.setHours(24, 0, 0, 0);
      planDayTasksAction(end.toISOString())
        .then((tasks) => live && setOpen({ tasks: tasks as Task[], day, over }))
        .catch(() => live && setOpen({ tasks: [], day, over }));
    };
    window.addEventListener("plan-my-day", go);
    return () => {
      live = false;
      window.removeEventListener("plan-my-day", go);
    };
  }, []);
  if (!open) return null;
  const isToday = open.day.toDateString() === new Date().toDateString();
  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    setOpen({ ...open, day: d });
  };
  return <AutoScheduler key={open.day.toDateString()} tasks={open.tasks} theme={theme} day={open.day} over={open.over} onTomorrow={isToday ? tomorrow : undefined} onClose={() => setOpen(null)} />;
}
