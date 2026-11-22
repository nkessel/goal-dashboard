"use server";

import * as profilesData from "@/lib/data/profiles";
import { revalidatePath } from "next/cache";
import * as tasksData from "@/lib/data/tasks";
import type { TaskIconLibraryEntry } from "@/lib/data/types";
import * as taskIconLibraryData from "@/lib/data/task-icon-library";
import { writeExtra } from "@/lib/data/extras";
import { buildAvatarPrompt, generateAndStoreImage, buildQuestScenePrompt, visualSubjectFor, buildTreasureIconPrompt } from "@/lib/ai-image";
import { styleLook, AVATAR_STYLE_OPTIONS, STYLE_EXAMPLE_SUBJECT } from "@/lib/avatar-prompts";
import * as avatarLibraryData from "@/lib/data/avatar-library";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireProfileId, readExtras, assertFamilyFriendly } from "./_shared";

// Theme + avatar (Priority #10)
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
  const ownerId = await requireProfileId();
  const [all, extras] = await Promise.all([taskIconLibraryData.listAllPortraits(ownerId), readExtras(ownerId)]);
  const hidden = new Set(Array.isArray(extras.hiddenPortraits) ? (extras.hiddenPortraits as unknown[]).filter((u): u is string => typeof u === "string") : []);
  return hidden.size ? all.filter((e) => !hidden.has(e.image_url)) : all;
}

/**
 * Takes a portrait the picker only lists (one a quest or reward already uses, a built-in one, a
 * character) off its list for this person (owner's note 1873c121: those had no ✕). Quests using it keep it.
 */
export async function hidePortraitAction(imageUrl: string) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const was = Array.isArray(extras.hiddenPortraits) ? (extras.hiddenPortraits as unknown[]).filter((u): u is string => typeof u === "string") : [];
  if (was.includes(imageUrl)) return;
  const { error } = await writeExtra(ownerId, "hiddenPortraits", [...was, imageUrl].slice(-500));
  if (error) throw new Error(`Couldn't hide that portrait: ${error.message}`);
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

