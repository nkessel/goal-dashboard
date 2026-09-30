import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Everything one account owns, in one JSON-serializable payload — for
 * migrating from a local dev instance to a published one (or just backing
 * up). Scoped strictly to rows this profile owns/authored; it does not
 * pull in other people's comments/reactions on the user's own activity, or
 * the other side of a friendship, since those belong to other accounts.
 */
export type AccountExport = {
  exportedAt: string;
  version: 1;
  profile: unknown;
  boards: unknown[];
  goals: unknown[];
  tasks: unknown[];
  friendships: unknown[];
  inviteLinks: unknown[];
  activityEvents: unknown[];
  activityReactions: unknown[];
  activityComments: unknown[];
  notifications: unknown[];
  xpEvents: unknown[];
};

async function selectAll(
  db: ReturnType<typeof supabaseAdmin>,
  table: string,
  column: string,
  value: string
) {
  const { data, error } = await db.from(table).select("*").eq(column, value);
  if (error) throw new Error(`Failed to export ${table}: ${error.message}`);
  return data ?? [];
}

export async function exportAccountData(profileId: string): Promise<AccountExport> {
  const db = supabaseAdmin();

  const [
    profileRes,
    boards,
    goals,
    tasks,
    friendshipsAsRequester,
    friendshipsAsAddressee,
    inviteLinks,
    activityEvents,
    activityReactions,
    activityComments,
    notifications,
    xpEvents,
  ] = await Promise.all([
    db.from("profiles").select("*").eq("id", profileId).maybeSingle(),
    selectAll(db, "boards", "owner_id", profileId),
    selectAll(db, "goals", "owner_id", profileId),
    selectAll(db, "tasks", "owner_id", profileId),
    selectAll(db, "friendships", "requester_id", profileId),
    selectAll(db, "friendships", "addressee_id", profileId),
    selectAll(db, "invite_links", "created_by", profileId),
    selectAll(db, "activity_events", "owner_id", profileId),
    selectAll(db, "activity_reactions", "profile_id", profileId),
    selectAll(db, "activity_comments", "profile_id", profileId),
    selectAll(db, "notifications", "profile_id", profileId),
    selectAll(db, "xp_events", "owner_id", profileId),
  ]);

  if (profileRes.error) throw new Error(`Failed to export profile: ${profileRes.error.message}`);

  const friendshipsById = new Map<string, unknown>();
  for (const f of [...friendshipsAsRequester, ...friendshipsAsAddressee]) {
    friendshipsById.set((f as { id: string }).id, f);
  }

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    profile: profileRes.data,
    boards,
    goals,
    tasks,
    friendships: [...friendshipsById.values()],
    inviteLinks,
    activityEvents,
    activityReactions,
    activityComments,
    notifications,
    xpEvents,
  };
}
