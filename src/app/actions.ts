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
import * as avatarLibraryData from "@/lib/data/avatar-library";
import * as taskIconLibraryData from "@/lib/data/task-icon-library";
import * as rewardsData from "@/lib/data/rewards";
import * as xp from "@/lib/data/xp";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateAndStoreImage, buildAvatarPrompt, buildTaskIconPrompt, buildSketchbookIconPrompt } from "@/lib/ai-image";
import { styleLook, AVATAR_STYLE_OPTIONS, STYLE_EXAMPLE_SUBJECT } from "@/lib/avatar-prompts";
import { exportAccountData, type AccountExport } from "@/lib/data/export";
import type { TaskIconLibraryEntry } from "@/lib/data/types";
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

  const parentBoardId = String(formData.get("parentBoardId") || "").trim() || null;
  if (parentBoardId) {
    const parent = await boardsData.getBoard(parentBoardId, ownerId);
    if (!parent) throw new Error("Parent board not found");
  }

  await boardsData.createBoard(ownerId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
    color: String(formData.get("color") || "").trim() || undefined,
    parentBoardId,
  });

  revalidatePath("/boards");
  if (parentBoardId) revalidatePath(`/boards/${parentBoardId}`);
}

/** Edits an existing board's own fields (title/description/color). */
export async function updateBoardAction(
  boardId: string,
  input: { title: string; description: string; color: string | null }
) {
  const ownerId = await requireProfileId();
  await boardsData.updateBoard(boardId, ownerId, {
    title: input.title,
    description: input.description.trim() || null,
    color: input.color,
  });
  revalidatePath("/boards");
  revalidatePath(`/boards/${boardId}`);
}

export async function reorderBoardsAction(orderedIds: string[], parentBoardId?: string | null) {
  const ownerId = await requireProfileId();
  await boardsData.updateBoardOrder(ownerId, orderedIds);
  revalidatePath("/boards");
  // Reordering a board's sub-boards grid only touches that board's own
  // page, not the top-level /boards list — revalidate it explicitly too,
  // or the drag would look like it silently didn't stick on next load.
  if (parentBoardId) revalidatePath(`/boards/${parentBoardId}`);
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

export async function reorderGoalsAction(boardId: string, orderedIds: string[]) {
  const ownerId = await requireProfileId();
  await goalsData.updateGoalOrder(boardId, ownerId, orderedIds);
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
  const estimateRaw = String(formData.get("estimateMinutes") || "").trim();
  const estimateMinutes = estimateRaw ? Math.max(0, Number(estimateRaw)) : null;

  await tasksData.createTask(ownerId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
    importance: Number(formData.get("importance") || 3),
    urgency: Number(formData.get("urgency") || 3),
    xpValue,
    goalId,
    estimateMinutes,
  });

  revalidatePath("/");
  if (goalId) {
    const goal = await goalsData.getGoal(goalId, ownerId);
    if (goal) revalidatePath(`/boards/${goal.board_id}`);
  }
}

/**
 * Quick-add straight into Today's Battle/Focus (the "+" beside that
 * heading): creates a plain task and immediately pins it as a manual
 * priority, subject to the existing 3-item cap.
 */
export async function createPriorityTaskAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Title is required");

  const task = await tasksData.createTask(ownerId, { title });
  await tasksData.setManualPriority(task.id, ownerId, true);
  revalidatePath("/");
}

export async function toggleManualPriorityAction(
  taskId: string,
  nextValue: boolean
) {
  const ownerId = await requireProfileId();
  await tasksData.setManualPriority(taskId, ownerId, nextValue);
  revalidatePath("/");
}

export async function reorderTasksAction(orderedIds: string[]) {
  const ownerId = await requireProfileId();
  await tasksData.updateTaskOrder(ownerId, orderedIds);
  revalidatePath("/");
}

/** Drag-to-set on the Priority Matrix: moves a task's dot to a new quadrant position. */
export async function updateTaskPriorityAction(
  taskId: string,
  importance: number,
  urgency: number
) {
  const ownerId = await requireProfileId();
  await tasksData.updateTaskPriority(taskId, ownerId, { importance, urgency });
  revalidatePath("/matrix");
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
  let totalXp: number | null = null;
  if (completed.xp_value > 0) {
    totalXp = (await xp.awardXp(ownerId, completed.xp_value, "task_completed", taskId)).totalXp;
  } else {
    totalXp = (await profilesData.getProfileById(ownerId))?.total_xp ?? null;
  }
  revalidatePath("/");
  revalidatePath("/matrix");
  // Lets the quest-complete celebration fill the XP bar to the real total.
  return { totalXp };
}

