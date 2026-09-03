"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import * as boardsData from "@/lib/data/boards";
import * as goalsData from "@/lib/data/goals";
import * as tasksData from "@/lib/data/tasks";
import * as friendshipsData from "@/lib/data/friendships";
import * as invitesData from "@/lib/data/invites";
import * as activityData from "@/lib/data/activity";
import * as notificationsData from "@/lib/data/notifications";
import * as profilesData from "@/lib/data/profiles";
import * as xp from "@/lib/data/xp";
import { sendEmail } from "@/lib/email";
import { findOpenSlots, type Interval } from "@/lib/scheduling";
import {
  listBusyIntervals,
  createCalendarEvent,
  updateCalendarEvent,
} from "@/lib/google-calendar";

async function requireProfileId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

async function requireIdentity(): Promise<{ id: string; name: string }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return { id: session.user.id, name: session.user.name || session.user.email || "Someone" };
}

async function requireSessionWithGoogle() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (!session.googleAccessToken) {
    throw new Error(
      "No Google Calendar access token on this session — sign out and back in to grant Calendar access."
    );
  }
  return { profileId: session.user.id, accessToken: session.googleAccessToken };
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------
export async function createBoardAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Board title is required");

  await boardsData.createBoard(ownerId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
    color: String(formData.get("color") || "").trim() || undefined,
  });

  revalidatePath("/boards");
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
export async function createGoalAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const boardId = String(formData.get("boardId") || "");
  const title = String(formData.get("title") || "").trim();
  if (!boardId || !title) throw new Error("Board and goal title are required");

  await goalsData.createGoal(ownerId, boardId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
  });

  revalidatePath(`/boards/${boardId}`);
}

export async function updateGoalProgressAction(
  goalId: string,
  boardId: string,
  progress: number
) {
  const ownerId = await requireProfileId();
  await goalsData.updateGoalProgress(goalId, ownerId, progress);
  revalidatePath(`/boards/${boardId}`);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function createTaskAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Task title is required");

  const goalId = String(formData.get("goalId") || "") || null;
  const xpValue = Math.max(0, Number(formData.get("xpValue") || 0));

  const task = await tasksData.createTask(ownerId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
    importance: Number(formData.get("importance") || 3),
    urgency: Number(formData.get("urgency") || 3),
    xpValue,
    goalId,
  });

  // Enforce the weekly XP budget *after* creating the task so a rejection
  // doesn't orphan a half-written row; on rejection we roll the task's xp
  // back to 0 rather than deleting it (title/description work still stands).
  if (xpValue > 0) {
    try {
      await xp.recordTaskXpAssignment(ownerId, task.id, xpValue);
    } catch (err) {
      await tasksData.setTaskXpValue(task.id, ownerId, 0);
      revalidatePath("/");
      throw err;
    }
  }

  revalidatePath("/");
  if (goalId) {
    const goal = await goalsData.getGoal(goalId, ownerId);
    if (goal) revalidatePath(`/boards/${goal.board_id}`);
  }
}

export async function toggleManualPriorityAction(
  taskId: string,
  nextValue: boolean
) {
  const ownerId = await requireProfileId();
  await tasksData.setManualPriority(taskId, ownerId, nextValue);
  revalidatePath("/");
}

export async function completeTaskAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const taskId = String(formData.get("taskId") || "");
  const completedAtRaw = String(formData.get("completedAt") || "");
  const completedAt = completedAtRaw
    ? new Date(completedAtRaw).toISOString()
    : undefined;

  const completed = await tasksData.completeTask(taskId, ownerId, completedAt);
  if (completed.xp_value > 0) {
    await xp.awardXp(ownerId, completed.xp_value, "task_completed", taskId);
  }
  revalidatePath("/");
  revalidatePath("/matrix");
}

