import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AppNotification, NotificationKind } from "./types";

export async function createNotification(input: {
  profileId: string;
  actorId?: string | null;
  kind: NotificationKind;
  body: string;
  activityId?: string | null;
  taskId?: string | null;
  friendshipId?: string | null;
}): Promise<AppNotification | null> {
  // Never notify yourself about your own action (e.g. reacting to your own post).
  if (input.actorId && input.actorId === input.profileId) {
    return null;
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("notifications")
    .insert({
      profile_id: input.profileId,
      actor_id: input.actorId ?? null,
      kind: input.kind,
      body: input.body,
      activity_id: input.activityId ?? null,
      task_id: input.taskId ?? null,
      friendship_id: input.friendshipId ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create notification: ${error.message}`);
  return data;
}

export async function listForProfile(profileId: string, limit = 30): Promise<AppNotification[]> {
  await wakeSnoozed(profileId).catch(() => {});
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list notifications: ${error.message}`);
  return data ?? [];
}

/** Snoozed notifications whose time has come return as unread. */
export async function wakeSnoozed(profileId: string): Promise<void> {
  await supabaseAdmin()
    .from("notifications")
    .update({ is_read: false, snoozed_until: null })
    .eq("profile_id", profileId)
    .lte("snoozed_until", new Date().toISOString());
}

export async function snooze(id: string, profileId: string, untilISO: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("notifications")
    .update({ is_read: true, snoozed_until: untilISO })
    .eq("id", id)
    .eq("profile_id", profileId);
  if (error) throw new Error(/snoozed_until/.test(error.message) ? "Snoozing needs a quick database update first." : `Failed to snooze: ${error.message}`);
}

export async function countUnread(profileId: string): Promise<number> {
  await wakeSnoozed(profileId).catch(() => {});
  const db = supabaseAdmin();
  const { count, error } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("is_read", false);

  if (error) throw new Error(`Failed to count unread notifications: ${error.message}`);
  return count ?? 0;
}

export async function markRead(id: string, profileId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("profile_id", profileId);
  if (error) throw new Error(`Failed to mark notification read: ${error.message}`);
}

export async function markAllRead(profileId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("notifications")
    .update({ is_read: true })
    .eq("profile_id", profileId)
    .eq("is_read", false);
  if (error) throw new Error(`Failed to mark notifications read: ${error.message}`);
}

export async function markEmailSent(id: string): Promise<void> {
  const db = supabaseAdmin();
  await db.from("notifications").update({ email_sent: true }).eq("id", id);
}

/**
 * Keep one "new quests to prioritize" notification in step with the number
 * of imports waiting: created when new ones arrive, its count kept current,
 * and quietly marked read once nothing is left to sort.
 */
export async function syncImportsNotification(profileId: string, waiting: number): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("notifications")
    .select("id, body, is_read")
    .eq("profile_id", profileId)
    .eq("kind", "imports")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return;
  const latest = data?.[0] as { id: string; body: string; is_read: boolean } | undefined;
  const body = `${waiting} new ${waiting === 1 ? "quest" : "quests"} waiting for you to sort and prioritize`;
  if (waiting === 0) {
    if (latest && !latest.is_read) await db.from("notifications").update({ is_read: true }).eq("id", latest.id);
    return;
  }
  const lastCount = latest ? parseInt(latest.body, 10) || 0 : 0;
  if (latest && !latest.is_read) {
    if (lastCount !== waiting) await db.from("notifications").update({ body }).eq("id", latest.id);
    return;
  }
  if (!latest || waiting > lastCount) {
    await db.from("notifications").insert({ profile_id: profileId, kind: "imports", body });
  }
}