/** Full edit from the quest-card edit dialog (title/description/importance/urgency/xp/estimate). */
export async function updateTaskAction(
  taskId: string,
  input: {
    title: string;
    description: string;
    importance: number;
    urgency: number;
    xpValue: number;
    estimateMinutes?: number | null;
    /** Undefined leaves the goal untouched; null detaches it. */
    goalId?: string | null;
    grantsReward?: boolean;
    /** Also confirm this quest if it was an import awaiting review. */
    confirmImport?: boolean;
  }
) {
  const ownerId = await requireProfileId();
  if (input.grantsReward !== undefined) await tasksData.setTaskGrantsReward(taskId, ownerId, input.grantsReward);
  if (input.confirmImport) await rewardsData.markReviewed("quest", taskId, ownerId);
  // Editing a finished quest's XP adjusts the XP you already earned for it.
  const before = await tasksData.getTask(taskId, ownerId);
  if (before?.status === "completed" && before.xp_value !== input.xpValue) {
    await xp.awardXp(ownerId, input.xpValue - before.xp_value, "task_completed", taskId);
  }
  await tasksData.updateTask(taskId, ownerId, {
    title: input.title,
    description: input.description.trim() || null,
    importance: input.importance,
    urgency: input.urgency,
    xpValue: input.xpValue,
    estimateMinutes: input.estimateMinutes,
    goalId: input.goalId,
  });
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/boards", "layout");
}

/** Goals to file a quest under, labelled with their board. */
export async function listGoalOptionsAction() {
  const ownerId = await requireProfileId();
  return goalsData.listGoalOptionsForOwner(ownerId);
}

/** Deletion lives inside the edit dialog, not a separate control. */
export async function deleteTaskAction(taskId: string) {
  const ownerId = await requireProfileId();
  const task = await tasksData.getTask(taskId, ownerId);
  // Reverse any XP already awarded for a completed task so deleting it
  // can't be used to farm points and then remove the evidence.
  if (task?.status === "completed" && task.xp_value > 0) {
    await xp.awardXp(ownerId, -task.xp_value, "task_completed", taskId);
  }
  await tasksData.deleteTask(taskId, ownerId);
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/boards", "layout");
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
 * Shared by scheduleTaskAction and createScheduledTaskAction: creates the
 * Google Calendar event for a task's chosen time (or moves its existing
 * event, if it was already scheduled) and records the schedule on the task.
 */
async function attachCalendarEvent(
  accessToken: string,
  profileId: string,
  task: { id: string; title: string; description: string | null; google_calendar_event_id?: string | null },
  start: Date,
  end: Date
) {
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
  await tasksData.rescheduleTask(task.id, profileId, start.toISOString(), end.toISOString(), eventId);
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

  await attachCalendarEvent(accessToken, profileId, task, new Date(startISO), new Date(endISO));
  revalidatePath("/");
  revalidatePath("/calendar");
}

/**
 * Lists the user's open quests for the calendar's "add existing quest
 * instead" search — deliberately includes already-scheduled ones too (an
 * open quest can always be re-slotted into a new time from here).
 */
export async function listSchedulableTasksAction() {
  const ownerId = await requireProfileId();
  return tasksData.listOpenTasksForOwner(ownerId);
}

/**
 * Calendar drag-to-add: creates a brand-new quest already scheduled at the
 * dragged time range, in one step — the "new quest" half of the calendar's
 * drag-a-time-range popup (the other half, scheduling an *existing* quest
 * into that range, is scheduleTaskAction above).
 */
export async function createScheduledTaskAction(formData: FormData) {
  const { profileId, accessToken } = await requireSessionWithGoogle();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Task title is required");
  const startISO = String(formData.get("startISO") || "");
  const endISO = String(formData.get("endISO") || "");
  if (!startISO || !endISO) throw new Error("Start and end time are required");

  const goalId = String(formData.get("goalId") || "") || null;
  const xpValue = Math.max(0, Number(formData.get("xpValue") || 0));
  const estimateRaw = String(formData.get("estimateMinutes") || "").trim();
  const estimateMinutes = estimateRaw ? Math.max(0, Number(estimateRaw)) : null;

  const task = await tasksData.createTask(profileId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
    importance: Number(formData.get("importance") || 3),
    urgency: Number(formData.get("urgency") || 3),
    xpValue,
    goalId,
    estimateMinutes,
  });

  await attachCalendarEvent(accessToken, profileId, task, new Date(startISO), new Date(endISO));

  revalidatePath("/");
  revalidatePath("/calendar");
  if (goalId) {
    const goal = await goalsData.getGoal(goalId, profileId);
    if (goal) revalidatePath(`/boards/${goal.board_id}`);
  }
}