export async function generateAvatarImageAction(
  prompt: string,
  withBackground = false,
  style: string | null = null
) {
  const ownerId = await requireProfileId();
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Describe what you want your avatar to look like first.");
  assertFamilyFriendly(trimmed);

  const fullPrompt = buildAvatarPrompt(trimmed, { withBackground, look: styleLook(style) });
  const url = await generateAndStoreImage(fullPrompt, `avatars/${ownerId}-${Date.now()}.jpg`, {
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

export async function generateTaskIconAction(taskId: string, prompt: string, style: "monster" | "treasure" | "routine" = "monster") {
  const ownerId = await requireProfileId();
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Describe the monster/icon you want first.");
  assertFamilyFriendly(trimmed);

  // A concrete picture of the task, in the same painted storybook style as imports.
  // Quest portraits keep their painted scene behind them; a reward is a treasure, a routine a gentle daily scene.
  const url = await generateAndStoreImage(await portraitPromptFor(trimmed, style), `tasks/${taskId}-${Date.now()}.jpg`);
  await tasksData.setTaskIcon(taskId, ownerId, { iconKey: url, iconSource: "ai" });
  await taskIconLibraryData.addTaskIconToLibrary({ imageUrl: url, createdBy: ownerId, prompt: trimmed });
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/boards", "layout");
  return url;
}

/** Remove one image from the shared avatar library. Profiles already using
 * it keep their avatar — only the library tile goes away. */
export async function removeAvatarFromLibraryAction(id: string) {
  const ownerId = await requireProfileId();
  await avatarLibraryData.removeAvatarFromLibrary(id, ownerId);
  revalidatePath("/settings/avatar");
}

/**
 * Today's quests and your daily habits without a picture yet, for the calendar's storybook cards (owner, Nov 3:
 * "let's get gym and other items nice avatars"). One at a time, so each call stays short: paints the next one,
 * puts it on that habit or quest, and says how many are left.
 */
async function todayWithoutArt(ownerId: string) {
  const db = supabaseAdmin();
  const soon = new Date(Date.now() + 8 * 86400_000).toISOString();
  const [rites, pinned, scheduled, timed] = await Promise.all([
    db.from("rites").select("id, title").eq("owner_id", ownerId).eq("archived", false).eq("slot", "day").is("icon_key", null),
    db.from("tasks").select("id, title").eq("owner_id", ownerId).eq("status", "open").eq("is_manual_priority", true).is("icon_key", null),
    db.from("tasks").select("id, title").eq("owner_id", ownerId).eq("status", "open").eq("is_on_calendar", true).lt("scheduled_start", soon).gt("scheduled_end", new Date().toISOString()).is("icon_key", null),
    db.from("tasks").select("id, title").eq("owner_id", ownerId).eq("status", "open").eq("is_tiny", true).lt("due_at", soon).is("icon_key", null),
  ]);
  const quests = new Map<string, string>();
  for (const r of [...(pinned.data ?? []), ...(scheduled.data ?? []), ...(timed.data ?? [])]) quests.set(r.id as string, r.title as string);
  return {
    habits: ((rites.data ?? []) as { id: string; title: string }[]).filter((r) => r.title?.trim()),
    quests: [...quests].map(([id, title]) => ({ id, title })).filter((q) => q.title?.trim()),
  };
}

export async function countTodayWithoutArtAction(): Promise<number> {
  const ownerId = await requireProfileId();
  const { habits, quests } = await todayWithoutArt(ownerId);
  return habits.length + quests.length;
}

export async function paintNextTodayArtAction(): Promise<{ painted: string | null; left: number }> {
  const ownerId = await requireProfileId();
  const { habits, quests } = await todayWithoutArt(ownerId);
  const next = habits[0] ? { kind: "habit" as const, ...habits[0] } : quests[0] ? { kind: "quest" as const, ...quests[0] } : null;
  if (!next) return { painted: null, left: 0 };
  const subject = next.title.replace(/[^\p{L}\p{N}\s'&:,-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "a small adventure";
  let url: string;
  try {
    assertFamilyFriendly(subject);
    url = await generateAndStoreImage(buildQuestScenePrompt(await visualSubjectFor(subject)), `${next.kind === "habit" ? "rites" : "tasks"}/${next.id}-${Date.now()}.jpg`);
  } catch (e) {
    throw new Error(`Couldn't paint “${next.title}”: ${e instanceof Error ? e.message : "try again"}`);
  }
  if (next.kind === "habit") await supabaseAdmin().from("rites").update({ icon_key: url, icon_source: "ai" }).eq("id", next.id).eq("owner_id", ownerId);
  else await tasksData.setTaskIcon(next.id, ownerId, { iconKey: url, iconSource: "ai" });
  await taskIconLibraryData.addTaskIconToLibrary({ imageUrl: url, createdBy: ownerId, prompt: subject }).catch(() => {});
  revalidatePath("/");
  revalidatePath("/calendar");
  return { painted: next.title, left: habits.length + quests.length - 1 };
}

/** Generate a quest portrait without attaching it to a quest yet (the create
 * dialog, before the quest exists). Added to the shared icon library. */
/** The painting prompt for a portrait style (owner, Nov 3: choose the style — quest, reward, routine). */
async function portraitPromptFor(subject: string, style: "monster" | "treasure" | "routine") {
  if (style === "treasure") return buildTreasureIconPrompt(subject);
  if (style === "routine") return buildQuestScenePrompt(`a calm, cozy daily ritual: ${await visualSubjectFor(subject)}, warm lamplight, peaceful`);
  return buildQuestScenePrompt(await visualSubjectFor(subject));
}

export async function generateQuestIconImageAction(prompt: string, artStyle: "monster" | "treasure" | "routine" = "monster"): Promise<string> {
  const ownerId = await requireProfileId();
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Describe the monster/icon you want first.");
  assertFamilyFriendly(trimmed);
  const url = await generateAndStoreImage(await portraitPromptFor(trimmed, artStyle), `${artStyle === "treasure" ? "rewards" : "tasks"}/draft-${ownerId}-${Date.now()}.jpg`);
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
  const have = new Set((Array.isArray(existing) ? existing : []).map((f: { name: string }) => f.name));
  for (const style of AVATAR_STYLE_OPTIONS) {
    // Heroic keeps the v2 example Nathan liked.
    const version = style.key === "heroic" ? "v2" : "v7";
    const name = `${style.key}-${version}.png`;
    if (have.has(name)) {
      out[style.key] = db.storage.from("ai-images").getPublicUrl(`style-examples/${name}`).data.publicUrl;
      continue;
    }
    out[style.key] = await generateAndStoreImage(
      buildAvatarPrompt(STYLE_EXAMPLE_SUBJECT, { withBackground: false, look: style.look }),
      `style-examples/${style.key}-${version}.jpg`,
      { pixelate: style.key === "pixel" ? 48 : undefined }
    );
  }
  return out;
}

/** Remove one image from the shared quest-icon library (quests already using it keep it). */
export async function removeTaskIconFromLibraryAction(id: string) {
  const ownerId = await requireProfileId();
  await taskIconLibraryData.removeTaskIconFromLibrary(id, ownerId);
}
