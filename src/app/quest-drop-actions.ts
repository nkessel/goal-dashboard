"use server";

// Quest Drop's songs (owner, Nov 19): your own list, kept on your account (`life_wheel.questDropSongs`),
// and one list everyone can add to (`app_defaults` key `questdrop.songs`, never shared as a setting).
// Kept out of actions.ts on purpose (it is being split by area; see docs/ACTIONS-SPLIT-PLAN.md).

import { writeExtra } from "@/lib/data/extras";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cleanSong, type DropSong } from "@/lib/quest-drop";

const EVERYONE_KEY = "questdrop.songs";
const MAX = 60;

async function me(): Promise<{ id: string; name: string | null }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return { id: session.user.id, name: session.user.name ?? null };
}

type Mine = { songs: DropSong[]; selected: string | null };

async function readMine(ownerId: string): Promise<{ extras: Record<string, unknown>; mine: Mine }> {
  const { data } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const extras = data?.life_wheel ?? {};
  const raw = (extras.questDropSongs ?? {}) as { songs?: unknown; selected?: unknown };
  const songs = (Array.isArray(raw.songs) ? raw.songs : []).map((s) => cleanSong(s as DropSong)).filter((s): s is DropSong => Boolean(s));
  return { extras, mine: { songs, selected: typeof raw.selected === "string" && songs.some((s) => s.url === raw.selected) ? raw.selected : null } };
}

async function writeMine(ownerId: string, mine: Mine) {
  // writeExtra saves only this key; life_wheel holds many other things.
  const { error } = await writeExtra(ownerId, "questDropSongs", mine);
  if (error) throw new Error("Couldn't save your songs.");
}

async function readEveryone(): Promise<DropSong[]> {
  const { data } = await supabaseAdmin().from("app_defaults").select("value").eq("key", EVERYONE_KEY).maybeSingle<{ value: string | null }>();
  try {
    const list = JSON.parse(data?.value ?? "[]") as unknown[];
    return list
      .map((x): DropSong | null => {
        const s = cleanSong(x as DropSong);
        const o = x as DropSong;
        return s ? { ...s, by: typeof o.by === "string" ? o.by : null, byName: typeof o.byName === "string" ? o.byName.slice(0, 60) : null } : null;
      })
      .filter((s): s is DropSong => Boolean(s));
  } catch {
    return [];
  }
}

async function writeEveryone(by: string, list: DropSong[]) {
  const { error } = await supabaseAdmin().from("app_defaults").upsert({ key: EVERYONE_KEY, value: JSON.stringify(list.slice(0, MAX * 3)), updated_by: by, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error("Couldn't add it to everyone's list.");
}

/** Your songs, the one you play, and everyone's list. */
export async function questDropSongsAction(): Promise<{ mine: DropSong[]; selected: string | null; everyone: DropSong[]; me: string }> {
  const who = await me();
  const [{ mine }, everyone] = await Promise.all([readMine(who.id), readEveryone()]);
  return { mine: mine.songs, selected: mine.selected, everyone: everyone.map((s) => ({ ...s, by: s.by === who.id ? who.id : null })), me: who.id };
}

/** Add a song to your list (it becomes the one you play), and to everyone's list when asked. */
export async function addQuestDropSongAction(input: { url: string; name?: string }, forEveryone: boolean) {
  const who = await me();
  const song = cleanSong(input);
  if (!song) throw new Error("That doesn't look like a link. Paste the song's or playlist's web address.");
  const { mine } = await readMine(who.id);
  await writeMine(who.id, { songs: [song, ...mine.songs.filter((s) => s.url !== song.url)].slice(0, MAX), selected: song.url });
  if (forEveryone) {
    const all = await readEveryone();
    if (!all.some((s) => s.url === song.url)) await writeEveryone(who.id, [{ ...song, by: who.id, byName: who.name }, ...all]);
  }
  return questDropSongsAction();
}

/** Pick the song that plays (null: none), adding it to your list if it came from everyone's. */
export async function pickQuestDropSongAction(url: string | null) {
  const who = await me();
  const { mine } = await readMine(who.id);
  if (url === null) {
    await writeMine(who.id, { ...mine, selected: null });
    return questDropSongsAction();
  }
  const have = mine.songs.find((s) => s.url === url);
  const shared = have ? null : (await readEveryone()).find((s) => s.url === url);
  if (!have && !shared) throw new Error("That song isn't on a list anymore.");
  const songs = have ? mine.songs : [{ url: shared!.url, name: shared!.name }, ...mine.songs].slice(0, MAX);
  await writeMine(who.id, { songs, selected: url });
  return questDropSongsAction();
}

/** Take a song off your list; off everyone's list too if you added it there (or you run the app). */
export async function removeQuestDropSongAction(url: string, fromEveryone: boolean) {
  const who = await me();
  if (fromEveryone) {
    const all = await readEveryone();
    const it = all.find((s) => s.url === url);
    const { isAdmin } = await import("@/lib/data/feedback");
    if (it && (it.by === who.id || (await isAdmin(who.id).catch(() => false)))) await writeEveryone(who.id, all.filter((s) => s.url !== url));
  } else {
    const { mine } = await readMine(who.id);
    await writeMine(who.id, { songs: mine.songs.filter((s) => s.url !== url), selected: mine.selected === url ? null : mine.selected });
  }
  return questDropSongsAction();
}
