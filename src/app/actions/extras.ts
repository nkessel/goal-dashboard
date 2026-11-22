"use server";

import { writeExtra } from "@/lib/data/extras";
import { revalidatePath } from "next/cache";
import * as energyData from "@/lib/data/energy";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as xp from "@/lib/data/xp";
import { generateAndStoreImage } from "@/lib/ai-image";
import * as tasksData from "@/lib/data/tasks";
import { requireProfileId, readExtras, assertFamilyFriendly } from "./_shared";

// Streaks: things you're keeping away from (kept with your life wheel, private)
/** Save the list of streaks. */
export async function saveStreaksAction(list: { id: string; name: string; word: string; since: string }[]) {
  const ownerId = await requireProfileId();
  const clean = list.slice(0, 12).map((s) => ({
    id: String(s.id).slice(0, 40),
    name: s.name.replace(/\s+/g, " ").trim().slice(0, 40) || "Streak",
    word: s.word.split(",").map((w) => w.replace(/^\s*#/, "").trim().toLowerCase()).filter(Boolean).join(", ").slice(0, 60),
    since: new Date(Date.parse(s.since) || Date.now()).toISOString(),
  }));
  const { error } = await writeExtra(ownerId, "streaks", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/insights");
  return clean;
}

/** Rituals of connection: the whole list (names, notes and the days each was done). */
export async function saveRitualsAction(list: import("@/lib/rituals").Ritual[]) {
  const ownerId = await requireProfileId();
  const { cleanRituals } = await import("@/lib/rituals");
  const clean = cleanRituals(list);
  const { error } = await writeExtra(ownerId, "rituals", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/insights");
  return clean;
}

/** A slip: logged as an event with the streak's #word, so the count starts again from then. */
export async function logSlipAction(word: string, atISO?: string | null) {
  const ownerId = await requireProfileId();
  // The first word is the one logged.
  const w = word.split(",")[0].replace(/^\s*#/, "").replace(/\s+/g, "").toLowerCase().slice(0, 24);
  if (!w) throw new Error("This streak needs a word first.");
  const note = await energyData.addCheckNote(ownerId, `#${w}`, atISO ?? null);
  revalidatePath("/insights");
  return note;
}

// Inventory: the backpack (kept with your other personal extras)
export async function saveInventoryAction(inventory: unknown) {
  const ownerId = await requireProfileId();
  const { normalizeInventory } = await import("@/lib/inventory");
  const clean = normalizeInventory(inventory);
  const { data: cur } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  // Packing lists are saved by their own window (below); the backpack never writes over them.
  const stored = ((cur?.life_wheel ?? {}) as { inventory?: { packing?: unknown } }).inventory?.packing;
  if (stored !== undefined) (clean as { packing: unknown }).packing = stored;
  const { error } = await writeExtra(ownerId, "inventory", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/settings");
  return clean;
}

/** Your packing lists, for the floating packing window. */
export async function packingListsAction() {
  const ownerId = await requireProfileId();
  const { normalizePacking } = await import("@/lib/inventory");
  const { data: cur } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  return normalizePacking(((cur?.life_wheel ?? {}) as { inventory?: { packing?: unknown } }).inventory?.packing);
}

/** Save the packing lists (merged into the backpack's record, nothing else touched). */
export async function savePackingListsAction(lists: unknown) {
  const ownerId = await requireProfileId();
  const { normalizePacking } = await import("@/lib/inventory");
  const clean = normalizePacking(lists);
  const { data: cur } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const lw = cur?.life_wheel ?? {};
  const inventory = { ...((lw as { inventory?: Record<string, unknown> }).inventory ?? {}), packing: clean };
  const { error } = await writeExtra(ownerId, "inventory", inventory);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return clean;
}

// Mess check-in: spaces, laundry bin and chore deck for the cleaning habit
export async function saveCleaningAction(cleaning: unknown) {
  const ownerId = await requireProfileId();
  const { normalizeCleaning } = await import("@/lib/cleaning");
  const clean = normalizeCleaning(cleaning);
  if (!clean) throw new Error("Nothing to save.");
  const { error } = await writeExtra(ownerId, "cleaning", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return clean;
}

/**
 * Fighting back the mess in a space: logs before and after (0–10), and
 * optionally minutes and the energy it took and gave; sets the space to how
 * it looks now; pays XP when it's cleaner than before (capped per day).
 */
export async function fightMessAction(input: { day: string; spaceId: string; before: number; after: number; minutes?: number | null; took?: number | null; gave?: number | null }) {
  const ownerId = await requireProfileId();
  const { normalizeCleaning, battleXp, battleXpToday, levelOfTen } = await import("@/lib/cleaning");
  const extras = await readExtras(ownerId);
  const c = normalizeCleaning(extras.cleaning);
  if (!c) throw new Error("Set up your spaces first.");
  const space = c.spaces.find((s) => s.id === input.spaceId);
  if (!space) throw new Error("That space is gone.");
  // The app day the screen is on (the client knows the owner's time zone).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw new Error("Bad day.");
  const day = input.day;
  const n = (v: unknown, max: number) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(max, Math.round(Number(v)))));
  const before = n(input.before, 10) ?? 5;
  const after = n(input.after, 10) ?? before;
  const minutes = n(input.minutes, 600);
  const xpEarned = battleXpToday(c, day, battleXp(before, after, minutes));
  const next = normalizeCleaning({
    ...c,
    spaces: c.spaces.map((s) => (s.id === space.id ? { ...s, level: levelOfTen(after), mess: after, ratedOn: day } : s)),
    battles: [...(c.battles ?? []), { on: day, spaceId: space.id, before, after, minutes, took: n(input.took, 5), gave: n(input.gave, 5), xp: xpEarned }],
  })!;
  const { error } = await writeExtra(ownerId, "cleaning", next);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  const award = xpEarned > 0 ? await xp.awardXp(ownerId, xpEarned, "mess_battle") : null;
  revalidatePath("/");
  return { cleaning: next, xp: xpEarned, totalXp: award?.totalXp ?? null, coinsEarned: award?.coinsEarned ?? 0 };
}

/** Paint an inventory item's portrait (from its name, or your own description of the picture). */
export async function paintInventoryItemAction(name: string, description?: string | null): Promise<string> {
  const ownerId = await requireProfileId();
  const trimmed = (description?.trim() || name.trim()).slice(0, 200);
  if (!trimmed) throw new Error("Name the item first.");
  assertFamilyFriendly(trimmed);
  const { buildInventoryIconPrompt } = await import("@/lib/ai-image");
  return generateAndStoreImage(buildInventoryIconPrompt(trimmed), `inventory/${ownerId}-${Date.now()}.jpg`);
}

/** A quest to go refill something from the backpack. */
export async function makeRefillQuestAction(itemName: string) {
  const ownerId = await requireProfileId();
  const task = await tasksData.createTask(ownerId, { title: `Refill: ${itemName.trim().slice(0, 100)}`, importance: 2.5, urgency: 3, xpValue: 10, estimateMinutes: 15 });
  revalidatePath("/");
  return task.id;
}

/** Show a quest on other boards too (it keeps living on its own board). */
export async function setTaskAlsoOnAction(taskId: string, boardIds: string[]) {
  const ownerId = await requireProfileId();
  const { data: t } = await supabaseAdmin().from("tasks").select("board_id, also_on").eq("id", taskId).eq("owner_id", ownerId).maybeSingle<{ board_id: string | null; also_on: string[] | null }>();
  if (!t) throw new Error("Quest not found.");
  const clean = [...new Set(boardIds.filter((b) => b && b !== t.board_id))].slice(0, 8);
  const { error } = await supabaseAdmin().from("tasks").update({ also_on: clean }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(/also_on/.test(error.message) ? "Linking to more boards needs a quick database update first." : `Couldn't save: ${error.message}`);
  for (const b of new Set([...(t.also_on ?? []), ...clean])) revalidatePath(`/boards/${b}`);
  revalidatePath("/boards");
  return clean;
}

/**
 * An inventory item's picture from a photo: as it is ("photo"), or repainted
 * as an illustration in the inventory style ("illustrate").
 */
export async function inventoryPhotoAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const file = formData.get("file");
  const mode = String(formData.get("mode") || "photo");
  const name = String(formData.get("name") || "").trim().slice(0, 80) || "an item";
  if (!(file instanceof File)) throw new Error("No photo was attached.");
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("That photo is too big (12 MB at most).");
  const sharp = (await import("sharp")).default;
  const raw = Buffer.from(await file.arrayBuffer());
  const db = supabaseAdmin();
  let bytes: Buffer;
  const ext = "webp";
  const type = "image/webp";
  if (mode === "illustrate") {
    assertFamilyFriendly(name);
    const { illustrateFromPhoto, buildInventoryIconPrompt } = await import("@/lib/ai-image");
    try {
      bytes = await sharp(await illustrateFromPhoto(raw, buildInventoryIconPrompt(name))).webp({ quality: 86 }).toBuffer();
    } catch {
      // The photo painter is unavailable: paint it from its name instead.
      return generateAndStoreImage(buildInventoryIconPrompt(name), `inventory/${ownerId}-${Date.now()}.jpg`);
    }
  } else {
    bytes = await sharp(raw).rotate().resize(640, 640, { fit: "cover" }).webp({ quality: 84 }).toBuffer();
  }
  const path = `inventory/${ownerId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("ai-images").upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new Error(`Couldn't store the picture: ${error.message}`);
  return db.storage.from("ai-images").getPublicUrl(path).data.publicUrl;
}

/** Edit a logged event or #tag. */
export async function updateCheckNoteAction(id: string, edit: string | { text?: string; details?: string | null; tone?: number | null; at?: string }) {
  const ownerId = await requireProfileId();
  const note = await energyData.updateCheckNote(ownerId, id, edit);
  revalidatePath("/insights");
  revalidatePath("/");
  return note;
}

/** The forecast place, kept on your account (beside your other personal extras). */
export async function saveWeatherPlaceAction(place: { lat: number; lon: number; name?: string | null }) {
  const ownerId = await requireProfileId();
  const lat = Math.round(Number(place.lat) * 100) / 100;
  const lon = Math.round(Number(place.lon) * 100) / 100;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("That place doesn't look right.");
  await writeExtra(ownerId, "weather", { lat, lon, name: place.name?.slice(0, 60) ?? null });
}
