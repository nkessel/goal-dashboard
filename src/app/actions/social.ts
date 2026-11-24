"use server";

import * as friendshipsData from "@/lib/data/friendships";
import * as notificationsData from "@/lib/data/notifications";
import { revalidatePath } from "next/cache";
import * as invitesData from "@/lib/data/invites";
import * as activityData from "@/lib/data/activity";
import * as profilesData from "@/lib/data/profiles";
import { sendEmail } from "@/lib/email";
import * as forumData from "@/lib/data/forum";
import * as sharingData from "@/lib/data/sharing";
import { writeExtra } from "@/lib/data/extras";
import * as boardsData from "@/lib/data/boards";
import * as partyData from "@/lib/data/party";
import * as messagesData from "@/lib/data/messages";
import * as feedbackData from "@/lib/data/feedback";
import * as energyData from "@/lib/data/energy";
import * as winsData from "@/lib/data/wins";
import * as tomorrowData from "@/lib/data/tomorrow";
import * as xp from "@/lib/data/xp";
import * as ritesData from "@/lib/data/rites";
import { requireIdentity, requireProfileId, readExtras, assertDay } from "./_shared";
import { tickRiteStepAction } from "./coursework";
import { completeRiteAction, uncompleteRiteAction } from "./evening";

// Social: friend directory, requests, invite links (Priority #7)
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

