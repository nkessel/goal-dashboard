import "server-only";
import { listCalendarTasksForOwner } from "@/lib/data/tasks";
import { listEventsAllCalendars } from "@/lib/google-calendar";
import { supabaseAdmin } from "@/lib/supabase/server";
import { calendarItems, type CalItem } from "@/lib/calendar-items";

/**
 * The one read (planner step 4): what's on the calendar from `from` to `to`, quests (and their sessions) with
 * their travel, and Google events not already shown as a quest. Reads only. The calendar screen and Today's side
 * calendar still load tasks and events themselves and build the same list with `calendarItems`; new readers
 * (the mini calendar, the scheduler, the write path's checks) use this.
 */
/** Each quest's drive, from its travel columns (kept in step with `life_wheel.questDrives` since migration 0098). */
async function readQuestDrives(ownerId: string): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin().from("tasks").select("id, travel_before_min").eq("owner_id", ownerId).gt("travel_before_min", 0);
  if (error) return {};
  return Object.fromEntries(((data ?? []) as { id: string; travel_before_min: number }[]).map((r) => [r.id, r.travel_before_min]));
}

export async function listCalendarItems(ownerId: string, from: Date, to: Date, accessToken?: string | null, skipCalendars: string[] = []): Promise<CalItem[]> {
  const [tasks, google, drives] = await Promise.all([
    listCalendarTasksForOwner(ownerId, from, to).catch(() => []),
    accessToken ? listEventsAllCalendars(accessToken, from, to, skipCalendars).catch(() => null) : Promise.resolve(null),
    readQuestDrives(ownerId),
  ]);
  const linked = new Set(tasks.map((t) => t.google_calendar_event_id).filter((id): id is string => Boolean(id)));
  const events = (google?.events ?? []).filter((e) => !linked.has(e.id));
  return calendarItems(tasks, events, { drives });
}