/**
 * Turns one of the user's real Google Calendar appointments into a quest:
 * creates a task already scheduled at the event's time, linked to the same
 * Google event id so it's recognized as "already a quest" and not shown
 * twice as a raw calendar event.
 */
export async function convertCalendarEventToTaskAction(input: {
  googleEventId: string;
  title: string;
  description?: string;
  startISO: string;
  endISO: string;
}) {
  const ownerId = await requireProfileId();
  const task = await tasksData.createTask(ownerId, {
    title: input.title,
    description: input.description,
  });
  await tasksData.rescheduleTask(task.id, ownerId, input.startISO, input.endISO, input.googleEventId);
  revalidatePath("/calendar");
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

// ---------------------------------------------------------------------------
// Theme + avatar (Priority #10)
// ---------------------------------------------------------------------------
export async function updateThemeAction(theme: "calm" | "adventure") {
  const ownerId = await requireProfileId();
  await profilesData.updateProfileTheme(ownerId, theme);
  revalidatePath("/", "layout");
}

/** Picking an avatar straight from the shared library (a preset or someone
 * else's generated one) — no new image is created, just a URL swap. */
export async function pickAvatarFromLibraryAction(imageUrl: string) {
  const ownerId = await requireProfileId();
  await profilesData.updateProfileAvatarImage(ownerId, imageUrl);
  revalidatePath("/", "layout");
}

export async function updateProfilePrivacyAction(isPublic: boolean) {
  const ownerId = await requireProfileId();
  await profilesData.updateProfilePrivacy(ownerId, isPublic);
  revalidatePath("/settings");
  revalidatePath("/feed");
}

export async function setTaskIconAction(
  taskId: string,
  iconKey: string | null,
  iconSource: "monster" | "library" | "ai"
) {
  const ownerId = await requireProfileId();
  await tasksData.setTaskIcon(taskId, ownerId, { iconKey, iconSource });
  revalidatePath("/");
  revalidatePath("/matrix");
}

/** The shared quest-icon library (presets + everyone's generated icons),
 * for IconPicker's "Library" tab. Fetched lazily on demand rather than
 * plumbed as a prop, since IconPicker is mounted deep inside every task
 * card across several pages. */
export async function listTaskIconLibraryAction(): Promise<TaskIconLibraryEntry[]> {
  await requireProfileId();
  return taskIconLibraryData.listTaskIconLibrary();
}

/** Picking a task icon straight from the shared library (a preset or
 * someone else's generated one) — no new image is created, just a URL
 * swap, same as pickAvatarFromLibraryAction. */
export async function pickTaskIconFromLibraryAction(taskId: string, imageUrl: string) {
  const ownerId = await requireProfileId();
  await tasksData.setTaskIcon(taskId, ownerId, { iconKey: imageUrl, iconSource: "library" });
  revalidatePath("/");
  revalidatePath("/matrix");
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
export async function generateAvatarImageAction(
  prompt: string,
  withBackground = false,
  style: string | null = null
) {
  const ownerId = await requireProfileId();
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Describe what you want your avatar to look like first.");

  const fullPrompt = buildAvatarPrompt(trimmed, { withBackground, look: styleLook(style) });
  const url = await generateAndStoreImage(fullPrompt, `avatars/${ownerId}-${Date.now()}.jpg`, {
    transparentBackground: !withBackground,
    pixelate: style === "pixel" ? 48 : undefined,
  });
  await profilesData.updateProfileAvatarImage(ownerId, url);
  await avatarLibraryData.addAvatarToLibrary({ imageUrl: url, createdBy: ownerId, prompt: trimmed });
  revalidatePath("/", "layout");
  revalidatePath("/settings/avatar");
  return url;
}

export async function clearAvatarImageAction() {
  const ownerId = await requireProfileId();
  await profilesData.updateProfileAvatarImage(ownerId, null);
  revalidatePath("/", "layout");
}

/** Updates the profile's display name — the "character name" shown on the
 * Friend Feed, in comments, and atop the Settings profile card. */
export async function updateProfileNameAction(name: string) {
  const ownerId = await requireProfileId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a name first.");
  await profilesData.updateProfileName(ownerId, trimmed);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Full account data export (local -> published migration)
// ---------------------------------------------------------------------------
export async function exportAccountDataAction(): Promise<AccountExport> {
  const ownerId = await requireProfileId();
  return exportAccountData(ownerId);
}

export async function generateTaskIconAction(taskId: string, prompt: string) {
  const ownerId = await requireProfileId();
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Describe the monster/icon you want first.");

  const url = await generateAndStoreImage(
    buildTaskIconPrompt(trimmed),
    `tasks/${taskId}-${Date.now()}.jpg`,
    { transparentBackground: true }
  );
  await tasksData.setTaskIcon(taskId, ownerId, { iconKey: url, iconSource: "ai" });
  await taskIconLibraryData.addTaskIconToLibrary({ imageUrl: url, createdBy: ownerId, prompt: trimmed });
  revalidatePath("/");
  revalidatePath("/matrix");
  return url;
}

/** Remove one image from the shared avatar library. Profiles already using
 * it keep their avatar — only the library tile goes away. */
export async function removeAvatarFromLibraryAction(id: string) {
  await requireProfileId();
  await avatarLibraryData.removeAvatarFromLibrary(id);
  revalidatePath("/settings/avatar");
}

/**
 * Create a quest from the quest editor dialog. Optionally pins it to Today's
 * Battle, or places it on the calendar (e.g. when turning a Google Calendar
 * event into a quest). Returns the new quest's id.
 */
export async function createQuestAction(input: {
  title: string;
  description?: string;
  importance: number;
  urgency: number;
  xpValue: number;
  estimateMinutes?: number | null;
  goalId?: string | null;
  iconKey?: string | null;
  iconSource?: "library" | "ai";
  pinToBattle?: boolean;
  grantsReward?: boolean;
  schedule?: { startISO: string; endISO: string; googleEventId?: string };
}): Promise<string> {
  const ownerId = await requireProfileId();
  const title = input.title.trim();
  if (!title) throw new Error("Give your quest a title first.");
  const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n * 10) / 10));
  const task = await tasksData.createTask(ownerId, {
    title,
    description: input.description?.trim() || undefined,
    importance: clamp(input.importance),
    urgency: clamp(input.urgency),
    xpValue: Math.max(0, Math.round(input.xpValue)),
    goalId: input.goalId ?? null,
    estimateMinutes: input.estimateMinutes ?? null,
    iconKey: input.iconKey ?? null,
    iconSource: input.iconSource,
  });
  if (input.schedule) {
    const session = await auth();
    if (!input.schedule.googleEventId && session?.googleAccessToken) {
      // New time picked in the quest editor: also put it on Google Calendar.
      await attachCalendarEvent(
        session.googleAccessToken,
        ownerId,
        task,
        new Date(input.schedule.startISO),
        new Date(input.schedule.endISO)
      );
    } else {
      await tasksData.rescheduleTask(
        task.id,
        ownerId,
        input.schedule.startISO,
        input.schedule.endISO,
        input.schedule.googleEventId
      );
    }
  }
  if (input.pinToBattle) {
    await tasksData.setManualPriority(task.id, ownerId, true);
  }
  if (input.grantsReward) {
    await tasksData.setTaskGrantsReward(task.id, ownerId, true);
  }
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/calendar");
  if (input.goalId) {
    const goal = await goalsData.getGoal(input.goalId, ownerId);
    if (goal) revalidatePath(`/boards/${goal.board_id}`);
  }
  return task.id;
}

