import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ActivityEvent, ActivityReaction, ActivityComment, Task, Goal } from "./types";

/**
 * Resolves whether a task's completion should be publicly visible in the
 * feed: goal-linked tasks inherit their goal's privacy (which itself
 * overrides the board default when explicitly set), standalone tasks fall
 * back to the owner's profile-level default.
 */
async function resolveTaskVisibility(ownerId: string, task: Pick<Task, "goal_id" | "board_id">): Promise<boolean> {
  const db = supabaseAdmin();
  if (task.board_id) {
    const { data: board } = await db.from("boards").select("is_private").eq("id", task.board_id).maybeSingle();
    return !(board?.is_private ?? false);
  }
  if (task.goal_id) {
    const { data: goal } = await db
      .from("goals")
      .select("is_private, board_id")
      .eq("id", task.goal_id)
      .maybeSingle();
    if (!goal) return true;
    if (goal.is_private) return false;
    const { data: board } = await db
      .from("boards")
      .select("is_private")
      .eq("id", goal.board_id)
      .maybeSingle();
    return !(board?.is_private ?? false);
  }
  const { data: profile } = await db
    .from("profiles")
    .select("is_public")
    .eq("id", ownerId)
    .maybeSingle();
  return profile?.is_public ?? true;
}

async function resolveGoalVisibility(goal: Pick<Goal, "is_private" | "board_id">): Promise<boolean> {
  if (goal.is_private) return false;
  const db = supabaseAdmin();
  const { data: board } = await db
    .from("boards")
    .select("is_private")
    .eq("id", goal.board_id)
    .maybeSingle();
  return !(board?.is_private ?? false);
}

export async function logTaskCompletedActivity(
  ownerId: string,
  task: Pick<Task, "id" | "goal_id" | "board_id">
): Promise<ActivityEvent> {
  const isPublic = await resolveTaskVisibility(ownerId, task);
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("activity_events")
    .insert({ owner_id: ownerId, kind: "task_completed", task_id: task.id, is_public: isPublic })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to log task completion activity: ${error.message}`);
  return data;
}

export async function logGoalCompletedActivity(
  ownerId: string,
  goal: Pick<Goal, "id" | "is_private" | "board_id">
): Promise<ActivityEvent> {
  const isPublic = await resolveGoalVisibility(goal);
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("activity_events")
    .insert({ owner_id: ownerId, kind: "goal_completed", goal_id: goal.id, is_public: isPublic })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to log goal completion activity: ${error.message}`);
  return data;
}

