import "server-only";

import { auth } from "@/auth";
import * as tasksData from "@/lib/data/tasks";
import { updateCalendarEvent, createCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar";
import type { GoogleSide } from "@/lib/data/calendar-ops";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Task } from "@/lib/data/types";
import type { CalCardLook } from "./evening";

export async function requireProfileId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

export async function requireIdentity(): Promise<{ id: string; name: string }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return { id: session.user.id, name: session.user.name || session.user.email || "Someone" };
}

/** Signed in; Google Calendar access too when it's been connected (else null). */
export async function requireSessionMaybeGoogle() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return { profileId: session.user.id, accessToken: session.googleAccessToken ?? null };
}

/**
 * Shared by scheduleTaskAction and createScheduledTaskAction: creates the
 * Google Calendar event for a task's chosen time (or moves its existing
 * event, if it was already scheduled) and records the schedule on the task.
 */
export async function attachCalendarEvent(
  /** Null when Google Calendar isn't connected: the time is kept in the app only. */
  accessToken: string | null,
  profileId: string,
  task: { id: string; title: string; description: string | null; google_calendar_event_id?: string | null },
  start: Date,
  end: Date,
  /** False while planning a day: moving a quest around isn't a reschedule. */
  countAsReschedule = true
) {
  const eventId = task.google_calendar_event_id ?? undefined;
  if (!accessToken) {
    await tasksData.rescheduleTask(task.id, profileId, start.toISOString(), end.toISOString(), eventId, countAsReschedule);
    return;
  }
  // The app's time first, Google after: a Google refusal (someone else's event, a deleted one, an expired
  // permission) never stops the quest from moving (calendar planner step 2b).
  await tasksData.rescheduleTask(task.id, profileId, start.toISOString(), end.toISOString(), eventId, countAsReschedule);
  if (eventId) {
    await updateCalendarEvent(accessToken, eventId, { start, end }).catch((e) => console.warn("Google didn't take the move:", e instanceof Error ? e.message : e));
  } else {
    const made = await createCalendarEvent(accessToken, {
      title: task.title,
      description: task.description ?? undefined,
      start,
      end,
    }).catch(() => null);
    if (made) await supabaseAdmin().from("tasks").update({ google_calendar_event_id: made }).eq("id", task.id).eq("owner_id", profileId).is("google_calendar_event_id", null);
  }
}

/**
 * Google's side of a calendar change (planner step 5): what `applyCalendarOps` does once the app's rows have
 * changed. Null when Google Calendar isn't connected. `keepEvent`: an event that stays on Google when its item
 * comes off (a quest made from someone else's meeting). Calendar blocks aren't sent to Google yet.
 */
export function googleSide(accessToken: string | null, profileId: string, opts: { keepEvent?: (eventId: string) => Promise<boolean> } = {}): GoogleSide | null {
  if (!accessToken) return null;
  const titleOf = async (table: string, row: Record<string, unknown>) => {
    if (table === "tasks") return { title: String(row.title ?? ""), description: (row.description as string | null) ?? undefined };
    const t = await tasksData.getTask(String(row.task_id), profileId);
    return { title: t?.title ?? "Quest", description: t?.description ?? undefined };
  };
  return {
    async placed(table, row) {
      if (table === "calendar_blocks") return null;
      const start = new Date(String(table === "tasks" ? row.scheduled_start : row.starts_at));
      const end = new Date(String(table === "tasks" ? row.scheduled_end : row.ends_at));
      const eventId = row.google_calendar_event_id as string | null;
      if (eventId) {
        await updateCalendarEvent(accessToken, eventId, { start, end });
        return null;
      }
      return createCalendarEvent(accessToken, { ...(await titleOf(table, row)), start, end });
    },
    async removed(table, before) {
      const eventId = before.google_calendar_event_id as string | null;
      if (table === "calendar_blocks" || !eventId) return;
      if (opts.keepEvent && (await opts.keepEvent(eventId))) return;
      await deleteCalendarEvent(accessToken, eventId);
    },
  };
}

