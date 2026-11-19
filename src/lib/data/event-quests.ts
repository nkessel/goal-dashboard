import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { GoogleCalendarEvent, GoogleCalendarInfo } from "@/lib/google-calendar";
import type { Task } from "@/lib/data/types";
import { isTentativeTitle } from "@/lib/tentative";
import { lookFor, type SeriesEntry } from "@/lib/series-look";

/**
 * Calendar events into quests (owner, Nov 18: "an option to automatically make calendar events in the
 * future (past ones are unaffected) into quests").
 *
 * Settings in `life_wheel.eventQuests`: `{ on, since }`. While on, each upcoming timed event on the main
 * Google calendar that isn't a quest yet becomes one, linked to its event (moving the quest moves the event,
 * as with "Make it a quest"). Events that started before now, all-day events, maybes ([bracketed]) and
 * invitations not answered yet are left alone. Every event made into a quest (by hand or automatically) is
 * remembered in `eventQuests.made` so a quest you remove or delete is never made again.
 *
 * A repeating event's quests share one series (`life_wheel.questSeries[taskId] = "g:<recurring id>"`) and
 * take the series' saved look (portrait, XP, coins, board, card colour) for their day.
 */

export type EventQuestSettings = { on: boolean; since?: string; made?: Record<string, string> };

export function readEventQuestSettings(extras: Record<string, unknown>): EventQuestSettings {
  const raw = extras.eventQuests as Partial<EventQuestSettings> | undefined;
  return { on: !!raw?.on, since: typeof raw?.since === "string" ? raw.since : undefined, made: raw?.made && typeof raw.made === "object" ? raw.made : {} };
}

/** Keep the record of events made into quests short: drop ones whose day is long past. */
function pruneMade(made: Record<string, string>): Record<string, string> {
  const keys = Object.keys(made);
  if (keys.length <= 1500) return made;
  return Object.fromEntries(keys.slice(-1200).map((k) => [k, made[k]]));
}

const dayOf = (iso: string) => {
  // The owner's day in New York, where the app's days are kept; good enough for a look that starts on a day.
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
};

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
  const extras = prof?.life_wheel ?? {};
  const settings = readEventQuestSettings(extras);
  if (!settings.on) return [];
  const main = calendars.find((c) => c.primary)?.id ?? "primary";
  const now = Date.now();
  const since = settings.since ? Date.parse(settings.since) : now;
  const made = { ...(settings.made ?? {}) };
  const fresh = events.filter(
    (e) =>
      !e.isAllDay &&
      (e.calendarId ?? "primary") === main &&
      Date.parse(e.start) > Math.max(now, since - 60_000) &&
      !linked.has(e.id) &&
      !made[e.id] &&
      !isTentativeTitle(e.title) &&
      e.response !== "needsAction"
  ).slice(0, 40);
  if (!fresh.length) return [];

  const looks = (extras.seriesLooks as Record<string, SeriesEntry[]> | undefined) ?? {};
  const series = { ...((extras.questSeries as Record<string, string> | undefined) ?? {}) };
  const rows = fresh.map((e) => {
    const key = e.recurringEventId ? `g:${e.recurringEventId}` : null;
    const look = key ? lookFor(looks[key], dayOf(e.start)) : null;
    const minutes = Math.max(5, Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60_000));
    return {
      owner_id: ownerId,
      title: e.title.slice(0, 300),
      description: e.description ? e.description.slice(0, 4000) : null,
      importance: 0,
      urgency: 0,
      xp_value: look?.xp ?? 15,
      coin_value: look && look.coins !== undefined ? look.coins : 1,
      estimate_minutes: minutes,
      is_on_calendar: true,
      scheduled_start: e.start,
      scheduled_end: e.end,
      google_calendar_event_id: e.id,
      ...(look?.iconKey ? { icon_key: look.iconKey, icon_source: look.iconSource ?? "library" } : {}),
      ...(look?.boardId ? { board_id: look.boardId } : {}),
      ...(look?.color ? { color: look.color } : {}),
    };
  });
  const { data, error } = await db.from("tasks").insert(rows).select("*");
  if (error || !data) {
    console.warn("Couldn't make quests from calendar events:", error?.message);
    return [];
  }
  const tasks = data as Task[];
  const cardLooks = { ...((extras.calCardLooks as Record<string, unknown> | undefined) ?? {}) };
  for (const t of tasks) {
    const e = fresh.find((x) => x.id === t.google_calendar_event_id);
    if (!e) continue;
    made[e.id] = t.id;
    if (e.recurringEventId) {
      const key = `g:${e.recurringEventId}`;
      series[t.id] = key;
      const card = lookFor(looks[key], dayOf(e.start))?.card;
      if (card) cardLooks[t.id] = card;
    }
  }
  // Merge into the latest copy (another load may have written meanwhile).
  const { data: cur } = await db.from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const latest = cur?.life_wheel ?? {};
  const latestSettings = readEventQuestSettings(latest);
  await db
    .from("profiles")
    .update({
      life_wheel: {
        ...latest,
        eventQuests: { ...latestSettings, made: pruneMade({ ...(latestSettings.made ?? {}), ...made }) },
        questSeries: { ...((latest.questSeries as Record<string, string> | undefined) ?? {}), ...series },
        calCardLooks: { ...((latest.calCardLooks as Record<string, unknown> | undefined) ?? {}), ...cardLooks },
      },
    })
    .eq("id", ownerId);
  return tasks;
}