export async function reopenTaskAction(taskId: string) {
  const ownerId = await requireProfileId();
  const before = await tasksData.getTask(taskId, ownerId);
  await tasksData.reopenTask(taskId, ownerId);
  // Undo the completion XP so re-completing later doesn't farm points.
  if (before?.status === "completed" && before.xp_value > 0) {
    await xp.awardXp(ownerId, -before.xp_value, "task_completed", taskId);
  }
  revalidatePath("/");
  revalidatePath("/matrix");
}

// ---------------------------------------------------------------------------
// Pull-to-calendar (Priority #4)
// ---------------------------------------------------------------------------

/**
 * Suggests the next 3 open Google Calendar slots for a task, per the spec's
 * "v1 logic: treat all open gaps as available" rule. Purely a suggestion —
 * nothing is written until scheduleTaskAction is called with a chosen slot.
 */
export async function suggestSlotsAction(
  durationMinutes = 30
): Promise<{ start: string; end: string }[]> {
  const { accessToken } = await requireSessionWithGoogle();

  const from = new Date();
  const horizonEnd = new Date(from.getTime() + 14 * 86_400_000);
  const busy = await listBusyIntervals(accessToken, from, horizonEnd);

  const slots = findOpenSlots(busy, { from, durationMinutes, horizonDays: 14, maxSlots: 3 });
  return slots.map((s: Interval) => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
  }));
}

/**
 * Pulls a task onto the calendar at the given start/end — either one of the
 * suggested slots or a manually chosen time. Creates a real Google Calendar
 * event (or moves the existing one if the task was already scheduled) and
 * bumps reschedule_count via rescheduleTask when it's a re-pull.
 */