/** Move one of a quest's further sessions (and its Google event; one is made if it had none). */
export async function moveSession(accessToken: string | null, profileId: string, sessionId: string, start: Date, end: Date) {
  const s = await tasksData.getTaskSession(sessionId, profileId);
  if (!s) throw new Error("That session isn't on the calendar anymore.");
  let eventId = s.google_calendar_event_id;
  if (accessToken) {
    try {
      if (eventId) await updateCalendarEvent(accessToken, eventId, { start, end });
      else {
        const t = await tasksData.getTask(s.task_id, profileId);
        if (t) eventId = await createCalendarEvent(accessToken, { title: t.title, description: t.description ?? undefined, start, end });
      }
    } catch {
      /* the app's own calendar still moves */
    }
  }
  await tasksData.updateTaskSession(sessionId, profileId, { starts_at: start.toISOString(), ends_at: end.toISOString(), google_calendar_event_id: eventId ?? null });
}

/**
 * "Generate once, then store it": calls the image-gen API exactly once per
 * click and immediately persists the result — never regenerated on view.
 * The result is also added to the shared avatar library so anyone can pick
 * it later.
 *
 * @param withBackground false (default) generates a transparent cutout;
 *   true keeps an illustrated scene behind the character instead.
 * @param style Optional art-style preset key (from AVATAR_STYLE_OPTIONS in
 *   avatar-prompts.ts) layered on top of the base epic/gritty prompt.
 */
/**
 * Portraits show on the shared Friend Feed, so they stay family-friendly:
 * explicit prompts are turned away before any painting happens.
 */
export const EXPLICIT_PROMPT = /\b(nude|nudes|naked|nsfw|topless|bottomless|porn\w*|sex|sexy|sexual|erotic\w*|genital\w*|penis|vagina|nipples?|boobs?|breasts?|lingerie|undress\w*|strip(per|ping)?|fetish\w*|hentai|xxx)\b/i;

export function assertFamilyFriendly(prompt: string) {
  if (EXPLICIT_PROMPT.test(prompt)) throw new Error("Let's keep portraits family-friendly. Try a different description.");
}

// Evening routine (rites)
export function assertDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Bad day.");
}

export type Priority = { text: string; others?: string[]; day: string; at: string };

/** Your top priorities, newest first (one per day). */
export function cleanPriorities(raw: unknown): Priority[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((p): p is Priority => !!p && typeof p.text === "string" && typeof p.day === "string" && typeof p.at === "string")
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

// Quest templates (kept with your other personal extras)
export async function readExtras(ownerId: string) {
  const { data } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  return data?.life_wheel ?? {};
}

export const QUEST_ID = /^[0-9a-f-]{36}$/i;

export type LookTask = Pick<Task, "id" | "title" | "icon_key" | "icon_source" | "xp_value" | "coin_value" | "board_id" | "color" | "scheduled_start" | "status">;

export function lookOf(t: LookTask, card: CalCardLook | null): import("@/lib/series-look").SeriesLook {
  return { iconKey: t.icon_key, iconSource: t.icon_source, xp: t.xp_value, coins: t.coin_value ?? null, boardId: t.board_id, color: t.color, card };
}

/** A quest map's look and how far ahead it shows (per board). */
// The toucan as a guide: it watches for important quests slipping, and talks.
export async function guideTasks(ownerId: string, opts: { imports?: boolean } = {}) {
  const db = supabaseAdmin();
  const [tasks, boards, imports] = await Promise.all([
    tasksData.listOpenTasksWithBoardForOwner(ownerId),
    db.from("boards").select("id, title, parent_board_id").eq("owner_id", ownerId),
    // Imported quests (a syllabus, say) still waiting to be sorted are real work too.
    opts.imports ? db.from("tasks").select("*").eq("owner_id", ownerId).eq("status", "open").eq("needs_review", true) : Promise.resolve({ data: [] as Task[] }),
  ]);
  const names = new Map(((boards.data ?? []) as { id: string; title: string }[]).map((b) => [b.id, b.title]));
  const seen = new Set<string>();
  const all = [...tasks, ...(((imports as { data: Task[] | null }).data ?? []) as Task[])].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  return all
    .filter((t) => opts.imports || !t.needs_review)
    .map((t) => ({
      id: t.id,
      title: t.title,
      importance: t.importance ?? null,
      urgency: t.urgency ?? null,
      due_at: t.due_at ?? null,
      estimate_minutes: t.estimate_minutes ?? null,
      scheduled_start: t.is_on_calendar ? (t.scheduled_start ?? null) : null,
      updated_at: t.updated_at ?? null,
      created_at: t.created_at ?? null,
      reschedule_count: t.reschedule_count ?? 0,
      board: t.board_id ? (names.get(t.board_id) ?? null) : null,
      board_id: t.board_id ?? null,
      needs_review: !!t.needs_review,
    }));
}
