import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listFriendIds } from "./friendships";
import { createNotification, markEmailSent } from "./notifications";
import { sendEmail } from "@/lib/email";
import type { Board, Task } from "./types";

export type SupportKind = "encouragement" | "accountability" | "help";
export const SUPPORT_LABEL: Record<SupportKind, string> = {
  encouragement: "could use some encouragement",
  accountability: "wants someone to keep them accountable",
  help: "could use a hand",
};

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Tell the whole party — in the app, and by email for those who want it — and open a Party thread for replies. */
export async function callForSupport(ownerId: string, name: string, kind: SupportKind, message: string): Promise<string> {
  const db = supabaseAdmin();
  const text = message.replace(/\s+/g, " ").trim().slice(0, 500);
  const title = `🔔 ${name} ${SUPPORT_LABEL[kind]}`;
  const { data: thread, error } = await db.from("forum_threads").insert({ scope: "party", author_id: ownerId, title, body: text, pinned: false }).select("id").single();
  if (error) throw new Error(`Couldn't send that: ${error.message}`);
  const friends = await listFriendIds(ownerId);
  if (friends.length) {
    const { data: people } = await db.from("profiles").select("id, email, notify_email").in("id", friends);
    for (const p of people ?? []) {
      const n = await createNotification({ profileId: p.id as string, actorId: ownerId, kind: "support", body: `${name} ${SUPPORT_LABEL[kind]}${text ? `: “${text.slice(0, 120)}”` : "."}` }).catch(() => null);
      if (n && p.notify_email && p.email) {
        const sent = await sendEmail({
          to: p.email as string,
          subject: `${name} ${SUPPORT_LABEL[kind]}`,
          html: `<p><strong>${esc(name)}</strong> ${SUPPORT_LABEL[kind]}.</p>${text ? `<blockquote>${esc(text)}</blockquote>` : ""}<p>Reply in your party's forum in the Guild Hall.</p>`,
        }).catch(() => false);
        if (sent) await markEmailSent(n.id).catch(() => {});
      }
    }
  }
  return thread.id as string;
}

export async function setNotifyPrefs(ownerId: string, prefs: { level?: string; email?: boolean }) {
  const patch: Record<string, unknown> = {};
  if (prefs.level && ["all", "highlights", "essential"].includes(prefs.level)) patch.notify_level = prefs.level;
  if (typeof prefs.email === "boolean") patch.notify_email = prefs.email;
  if (!Object.keys(patch).length) return;
  const { error } = await supabaseAdmin().from("profiles").update(patch).eq("id", ownerId);
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Boards shared with the party
// ---------------------------------------------------------------------------

export async function setBoardShared(ownerId: string, boardId: string, shared: boolean, ownerName: string) {
  const db = supabaseAdmin();
  const { data: board, error } = await db.from("boards").update({ shared_with_party: shared }).eq("id", boardId).eq("owner_id", ownerId).select("title").single();
  if (error) throw new Error(`Couldn't share that board: ${error.message}`);
  if (shared) {
    for (const f of await listFriendIds(ownerId)) {
      await createNotification({ profileId: f, actorId: ownerId, kind: "shared_board", body: `${ownerName} shared the board “${board.title}” with the party.` }).catch(() => {});
    }
  }
}

export type SharedBoard = { board: Board; owner: { id: string; name: string | null }; quests: Task[] };

/** Boards your party members have shared (never private ones), with their open, non-private quests. */
export async function listSharedBoards(viewerId: string): Promise<SharedBoard[]> {
  const friends = await listFriendIds(viewerId);
  const owners = [viewerId, ...friends];
  const db = supabaseAdmin();
  const { data: boards } = await db.from("boards").select("*").in("owner_id", owners).eq("shared_with_party", true).eq("is_private", false).order("updated_at", { ascending: false }).limit(30);
  if (!boards?.length) return [];
  const ids = boards.map((b) => b.id as string);
  const [{ data: tasks }, { data: people }] = await Promise.all([
    db.from("tasks").select("*").in("board_id", ids).eq("status", "open").eq("is_private", false).order("created_at", { ascending: false }).limit(300),
    db.from("profiles").select("id, name").in("id", [...new Set(boards.map((b) => b.owner_id as string))]),
  ]);
  const names = new Map<string, string | null>((people ?? []).map((p) => [p.id as string, (p.name as string | null) ?? null]));
  return (boards as Board[]).map((b) => ({ board: b, owner: { id: b.owner_id, name: names.get(b.owner_id) ?? null }, quests: ((tasks ?? []) as Task[]).filter((t) => t.board_id === b.id) }));
}

async function sharedBoardFor(viewerId: string, boardId: string): Promise<Board | null> {
  const { data } = await supabaseAdmin().from("boards").select("*").eq("id", boardId).eq("shared_with_party", true).eq("is_private", false).maybeSingle();
  const b = data as Board | null;
  if (!b) return null;
  if (b.owner_id !== viewerId && !(await listFriendIds(viewerId)).includes(b.owner_id)) return null;
  return b;
}

/** A party member adds a quest to a shared board (it's the owner's quest, marked with who added it). */
export async function addQuestToSharedBoard(viewerId: string, boardId: string, title: string): Promise<void> {
  const b = await sharedBoardFor(viewerId, boardId);
  if (!b) throw new Error("That board isn't shared with you.");
  const t = title.replace(/\s+/g, " ").trim().slice(0, 140);
  if (!t) throw new Error("Name the quest first.");
  const { error } = await supabaseAdmin().from("tasks").insert({ owner_id: b.owner_id, board_id: b.id, title: t, xp_value: 20, added_by: viewerId, status: "open", in_additional: false });
  if (error) throw new Error(`Couldn't add it: ${error.message}`);
}

/** "Take this on too": copy a shared quest into your own Additional Quests. */
export async function takeOnSharedQuest(viewerId: string, taskId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data } = await db.from("tasks").select("*").eq("id", taskId).maybeSingle();
  const t = data as Task | null;
  if (!t || !t.board_id || !(await sharedBoardFor(viewerId, t.board_id))) throw new Error("That quest isn't shared with you.");
  const { error } = await db.from("tasks").insert({
    owner_id: viewerId,
    title: t.title,
    description: t.description,
    xp_value: t.xp_value,
    estimate_minutes: t.estimate_minutes,
    icon_key: t.icon_key,
    icon_source: t.icon_source,
    status: "open",
    in_additional: true,
  });
  if (error) throw new Error(`Couldn't take it on: ${error.message}`);
}