/** Generate a quest portrait without attaching it to a quest yet (the create
 * dialog, before the quest exists). Added to the shared icon library. */
export async function generateQuestIconImageAction(prompt: string): Promise<string> {
  const ownerId = await requireProfileId();
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Describe the monster/icon you want first.");
  const url = await generateAndStoreImage(buildTaskIconPrompt(trimmed), `tasks/draft-${ownerId}-${Date.now()}.jpg`, {
    transparentBackground: true,
  });
  await taskIconLibraryData.addTaskIconToLibrary({ imageUrl: url, createdBy: ownerId, prompt: trimmed });
  return url;
}

/**
 * Example portrait for each art style (same subject in every style), made
 * once and cached in storage at a fixed path. Returns { styleKey: url }.
 */
export async function ensureStyleExamplesAction(): Promise<Record<string, string>> {
  await requireProfileId();
  const out: Record<string, string> = {};
  const db = supabaseAdmin();
  const { data: existing } = await db.storage.from("ai-images").list("style-examples");
  const have = new Set((existing ?? []).map((f: { name: string }) => f.name));
  for (const style of AVATAR_STYLE_OPTIONS) {
    // Heroic keeps the v2 example Nathan liked.
    const version = style.key === "heroic" ? "v2" : "v6";
    const name = `${style.key}-${version}.png`;
    if (have.has(name)) {
      out[style.key] = db.storage.from("ai-images").getPublicUrl(`style-examples/${name}`).data.publicUrl;
      continue;
    }
    out[style.key] = await generateAndStoreImage(
      buildAvatarPrompt(STYLE_EXAMPLE_SUBJECT, { withBackground: false, look: style.look }),
      `style-examples/${style.key}-${version}.jpg`,
      { transparentBackground: true, pixelate: style.key === "pixel" ? 48 : undefined }
    );
  }
  return out;
}

