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

export async function countUnread(profileId: string): Promise<number> {
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
