"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { localDayKey } from "@/lib/auto-schedule";

/** Opens "Plan my day" from anywhere (Today's Quests, the calendar, the toucan). */
export function openPlanMyDay() {
  window.dispatchEvent(new Event("plan-my-day"));
}

/**
 * Plan my day is the auto-scheduler on the calendar (owner, Nov 3: "a vertical, resizable, movable,
 * minimizable list of tasks to schedule, and a full calendar"): the day's view with the auto-scheduler
 * window listing today's quests first. Drag one onto the calendar, tap it then a time, or "✨ Auto-schedule"
 * for the first free slot; then drag it on the calendar to change it, tap it to see or edit it.
 * Mounted once in the app shell.
 */
export function PlanMyDayHost({ theme }: { theme: "calm" | "adventure" }) {
  void theme;
  const router = useRouter();
  useEffect(() => {
    const go = () => {
      const key = localDayKey(new Date());
      router.push(`/calendar?view=day&date=${key}&plan=${key}`);
    };
    window.addEventListener("plan-my-day", go);
    return () => window.removeEventListener("plan-my-day", go);
  }, [router]);
  return null;
}