/** Remove one image from the shared quest-icon library (quests already using it keep it). */
export async function removeTaskIconFromLibraryAction(id: string) {
  await requireProfileId();
  await taskIconLibraryData.removeTaskIconFromLibrary(id);
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------
export async function createRewardAction(input: { title: string; description?: string; iconKey?: string | null }) {
  const ownerId = await requireProfileId();
  const title = input.title.trim();
  if (!title) throw new Error("Give the reward a name first.");
  const reward = await rewardsData.createReward(ownerId, { title, description: input.description?.trim() || null, iconKey: input.iconKey });
  revalidatePath("/rewards");
  return reward.id;
}

export async function updateRewardAction(
  rewardId: string,
  input: { title: string; description: string; iconKey?: string | null; confirmImport?: boolean }
) {
  const ownerId = await requireProfileId();
  const title = input.title.trim();
  if (!title) throw new Error("Give the reward a name first.");
  await rewardsData.updateReward(rewardId, ownerId, {
    title,
    description: input.description.trim() || null,
    iconKey: input.iconKey,
    needsReview: input.confirmImport ? false : undefined,
  });
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
}

export async function deleteRewardAction(rewardId: string) {
  const ownerId = await requireProfileId();
  await rewardsData.deleteReward(rewardId, ownerId);
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
}

export async function listAvailableRewardsAction() {
  const ownerId = await requireProfileId();
  return (await rewardsData.listRewards(ownerId)).filter((r) => r.status === "available");
}

/** Pick a reward after finishing a reward-granting quest (or claim one directly). */
export async function claimRewardAction(rewardId: string, taskId: string | null) {
  const ownerId = await requireProfileId();
  await rewardsData.claimReward(rewardId, ownerId, taskId);
  revalidatePath("/rewards");
  revalidatePath("/");
}

export async function unclaimRewardAction(rewardId: string) {
  const ownerId = await requireProfileId();
  await rewardsData.unclaimReward(rewardId, ownerId);
  revalidatePath("/rewards");
  revalidatePath("/");
}

export async function setTaskGrantsRewardAction(taskId: string, grantsReward: boolean) {
  const ownerId = await requireProfileId();
  await tasksData.setTaskGrantsReward(taskId, ownerId, grantsReward);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Imports (quests/rewards added for you, reviewed one by one)
// ---------------------------------------------------------------------------
export async function listImportsAction() {
  const ownerId = await requireProfileId();
  return rewardsData.listImports(ownerId);
}

export async function confirmImportAction(kind: "quest" | "reward", id: string) {
  const ownerId = await requireProfileId();
  await rewardsData.markReviewed(kind, id, ownerId);
  revalidatePath("/", "layout");
}

/**
 * Makes the sketchbook portrait for ONE import that still needs one, and
 * returns what's left (the client calls this repeatedly, one image per
 * request, so no single request runs long).
 */
export async function generateNextImportIconAction(): Promise<{ done: boolean; id?: string; url?: string }> {
  const ownerId = await requireProfileId();
  const next = await rewardsData.nextImportNeedingIcon(ownerId);
  if (!next) return { done: true };
  const url = await generateAndStoreImage(
    buildSketchbookIconPrompt(next.prompt),
    `${next.kind === "quest" ? "tasks" : "rewards"}/${next.id}-${Date.now()}.jpg`,
    { transparentBackground: true }
  );
  await rewardsData.setImportIcon(next.kind, next.id, ownerId, url);
  await taskIconLibraryData.addTaskIconToLibrary({ imageUrl: url, createdBy: ownerId, prompt: next.prompt });
  return { done: false, id: next.id, url };
}
