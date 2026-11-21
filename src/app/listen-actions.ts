"use server";

/**
 * The Listening list's saves (owner, Nov 20-21; docs/plans/listening-list.md): a row's inner list
 * (lessons, shows, playlists, recordings), a pasted link, a reflection, and the reflect screen's own
 * settings. Rows are quests on the Listening list board; ranking uses the board's own order.
 */

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { writeExtra } from "@/lib/data/extras";
import { addJournalEntry } from "@/lib/data/journal";
import { appOfUrl, cleanItems, cleanReflection, cleanUrl, isListenBoardTitle, newItemId, readListen, titleFromUrl, type ListenData, type ListenItem, type ListenReflection } from "@/lib/listen";

async function owner(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

const ID = /^[0-9a-f-]{36}$/i;

async function loadRow(ownerId: string, taskId: string) {
  if (!ID.test(taskId)) throw new Error("Unknown item.");
  const { data, error } = await supabaseAdmin().from("tasks").select("id, title, board_id, listen").eq("id", taskId).eq("owner_id", ownerId).maybeSingle<{ id: string; title: string; board_id: string | null; listen: unknown }>();
  if (error) throw new Error(`Couldn't load it: ${error.message}`);
  if (!data) throw new Error("That item is gone.");
  return { ...data, listen: readListen(data.listen) };
}

async function saveListen(ownerId: string, taskId: string, listen: ListenData) {
  const { error } = await supabaseAdmin().from("tasks").update({ listen }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

function refresh(boardId: string | null) {
  if (boardId) revalidatePath(`/boards/${boardId}`);
}

/** A row's inner list as edited: its order (drag), names and links (✎), ticks, adds and removals. */
export async function saveListenItemsAction(taskId: string, items: ListenItem[]) {
  const ownerId = await owner();
  const row = await loadRow(ownerId, taskId);
  const now = new Date().toISOString();
  const before = new Map((row.listen.items ?? []).map((i) => [i.id, i]));
  const next = cleanItems(items).map((i) => ({ ...i, doneAt: i.done ? (before.get(i.id)?.doneAt ?? now) : null }));
  await saveListen(ownerId, taskId, { ...row.listen, items: next });
  refresh(row.board_id);
  return next;
}

/** A YouTube link's own title (YouTube's public oEmbed), or null. Only the link is sent. */
async function youtubeTitle(url: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: unknown };
    return typeof j.title === "string" ? j.title.slice(0, 200) : null;
  } catch {
    return null;
  }
}

/**
 * Paste a link: a YouTube or podcast link joins the end of its app's row; anything else becomes
 * an item of its own at the bottom of the ranked list. Returns where it went.
 */
export async function addListenLinkAction(boardId: string, rawUrl: string, rawTitle?: string): Promise<{ to: "app" | "item"; taskId: string; title: string }> {
  const ownerId = await owner();
  if (!ID.test(boardId)) throw new Error("Unknown board.");
  const text = rawUrl.replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Paste a link or type a name.");
  const url = cleanUrl(text);
  const db = supabaseAdmin();
  const { data: board } = await db.from("boards").select("id, title").eq("id", boardId).eq("owner_id", ownerId).maybeSingle<{ id: string; title: string }>();
  if (!board || !isListenBoardTitle(board.title)) throw new Error("This isn't the Listening list.");
  if (!url && /:\/\//.test(text)) throw new Error("That link didn't look right. Paste one that starts with https://");
  const app = url ? appOfUrl(url) : null;
  const title = (rawTitle ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || (!url ? text.slice(0, 200) : null) || (app === "youtube" ? await youtubeTitle(url!) : null) || titleFromUrl(url!);
  if (app && url) {
    const { data: rows } = await db.from("tasks").select("id, listen").eq("owner_id", ownerId).eq("board_id", boardId).eq("status", "open");
    const hit = ((rows ?? []) as { id: string; listen: unknown }[]).find((r) => {
      const l = readListen(r.listen);
      return l.kind === "app" && l.app === app;
    });
    if (hit) {
      const l = readListen(hit.listen);
      await saveListen(ownerId, hit.id, { ...l, items: [...(l.items ?? []), { id: newItemId(), title, url }] });
      refresh(boardId);
      return { to: "app", taskId: hit.id, title };
    }
  }
  const { data: made, error } = await db
    .from("tasks")
    .insert({ owner_id: ownerId, title, board_id: boardId, description: url, listen: { kind: "item", url, app } satisfies ListenData, in_additional: false })
    .select("id")
    .single<{ id: string }>();
  if (error || !made) throw new Error(`Couldn't add it: ${error?.message ?? "unknown error"}`);
  refresh(boardId);
  return { to: "item", taskId: made.id, title };
}

/** Move a row to or from the One day section (kept on the board, off the ranked list). */
export async function setListenOneDayAction(taskId: string, oneDay: boolean) {
  const ownerId = await owner();
  const row = await loadRow(ownerId, taskId);
  const { error } = await supabaseAdmin().from("tasks").update({ is_aspiration: oneDay }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Couldn't move it: ${error.message}`);
  refresh(row.board_id);
}

/**
 * Save a reflection on a finished row, or on one thing inside it (`itemId`). Kept on the row and
 * written to Journal under Listening (a new entry the first time, the same one updated after).
 */
export async function saveListenReflectionAction(taskId: string, itemId: string | null, raw: ListenReflection & { itemTitle?: string }) {
  const ownerId = await owner();
  const row = await loadRow(ownerId, taskId);
  const key = itemId ? itemId.slice(0, 60) : "row";
  const r = cleanReflection(raw);
  await saveListen(ownerId, taskId, { ...row.listen, reflections: { ...(row.listen.reflections ?? {}), [key]: r } });
  const what = itemId ? `${(row.listen.items ?? []).find((i) => i.id === itemId)?.title ?? raw.itemTitle ?? "A lesson"} (${row.title})` : row.title;
  const lines = [
    `Listened: ${what}`,
    r.rating ? `${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}` : "",
    r.takeaway ?? "",
    ...(r.remember ?? []).map((x) => `· ${x}`),
    r.replay ? "Worth a replay" : "",
    r.notes ?? "",
  ].filter(Boolean);
  if (lines.length > 1) await addJournalEntry(ownerId, lines.join("\n"), null, "listening").catch(() => null);
  refresh(row.board_id);
  revalidatePath("/journal");
  return r;
}

export type ListenReflectConfig = {
  /** Renamed parts, by key. */
  labels?: Record<string, string>;
  /** Learning quotes he added, and built-in ones he took out (by their text). */
  quotes?: { text: string; by: string }[];
  removedQuotes?: string[];
  /** When the reflect screen opens after finishing something. */
  openWhen?: "every" | "courses" | "never";
  /** The parts' order and the hidden ones, by key. */
  order?: string[];
  hidden?: string[];
};

/** The reflect screen's own settings, from its gear (kept with his profile, so every device has them). */
export async function saveListenReflectConfigAction(config: ListenReflectConfig) {
  const ownerId = await owner();
  const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(config.labels ?? {}).slice(0, 20)) if (clip(v, 60)) labels[clip(k, 30)] = clip(v, 60);
  const clean: ListenReflectConfig = {
    labels,
    quotes: (config.quotes ?? []).map((q) => ({ text: clip(q.text, 300), by: clip(q.by, 100) })).filter((q) => q.text).slice(0, 50),
    removedQuotes: (config.removedQuotes ?? []).map((t) => clip(t, 300)).filter(Boolean).slice(0, 50),
    openWhen: config.openWhen === "courses" || config.openWhen === "never" ? config.openWhen : "every",
    order: (config.order ?? []).map((k) => clip(k, 30)).filter(Boolean).slice(0, 20),
    hidden: (config.hidden ?? []).map((k) => clip(k, 30)).filter(Boolean).slice(0, 20),
  };
  const { error } = await writeExtra(ownerId, "listenReflect", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return clean;
}