export async function logLevelUpActivity(ownerId: string, isPublic: boolean): Promise<ActivityEvent> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("activity_events")
    .insert({ owner_id: ownerId, kind: "level_up", is_public: isPublic })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to log level-up activity: ${error.message}`);
  return data;
}

export type FeedItem = ActivityEvent & {
  task_title: string | null;
  /** XP the finished quest earned. */
  task_xp: number | null;
  goal_title: string | null;
  reactions: ActivityReaction[];
  comments: ActivityComment[];
};

/**
 * Public activity from the given owner ids (self + friends), newest first.
 * Denormalizes task/goal titles and pulls reactions/comments in bulk so the
 * feed page doesn't N+1.
 */
export async function listFeed(ownerIds: string[], limit = 30): Promise<FeedItem[]> {
  if (ownerIds.length === 0) return [];
  const db = supabaseAdmin();

  const { data: events, error } = await db
    .from("activity_events")
    .select("*, tasks(title, xp_value, xp_awarded), goals(title)")
    .in("owner_id", ownerIds)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load feed: ${error.message}`);
  const rows = events ?? [];
  const ids = rows.map((r) => r.id);

  const [reactionsRes, commentsRes] = await Promise.all([
    ids.length
      ? db.from("activity_reactions").select("*").in("activity_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? db.from("activity_comments").select("*").in("activity_id", ids).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (reactionsRes.error) throw new Error(`Failed to load reactions: ${reactionsRes.error.message}`);
  if (commentsRes.error) throw new Error(`Failed to load comments: ${commentsRes.error.message}`);

  const reactionsByActivity = new Map<string, ActivityReaction[]>();
  for (const r of reactionsRes.data ?? []) {
    const list = reactionsByActivity.get(r.activity_id) ?? [];
    list.push(r);
    reactionsByActivity.set(r.activity_id, list);
  }
  const commentsByActivity = new Map<string, ActivityComment[]>();
  for (const c of commentsRes.data ?? []) {
    const list = commentsByActivity.get(c.activity_id) ?? [];
    list.push(c);
    commentsByActivity.set(c.activity_id, list);
  }

  return rows.map((row) => {
    const { tasks, goals, ...event } = row as ActivityEvent & {
      tasks: { title: string; xp_value: number | null; xp_awarded: number | null } | null;
      goals: { title: string } | null;
    };
    return {
      ...event,
      task_title: tasks?.title ?? null,
      task_xp: tasks ? (typeof tasks.xp_awarded === "number" ? tasks.xp_awarded : tasks.xp_value) : null,
      goal_title: goals?.title ?? null,
      reactions: reactionsByActivity.get(event.id) ?? [],
      comments: commentsByActivity.get(event.id) ?? [],
    };
  });
}

/** For notification fan-out: who owns the activity a reaction/comment landed on. */
export async function getActivityOwner(activityId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("activity_events")
    .select("owner_id, kind")
    .eq("id", activityId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load activity: ${error.message}`);
  return data?.owner_id ?? null;
}

export async function getActivity(activityId: string): Promise<ActivityEvent | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("activity_events")
    .select("*")
    .eq("id", activityId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load activity: ${error.message}`);
  return data;
}

export async function addReaction(
  activityId: string,
  profileId: string,
  emoji: string
): Promise<ActivityReaction> {
  const trimmed = emoji.trim();
  if (!trimmed) throw new Error("Pick an emoji first");
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("activity_reactions")
    .insert({ activity_id: activityId, profile_id: profileId, emoji: trimmed })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("You already reacted with that emoji");
    throw new Error(`Failed to add reaction: ${error.message}`);
  }
  return data;
}

export async function removeReaction(
  activityId: string,
  profileId: string,
  emoji: string
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("activity_reactions")
    .delete()
    .eq("activity_id", activityId)
    .eq("profile_id", profileId)
    .eq("emoji", emoji);
  if (error) throw new Error(`Failed to remove reaction: ${error.message}`);
}

export async function addComment(
  activityId: string,
  profileId: string,
  body: string
): Promise<ActivityComment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Comment can't be empty");
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("activity_comments")
    .insert({ activity_id: activityId, profile_id: profileId, body: trimmed })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to add comment: ${error.message}`);
  return data;
}

/** A few words naming an activity, for notifications: "finishing “Call Mike”". */
export async function describeActivity(activityId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("activity_events").select("kind, task_id, goal_id").eq("id", activityId).maybeSingle<{ kind: string; task_id: string | null; goal_id: string | null }>();
  if (!data) return null;
  if (data.kind === "level_up") return "your level-up";
  if (data.task_id) {
    const { data: t } = await db.from("tasks").select("title").eq("id", data.task_id).maybeSingle<{ title: string }>();
    if (t?.title) return `finishing “${t.title.slice(0, 80)}”`;
  }
  if (data.goal_id) {
    const { data: g } = await db.from("goals").select("title").eq("id", data.goal_id).maybeSingle<{ title: string }>();
    if (g?.title) return `completing “${g.title.slice(0, 80)}”`;
  }
  return null;
}

export type PartyWeekRow = { id: string; xp: number; quests: number; lastQuestAt: string | null };

/**
 * This week for each party member: XP earned (Monday on), quests finished,
 * and when they last finished one (for "who's been quiet").
 */
export async function partyWeek(memberIds: string[], weekStart: string): Promise<PartyWeekRow[]> {
  if (!memberIds.length) return [];
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [xpRes, doneRes] = await Promise.all([
    db.from("xp_events").select("owner_id, amount").in("owner_id", memberIds).eq("week_start", weekStart),
    db.from("tasks").select("owner_id, completed_at").in("owner_id", memberIds).eq("status", "completed").gte("completed_at", since),
  ]);
  if (xpRes.error) throw new Error(`Failed to load party XP: ${xpRes.error.message}`);
  if (doneRes.error) throw new Error(`Failed to load party quests: ${doneRes.error.message}`);
  const monday = new Date(`${weekStart}T00:00:00`).getTime();
  return memberIds.map((id) => {
    const done = (doneRes.data ?? []).filter((t) => t.owner_id === id && t.completed_at);
    const last = done.map((t) => t.completed_at as string).sort().pop() ?? null;
    return {
      id,
      xp: (xpRes.data ?? []).filter((r) => r.owner_id === id).reduce((n, r) => n + r.amount, 0),
      quests: done.filter((t) => new Date(t.completed_at as string).getTime() >= monday).length,
      lastQuestAt: last,
    };
  });
}