/** Remove someone from your party (Guild Hall › This week in the party, owner Nov 9). */
export async function removePartyMemberAction(friendId: string) {
  const ownerId = await requireProfileId();
  await friendshipsData.removeFriendshipWith(friendId, ownerId);
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

// Social: activity feed reactions + comments (Priority #7)
/** How each cheer reads in a notification. */
const CHEER_WORDS: Record<string, string> = { "📣": "cried “Huzzah!” for", "👏": "saluted", "🥂": "raised a goblet to" };

export async function addReactionAction(activityId: string, emoji: string) {
  const { id: profileId, name } = await requireIdentity();
  await activityData.addReaction(activityId, profileId, emoji);

  const ownerId = await activityData.getActivityOwner(activityId);
  if (ownerId) {
    const what = await activityData.describeActivity(activityId).catch(() => null);
    await notificationsData.createNotification({
      profileId: ownerId,
      actorId: profileId,
      kind: "reaction",
      body: `${name} ${CHEER_WORDS[emoji] ?? `reacted ${emoji} to`} ${what ?? "your activity"}.`,
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
    const what = await activityData.describeActivity(activityId).catch(() => null);
    const notification = await notificationsData.createNotification({
      profileId: ownerId,
      actorId: profileId,
      kind: "comment",
      body: `${name} commented on ${what ?? "your activity"}: "${body.slice(0, 120)}"`,
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

// Notifications (Priority #9)
export async function markNotificationReadAction(id: string) {
  const ownerId = await requireProfileId();
  await notificationsData.markRead(id, ownerId);
  revalidatePath("/notifications");
}

/** Hide a notification for a while; it comes back unread afterwards. */
export async function snoozeNotificationAction(id: string, minutes: number) {
  const ownerId = await requireProfileId();
  const mins = Math.max(5, Math.min(60 * 24 * 14, Math.round(minutes)));
  await notificationsData.snooze(id, ownerId, new Date(Date.now() + mins * 60_000).toISOString());
  revalidatePath("/notifications");
}

export async function markNotificationUnreadAction(id: string) {
  const ownerId = await requireProfileId();
  await notificationsData.markUnread(id, ownerId);
  revalidatePath("/notifications");
}

export async function deleteNotificationAction(id: string) {
  const ownerId = await requireProfileId();
  await notificationsData.deleteNotification(id, ownerId);
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const ownerId = await requireProfileId();
  await notificationsData.markAllRead(ownerId);
  revalidatePath("/notifications");
}

// Forums (Party, Community, Feature ideas)
export async function createForumThreadAction(scope: forumData.ForumScope, title: string, body: string) {
  const ownerId = await requireProfileId();
  if (!forumData.SCOPES.includes(scope)) throw new Error("Unknown forum.");
  const t = await forumData.createThread(ownerId, scope, title, body);
  revalidatePath("/feed");
  return t.id;
}

export async function replyForumAction(threadId: string, body: string) {
  const ownerId = await requireProfileId();
  await forumData.reply(ownerId, threadId, body);
  revalidatePath(`/feed/forum/${threadId}`);
  revalidatePath("/feed");
}

export async function voteForumAction(threadId: string) {
  const ownerId = await requireProfileId();
  const res = await forumData.toggleVote(ownerId, threadId);
  revalidatePath("/feed");
  return res;
}

export async function deleteForumThreadAction(threadId: string) {
  const ownerId = await requireProfileId();
  await forumData.deleteThread(ownerId, threadId);
  revalidatePath("/feed");
}

export async function deleteForumPostAction(postId: string, threadId: string) {
  const ownerId = await requireProfileId();
  await forumData.deletePost(ownerId, postId);
  revalidatePath(`/feed/forum/${threadId}`);
}

export async function setIdeaStatusAction(threadId: string, status: forumData.IdeaStatus) {
  const ownerId = await requireProfileId();
  await forumData.setIdeaStatus(ownerId, threadId, status);
  revalidatePath(`/feed/forum/${threadId}`);
  revalidatePath("/feed");
}

// Sharing with your party
export async function setShareSettingsAction(patch: Record<string, boolean>) {
  const ownerId = await requireProfileId();
  const next = await sharingData.setShareSettings(ownerId, patch);
  revalidatePath("/friends", "layout");
  return next;
}

/** "How to support me": a few lines your party sees on your profile (kept in life_wheel.support). */
export async function saveSupportNoteAction(text: string) {
  const ownerId = await requireProfileId();
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 600);
  const { error } = await writeExtra(ownerId, "support", clean);
  if (error) throw new Error("Couldn't save that.");
  revalidatePath("/friends", "layout");
  return clean;
}

export async function setTaskPrivateAction(taskId: string, isPrivate: boolean) {
  const ownerId = await requireProfileId();
  await sharingData.setTaskPrivate(ownerId, taskId, isPrivate);
  revalidatePath("/friends", "layout");
}

export async function setBoardPrivateAction(boardId: string, isPrivate: boolean) {
  const ownerId = await requireProfileId();
  const board = await boardsData.getBoard(boardId, ownerId);
  if (!board) throw new Error("That board isn't here anymore.");
  await boardsData.updateBoard(boardId, ownerId, { title: board.title, description: board.description, color: board.color, isPrivate });
  revalidatePath("/boards", "layout");
  revalidatePath("/friends", "layout");
}

// Party: support calls, notification levels, shared boards
export async function callForSupportAction(kind: partyData.SupportKind, message: string) {
  const { id, name } = await requireIdentity();
  if (!["encouragement", "accountability", "help"].includes(kind)) throw new Error("Pick what you need.");
  const threadId = await partyData.callForSupport(id, name, kind, message);
  revalidatePath("/feed");
  return threadId;
}

/** Messages with one party member (reading marks theirs read). */
export async function messageThreadAction(friendId: string) {
  const me = await requireProfileId();
  return { me, messages: await messagesData.listThread(me, friendId) };
}

export async function sendMessageAction(friendId: string, body: string) {
  const { id, name } = await requireIdentity();
  try {
    return { ok: true as const, message: await messagesData.sendMessage(id, name, friendId, body) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Couldn't send that." };
  }
}

/** What a settings popup opened from a gear needs that only the server knows. */
export async function settingsPopupContextAction() {
  const ownerId = await requireProfileId();
  const [profile, admin] = await Promise.all([profilesData.getProfileById(ownerId), feedbackData.isAdmin(ownerId)]);
  return { notifyLevel: profile?.notify_level ?? "all", notifyEmail: profile?.notify_email ?? true, admin };
}

export async function setNotifyPrefsAction(prefs: { level?: string; email?: boolean }) {
  const ownerId = await requireProfileId();
  await partyData.setNotifyPrefs(ownerId, prefs);
  revalidatePath("/settings");
}

export async function setBoardSharedAction(boardId: string, shared: boolean) {
  const { id, name } = await requireIdentity();
  await partyData.setBoardShared(id, boardId, shared, name);
  revalidatePath("/boards", "layout");
  revalidatePath("/feed");
}

export async function addQuestToSharedBoardAction(boardId: string, title: string) {
  const { id } = await requireIdentity();
  await partyData.addQuestToSharedBoard(id, boardId, title);
  revalidatePath("/feed");
}

export async function takeOnSharedQuestAction(taskId: string) {
  const { id } = await requireIdentity();
  await partyData.takeOnSharedQuest(id, taskId);
  revalidatePath("/");
}

/** The latest few notifications for the bell's preview popup. */
export async function recentNotificationsAction() {
  const ownerId = await requireProfileId();
  const list = await notificationsData.listForProfile(ownerId, 8);
  const now = new Date().toISOString();
  return list
    .filter((n) => !(n.snoozed_until && n.snoozed_until > now))
    .slice(0, 6)
    .map((n) => ({ id: n.id, kind: n.kind, body: n.body, at: n.created_at, read: n.is_read }));
}

/** Unread notifications newer than a moment, newest first (for the little preview toast). */
export async function newNotificationsAction(sinceISO: string) {
  const ownerId = await requireProfileId();
  const list = await notificationsData.listForProfile(ownerId, 10);
  return list
    .filter((n) => !n.is_read && n.created_at > sinceISO && !(n.snoozed_until && n.snoozed_until > new Date().toISOString()))
    .map((n) => ({ id: n.id, kind: n.kind, body: n.body, at: n.created_at, activityId: n.activity_id }));
}

/** A screenshot for a piece of feedback: shrunk to a sensible size and stored; returns its URL. */
export async function uploadFeedbackImageAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No image was attached.");
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is too big (8 MB at most).");
  const sharp = (await import("sharp")).default;
  const bytes = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const path = `feedback/${ownerId}/${crypto.randomUUID()}.webp`;
  const db = (await import("@/lib/supabase/server")).supabaseAdmin();
  const { error } = await db.storage.from("ai-images").upload(path, bytes, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(`Couldn't store the image: ${error.message}`);
  return db.storage.from("ai-images").getPublicUrl(path).data.publicUrl;
}

// Keep in touch (owner, Nov 4): friends with a bar of how due reaching out is.
export async function keepInTouchAction() {
  const ownerId = await requireProfileId();
  const { normalizeFriends } = await import("@/lib/keep-in-touch");
  return normalizeFriends((await readExtras(ownerId)).keepInTouch);
}

export async function saveKeepInTouchAction(list: import("@/lib/keep-in-touch").Friend[]) {
  const ownerId = await requireProfileId();
  const { normalizeFriends } = await import("@/lib/keep-in-touch");
  const clean = normalizeFriends(list);
  const { error } = await writeExtra(ownerId, "keepInTouch", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return clean;
}

/** The check-in chart's data for the last month (Today's check-in button opens it, owner Nov 3). */
export async function checkInChartAction() {
  const uid = await requireProfileId();
  const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
  const [energy, checks, metrics, wins, notes] = await Promise.all([
    energyData.listEnergySince(uid, since),
    energyData.listCheckInsSince(uid, since),
    energyData.getCheckMetrics(uid),
    winsData.listWinsSince(uid, since),
    energyData.listCheckNotesSince(uid, since),
  ]);
  const chartChecks = checks.filter((c) => !c.metric.startsWith("◎ "));
  return {
    metrics: ["Energy", ...metrics],
    readings: [...energy.map((e) => ({ metric: "Energy", level: e.level, at: e.created_at })), ...chartChecks.map((c) => ({ metric: c.metric, level: c.level, at: c.created_at }))],
    wins: [
      ...wins.filter((w) => w.kind !== "feedback" || (w.xp ?? 0) > 0).map((w) => ({ kind: w.kind, at: w.at, xp: w.xp ?? 0, title: w.title, icon: w.icon ?? null })),
      ...notes.map((n) => ({ kind: "note", at: n.created_at, xp: 0, title: n.body, details: n.details ?? null, tone: n.tone ?? null })),
    ],
  };
}

/**
 * XP for each part of the welcome screen you fill in (owner, Nov 6): the sleep check-in, the emotional
 * check-in, your top priorities. Each part pays once a day, its own amount (0–50, set by right-clicking
 * or holding its button; 5 by default). Recorded in `life_wheel.welcomeXp` so a second visit doesn't pay again.
 */
export async function welcomePartsXpAction(partsIn: { key: string; xp: number }[]) {
  const ownerId = await requireProfileId();
  // checkin, sleep, focus (the top priorities), and each Journal prompt written ("journal-<id>").
  const allowed = new Set(["checkin", "sleep", "focus"]);
  const parts = (Array.isArray(partsIn) ? partsIn : [])
    .filter((p) => p && (allowed.has(String(p.key)) || /^journal-[a-z0-9-]{1,40}$/.test(String(p.key))))
    .slice(0, 12)
    .map((p) => ({ key: String(p.key), xp: Math.max(0, Math.min(50, Math.round(Number(p.xp) || 0))) }));
  const extras = await readExtras(ownerId);
  const day = tomorrowData.appDayKey();
  const was = extras.welcomeXp as { day?: string; paid?: string[] } | undefined;
  const paid = was?.day === day && Array.isArray(was.paid) ? was.paid.map(String) : [];
  const fresh = parts.filter((p) => !paid.includes(p.key) && p.xp > 0);
  if (!fresh.length) return { xp: 0, totalXp: null as number | null };
  const amount = fresh.reduce((a, p) => a + p.xp, 0);
  const { error } = await writeExtra(ownerId, "welcomeXp", { day, paid: [...paid, ...fresh.map((p) => p.key)] });
  if (error) throw new Error(`Couldn't record that: ${error.message}`);
  const res = await xp.awardXp(ownerId, amount, "daily_check_in");
  return { xp: amount, totalXp: res.totalXp as number | null };
}

/** Tracked events (anti-habits and the like, owner Nov 4): names logged with one tap, kept on the account. */
function cleanTracked(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const x of list) {
    const t = String(x ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 30);
}

export async function trackedEventsAction(): Promise<string[]> {
  const ownerId = await requireProfileId();
  return cleanTracked((await readExtras(ownerId)).trackedEvents);
}

export async function saveTrackedEventsAction(list: string[]): Promise<string[]> {
  const ownerId = await requireProfileId();
  const clean = cleanTracked(list);
  const { error } = await writeExtra(ownerId, "trackedEvents", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return clean;
}

/** Focusing questions on Today (owner, Nov 4: "What helps me thrive?"), shown one at a time beside Today's Quests. */
export async function focusQuestionsAction(): Promise<string[]> {
  const ownerId = await requireProfileId();
  const raw = (await readExtras(ownerId)).focusQuestions;
  return raw === undefined ? ["What helps me thrive?"] : cleanTracked(raw).map((q) => q.slice(0, 160));
}

export async function saveFocusQuestionsAction(list: string[]): Promise<string[]> {
  const ownerId = await requireProfileId();
  const clean = (Array.isArray(list) ? list : []).map((q) => String(q ?? "").trim().replace(/\s+/g, " ").slice(0, 160)).filter(Boolean).slice(0, 40);
  const { error } = await writeExtra(ownerId, "focusQuestions", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return clean;
}

/* ── Dawn & dusk: the morning routine planned the night before (owner, Nov 9) ─────────── */
async function saveDawn(ownerId: string, dawn: import("@/lib/dawn").Dawn) {
  const { error } = await writeExtra(ownerId, "dawn", dawn);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

/** Your dawn settings, stones and days; the first time, the stones come from your morning habits. Also which habit-tied stones are done on `day`. */
export async function dawnAction(day: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const { cleanDawn, cleanStone } = await import("@/lib/dawn");
  const dawn = cleanDawn((await readExtras(ownerId)).dawn);
  const rites = ((await ritesData.listRites(ownerId).catch(() => null)) ?? []).filter((r) => r.slot === "day" && r.kind !== "ritual");
  if (!dawn.seeded) {
    const seed: import("@/lib/dawn").Stone[] = [];
    const morning = rites.find((r) => /morning (routine|rite|ritual)/i.test(r.title));
    for (const st of morning ? ritesData.cleanRiteSteps(morning.steps) : []) {
      const s = cleanStone({ title: st.title, emoji: /chester|walk|dog/i.test(st.title) ? "🐶" : /read|book/i.test(st.title) ? "📖" : /breakfast/i.test(st.title) ? "🍳" : "✦", min: /walk/i.test(st.title) ? 20 : 15, ref: `step:${morning!.id}:${st.id}` });
      if (s) seed.push(s);
    }
    for (const r of rites) {
      if (morning && r.id === morning.id) continue;
      if (!/language|gym|meditat|stretch|journal/i.test(r.title)) continue;
      const s = cleanStone({ title: r.title, emoji: /language/i.test(r.title) ? "🗣" : /gym/i.test(r.title) ? "🏋️" : "✦", min: r.estimate_minutes ?? 15, ref: `rite:${r.id}`, short: /language/i.test(r.title) ? "Say one phrase" : /gym/i.test(r.title) ? "20 push-ups or squats" : undefined });
      if (s) seed.push(s);
    }
    dawn.stones = [...seed, ...dawn.stones];
    dawn.seeded = true;
    await saveDawn(ownerId, dawn).catch(() => {});
  }
  // Which habit-tied stones are already done today (ticked on Today or elsewhere).
  const since = day;
  const [checks, comps] = await Promise.all([ritesData.listRiteStepChecks(ownerId, since).catch(() => null), ritesData.listCompletionsFor(ownerId, rites.map((r) => r.id), since).catch(() => [])]);
  const doneRefs = new Set<string>([...(checks ?? []).filter((c) => c.day === day).map((c) => `step:${c.rite_id}:${c.step_id}`), ...comps.filter((c) => c.day === day).map((c) => `rite:${c.rite_id}`)]);
  const doneIds = dawn.stones.filter((s) => s.ref && doneRefs.has(s.ref)).map((s) => s.id);
  return { dawn, doneIds };
}

/** Save your dawn settings: which parts you use, your stones, cards, prompts and chapters. */
export async function saveDawnAction(patch: Partial<Pick<import("@/lib/dawn").Dawn, "on" | "stones" | "cards" | "prompts" | "chapters" | "chapterPinned">>) {
  const ownerId = await requireProfileId();
  const { cleanDawn } = await import("@/lib/dawn");
  const cur = cleanDawn((await readExtras(ownerId)).dawn);
  const next = cleanDawn({ ...cur, ...patch, on: { ...cur.on, ...(patch.on ?? {}) }, seeded: true });
  await saveDawn(ownerId, next);
  return next;
}

/** Save part of one day's dawn (the stones chosen, wake time, the card, answers…). */
export async function dawnDayAction(day: string, patch: import("@/lib/dawn").DawnDay) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const { cleanDawn } = await import("@/lib/dawn");
  const cur = cleanDawn((await readExtras(ownerId)).dawn);
  const answers = patch.answers ? { ...(cur.days[day]?.answers ?? {}), ...patch.answers } : cur.days[day]?.answers;
  const next = cleanDawn({ ...cur, days: { ...cur.days, [day]: { ...(cur.days[day] ?? {}), ...patch, ...(answers ? { answers } : {}) } } });
  await saveDawn(ownerId, next);
  return next.days[day] ?? {};
}

/**
 * Tick a stone (or the offering card, the week's practice) done or not. A stone tied to a habit
 * ticks that habit (which pays its own XP); your own stones, the card and the week's practice pay
 * their XP here (5 unless set).
 */
export async function tickDawnAction(day: string, what: { stone: string } | { extra: "card" | "week" | "pmCard" }, on: boolean) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const { cleanDawn } = await import("@/lib/dawn");
  const dawn = cleanDawn((await readExtras(ownerId)).dawn);
  const d = { ...(dawn.days[day] ?? {}) };
  let pay = 0;
  if ("stone" in what) {
    const s = dawn.stones.find((x) => x.id === what.stone);
    if (!s) throw new Error("That stone isn't on your path anymore.");
    const was = (d.done ?? []).includes(s.id);
    if (s.ref?.startsWith("step:")) {
      const [, riteId, stepId] = s.ref.split(":");
      await tickRiteStepAction(riteId, stepId, day, on);
    } else if (s.ref?.startsWith("rite:")) {
      const riteId = s.ref.slice(5);
      if (on) await completeRiteAction(riteId, day).catch(() => null);
      else await uncompleteRiteAction(riteId, day).catch(() => null);
    } else if (was !== on) pay = (on ? 1 : -1) * (s.xp ?? 5);
    d.done = on ? [...new Set([...(d.done ?? []), s.id])] : (d.done ?? []).filter((x) => x !== s.id);
  } else {
    const key = what.extra === "card" ? "cardDone" : what.extra === "week" ? "weekDone" : "pmDone";
    if (!!d[key] !== on) pay = on ? 5 : -5;
    d[key] = on || undefined;
  }
  if (pay) await xp.awardXp(ownerId, pay, "task_completed").catch(() => {});
  dawn.days[day] = d;
  await saveDawn(ownerId, dawn);
  revalidatePath("/");
  return { day: dawn.days[day], xp: pay };
}