export async function scheduleTaskAction(
  taskId: string,
  startISO: string,
  endISO: string
) {
  const { profileId, accessToken } = await requireSessionWithGoogle();

  const task = await tasksData.getTask(taskId, profileId);
  if (!task) throw new Error("Task not found");

  const start = new Date(startISO);
  const end = new Date(endISO);

  let eventId = task.google_calendar_event_id ?? undefined;
  if (eventId) {
    await updateCalendarEvent(accessToken, eventId, { start, end });
  } else {
    eventId = await createCalendarEvent(accessToken, {
      title: task.title,
      description: task.description ?? undefined,
      start,
      end,
    });
  }

  await tasksData.rescheduleTask(taskId, profileId, start.toISOString(), end.toISOString(), eventId);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Social: friend directory, requests, invite links (Priority #7)
// ---------------------------------------------------------------------------
export async function sendFriendRequestAction(addresseeId: string) {
  const { id: requesterId, name } = await requireIdentity();
  const friendship = await friendshipsData.sendFriendRequest(requesterId, addresseeId);
  await notificationsData.createNotification({
    profileId: addresseeId,
    actorId: requesterId,
    kind: "friend_request",
    body: `${name} sent you a friend request.`,
    friendshipId: friendship.id,
  });
  revalidatePath("/feed");
}

export async function respondFriendRequestAction(friendshipId: string, accept: boolean) {
  const { id: addresseeId, name } = await requireIdentity();
  const friendship = await friendshipsData.respondToFriendRequest(friendshipId, addresseeId, accept);
  if (accept) {
    await notificationsData.createNotification({
      profileId: friendship.requester_id,
      actorId: addresseeId,
      kind: "friend_request_accepted",
      body: `${name} accepted your friend request.`,
      friendshipId: friendship.id,
    });
  }
  revalidatePath("/feed");
}

export async function removeFriendAction(friendshipId: string) {
  const ownerId = await requireProfileId();
  await friendshipsData.removeFriendship(friendshipId, ownerId);
  revalidatePath("/feed");
}

/**
 * Accepts an invite link: creates (or upgrades to) an accepted friendship
 * between the visitor and whoever created the link, then bumps its use
 * count. Safe to call more than once (idempotent-ish — a repeat visit just
 * re-affirms an existing friendship rather than erroring).
 */
export async function acceptInviteAction(code: string) {
  const { id: profileId, name } = await requireIdentity();
  const invite = await invitesData.getInviteByCode(code);
  if (!invite) throw new Error("This invite link is invalid or has expired.");
  if (invite.created_by === profileId) {
    throw new Error("This is your own invite link — share it with a friend instead.");
  }

  const existing = await friendshipsData.getFriendshipMap(profileId);
  const already = existing.get(invite.created_by);
  if (!already || already.status !== "accepted") {
    if (already) {
      await friendshipsData.respondToFriendRequest(already.id, profileId, true);
    } else {
      const friendship = await friendshipsData.sendFriendRequest(invite.created_by, profileId);
      await friendshipsData.respondToFriendRequest(friendship.id, profileId, true);
    }
    await invitesData.incrementInviteUse(invite.id);
    await notificationsData.createNotification({
      profileId: invite.created_by,
      actorId: profileId,
      kind: "friend_request_accepted",
      body: `${name} joined using your invite link and is now your friend.`,
    });
  }

  revalidatePath("/feed");
}

// ---------------------------------------------------------------------------
// Social: activity feed reactions + comments (Priority #7)
// ---------------------------------------------------------------------------
export async function addReactionAction(activityId: string, emoji: string) {
  const { id: profileId, name } = await requireIdentity();
  await activityData.addReaction(activityId, profileId, emoji);

  const ownerId = await activityData.getActivityOwner(activityId);
  if (ownerId) {
    await notificationsData.createNotification({
      profileId: ownerId,
      actorId: profileId,
      kind: "reaction",
      body: `${name} reacted ${emoji} to your activity.`,
      activityId,
    });
  }
  revalidatePath("/feed");
}

export async function removeReactionAction(activityId: string, emoji: string) {
  const profileId = await requireProfileId();
  await activityData.removeReaction(activityId, profileId, emoji);
  revalidatePath("/feed");
}

export async function addCommentAction(formData: FormData) {
  const { id: profileId, name } = await requireIdentity();
  const activityId = String(formData.get("activityId") || "");
  const body = String(formData.get("body") || "");
  if (!activityId) throw new Error("Missing activity");

  await activityData.addComment(activityId, profileId, body);

  const ownerId = await activityData.getActivityOwner(activityId);
  if (ownerId) {
    const notification = await notificationsData.createNotification({
      profileId: ownerId,
      actorId: profileId,
      kind: "comment",
      body: `${name} commented: "${body.slice(0, 120)}"`,
      activityId,
    });

    // Comments are a "higher-value moment" per the spec (a real cheer, not
    // just a tap) — worth an email in addition to the in-app notification.
    if (notification) {
      const owner = await profilesData.getProfileById(ownerId);
      if (owner) {
        const sent = await sendEmail({
          to: owner.email,
          subject: `${name} commented on your activity`,
          html: `<p><strong>${escapeHtml(name)}</strong> commented on your Goal Dashboard activity:</p><blockquote>${escapeHtml(body)}</blockquote>`,
        });
        if (sent) await notificationsData.markEmailSent(notification.id);
      }
    }
  }
  revalidatePath("/feed");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// ---------------------------------------------------------------------------
// XP / leveling (Priority #8)
// ---------------------------------------------------------------------------
export async function dailyCheckInAction(): Promise<xp.CheckInResult> {
  const ownerId = await requireProfileId();
  const result = await xp.dailyCheckIn(ownerId);
  revalidatePath("/");
  return result;
}

// ---------------------------------------------------------------------------
// Notifications (Priority #9)
// ---------------------------------------------------------------------------
export async function markNotificationReadAction(id: string) {
  const ownerId = await requireProfileId();
  await notificationsData.markRead(id, ownerId);
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const ownerId = await requireProfileId();
  await notificationsData.markAllRead(ownerId);
  revalidatePath("/notifications");
}
