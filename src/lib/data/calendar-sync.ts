import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createCalendarEvent } from "@/lib/google-calendar";

/**
 * Quests and sessions placed on the calendar without reaching Google (added from a chat with
 * Claude, or while Google wasn't connected) get their Google event the next time the calendar
 * opens (owner, Nov 6: "go to my Google Calendar when I add an event from here"). Upcoming ones
 * only, a few per load.
 */
export async function pushMissingGoogleEvents(accessToken: string, ownerId: string, until: Date): Promise<number> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const end = until.toISOString();
  const [tasksRes, sessRes] = await Promise.all([
    db
      .from("tasks")
      .select("id, title, description, scheduled_start, scheduled_end")
      .eq("owner_id", ownerId)
      .eq("status", "open")
      .eq("is_on_calendar", true)
      .is("google_calendar_event_id", null)
      .gt("scheduled_start", now)
      .lt("scheduled_start", end)
      .limit(6),
    db
      .from("task_sessions")
      .select("id, task_id, starts_at, ends_at")
      .eq("owner_id", ownerId)
      .is("google_calendar_event_id", null)
      .gt("starts_at", now)
      .lt("starts_at", end)
      .limit(6),
  ]);
  let made = 0;
  for (const t of (tasksRes.data ?? []) as { id: string; title: string; description: string | null; scheduled_start: string; scheduled_end: string | null }[]) {
    if (!t.scheduled_end) continue;
    const id = await createCalendarEvent(accessToken, { title: t.title, description: t.description ?? undefined, start: new Date(t.scheduled_start), end: new Date(t.scheduled_end) }).catch(() => null);
    if (!id) continue;
    // Only if still unlinked (another load may have just done it).
    await db.from("tasks").update({ google_calendar_event_id: id }).eq("id", t.id).eq("owner_id", ownerId).is("google_calendar_event_id", null);
    made++;
  }
  const sessions = (sessRes.data ?? []) as { id: string; task_id: string; starts_at: string; ends_at: string }[];
  if (sessions.length) {
    const { data: quests } = await db.from("tasks").select("id, title, description").eq("owner_id", ownerId).in("id", [...new Set(sessions.map((s) => s.task_id))]);
    const byId = new Map(((quests ?? []) as { id: string; title: string; description: string | null }[]).map((q) => [q.id, q]));
    for (const s of sessions) {
      const q = byId.get(s.task_id);
      if (!q) continue;
      const id = await createCalendarEvent(accessToken, { title: q.title, description: q.description ?? undefined, start: new Date(s.starts_at), end: new Date(s.ends_at) }).catch(() => null);
      if (!id) continue;
      await db.from("task_sessions").update({ google_calendar_event_id: id }).eq("id", s.id).eq("owner_id", ownerId).is("google_calendar_event_id", null);
      made++;
    }
  }
  return made;
}
