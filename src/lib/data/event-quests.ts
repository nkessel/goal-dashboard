import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { GoogleCalendarEvent, GoogleCalendarInfo } from "@/lib/google-calendar";
import type { Task } from "@/lib/data/types";
import { isTentativeTitle } from "@/lib/tentative";
import { eventQuestXp } from "@/lib/event-quest-xp";

/**
 * Calendar events into quests (owner, Nov 18: "an option to automatically make calendar events in the
 * future (past ones are unaffected) into quests"; Nov 19: "XP in proportion to the time of the event, and
 * coins in the same ratio").
 *
 * Settings in `life_wheel.eventQuests`: `{ on, since, made }`. While on, each upcoming timed event on the main
 * Google calendar that isn't a quest yet becomes one, linked to its event (moving the quest moves the event,
 * as with "Make it a quest"). Events that started before now, all-day events, maybes ([bracketed], or
 * answered Maybe) and invitations not answered yet are left alone. XP follows the event's length
 * (`eventQuestXp`); coins are left to follow XP like any quest's (`coinsForXp`). Every event made into a
 * quest (by hand or automatically) is remembered in `made`, so a quest you remove or delete is never made
 * again, and removing it leaves its event on Google.
 */
export type EventQuestSettings = { on: boolean; since?: string; made?: Record<string, string> };

export function readEventQuestSettings(extras: Record<string, unknown>): EventQuestSettings {
  const raw = extras.eventQuests as Partial<EventQuestSettings> | undefined;
  return { on: !!raw?.on, since: typeof raw?.since === "string" ? raw.since : undefined, made: raw?.made && typeof raw.made === "object" ? raw.made : {} };
}

/** Keep the record of events made into quests short: drop the oldest. */
function pruneMade(made: Record<string, string>): Record<string, string> {
  const keys = Object.keys(made);
  if (keys.length <= 1500) return made;
  return Object.fromEntries(keys.slice(-1200).map((k) => [k, made[k]]));
}

/**
 * Make quests from the upcoming events in `events` (already fetched for the page). Returns the new quests,
 * ready to draw in place of their events. Quietly does nothing when the setting is off.
 */
export async function makeEventQuests(
  ownerId: string,
  events: GoogleCalendarEvent[],
  calendars: GoogleCalendarInfo[],
  linked: Set<string>
): Promise<Task[]> {
  const db = supabaseAdmin();
  const { data: prof } = await db.from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const settings = readEventQuestSettings(prof?.life_wheel ?? {});
  if (!settings.on) return [];
  const main = calendars.find((c) => c.primary)?.id ?? "primary";
  const now = Date.now();
  const since = settings.since ? Date.parse(settings.since) : now;
  const made = settings.made ?? {};
  const fresh = events
    .filter(
      (e) =>
        !e.isAllDay &&
        (e.calendarId ?? "primary") === main &&
        Date.parse(e.start) > Math.max(now, since - 60_000) &&
        !linked.has(e.id) &&
        !made[e.id] &&
        !isTentativeTitle(e.title) &&
        e.response !== "needsAction" &&
        e.response !== "tentative"
    )
    .slice(0, 40);
  if (!fresh.length) return [];
  const rows = fresh.map((e) => {
    const minutes = Math.max(5, Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60_000));
    return {
      owner_id: ownerId,
      title: e.title.slice(0, 300),
      description: e.description ? e.description.slice(0, 4000) : null,
      importance: 0,
      urgency: 0,
      xp_value: eventQuestXp(minutes),
      // Null: coins follow XP at the app's usual rate (1 per 30 XP).
      coin_value: null,
      estimate_minutes: minutes,
      is_on_calendar: true,
      scheduled_start: e.start,
      scheduled_end: e.end,
      google_calendar_event_id: e.id,
    };
  });
  const { data, error } = await db.from("tasks").insert(rows).select("*");
  if (error || !data) {
    console.warn("Couldn't make quests from calendar events:", error?.message);
    return [];
  }
  const tasks = data as Task[];
  const added: Record<string, string> = {};
  for (const t of tasks) if (t.google_calendar_event_id) added[t.google_calendar_event_id] = t.id;
  // Merge into the latest copy (another load may have written meanwhile).
  const { data: cur } = await db.from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const latest = cur?.life_wheel ?? {};
  const latestSettings = readEventQuestSettings(latest);
  await db
    .from("profiles")
    .update({ life_wheel: { ...latest, eventQuests: { ...latestSettings, made: pruneMade({ ...(latestSettings.made ?? {}), ...added }) } } })
    .eq("id", ownerId);
  return tasks;
}
