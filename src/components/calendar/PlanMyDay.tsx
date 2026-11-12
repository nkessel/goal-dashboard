"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Task } from "@/lib/data/types";
import { planDayTasksAction } from "@/app/actions";

// The planner's code loads when it's first opened (and is fetched ahead while the app is idle, so that's quick).
const loadPlanner = () => import("./AutoScheduler").then((m) => m.AutoScheduler);
const AutoScheduler = dynamic(loadPlanner, { ssr: false, loading: () => <PlanLoading /> });

/** Opens "Plan my day" from anywhere (Today's Quests, the welcome screen, the toucan). */
export function openPlanMyDay() {
  window.dispatchEvent(new Event("plan-my-day"));
}

/** Shown at once while today's quests and the planner load (owner, Nov 12: "open faster or have a loading screen"). */
function PlanLoading() {
  return (
    <div className="overlay-fade-in fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(10,14,10,.55)" }} role="status" aria-label="Opening the auto-scheduler" data-plan-loading>
      <div className="parchment-framed card-pop-in flex w-full max-w-[320px] flex-col items-center gap-3 rounded-3xl px-6 py-7 text-center" style={{ background: "radial-gradient(circle at 30% 20%, #fffaf0, #f3e6c6 70%)", border: "1.5px solid #c9a24a", color: "#2a1c10" }}>
        <span className="font-display text-[19px] leading-tight">Finding room in your day…</span>
        <span className="block h-1.5 w-40 overflow-hidden rounded-full" style={{ background: "rgba(139,112,64,.2)" }}>
          <span className="plan-loading-bar block h-full w-1/3 rounded-full" style={{ background: "linear-gradient(90deg,#c9a24a,#f6dc8e)" }} />
        </span>
        <span className="text-[13px]" style={{ color: "#6b5631" }}>
          Today&apos;s quests, your calendar and your habits
        </span>
      </div>
    </div>
  );
}

/**
 * Plan my day (owner, Nov 12: "just bring up an auto-scheduling popup with today's quests / items, not bring
 * the user to the calendar screen with the scheduler for all the user's tasks"): a popup, right where you are,
 * that places Today's Quests and what's due by tonight in today's free time, around your calendars, timed
 * habits, room for untimed habits and your [optional] events. The calendar keeps its own Auto-scheduler window
 * for everything else. Mounted once in the app shell.
 */
export function PlanMyDayHost({ theme }: { theme: "calm" | "adventure" }) {
  const [open, setOpen] = useState<{ tasks: Task[] | null; day: Date; over: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    const go = () => {
      const day = new Date();
      const over = document.documentElement.hasAttribute("data-welcome-open");
      const end = new Date(day);
      end.setHours(24, 0, 0, 0);
      setOpen({ tasks: null, day, over });
      void loadPlanner();
      planDayTasksAction(end.toISOString())
        .then((tasks) => live && setOpen({ tasks: tasks as Task[], day, over }))
        .catch(() => live && setOpen({ tasks: [], day, over }));
    };
    window.addEventListener("plan-my-day", go);
    // Fetch the planner's code ahead, once the app is idle.
    const warm = window.setTimeout(() => void loadPlanner().catch(() => {}), 6000);
    return () => {
      live = false;
      window.clearTimeout(warm);
      window.removeEventListener("plan-my-day", go);
    };
  }, []);
  if (!open) return null;
  if (!open.tasks) return <PlanLoading />;
  const isToday = open.day.toDateString() === new Date().toDateString();
  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    setOpen({ ...open, day: d });
  };
  return <AutoScheduler key={open.day.toDateString()} tasks={open.tasks} theme={theme} day={open.day} over={open.over} onTomorrow={isToday ? tomorrow : undefined} onClose={() => setOpen(null)} />;
}
