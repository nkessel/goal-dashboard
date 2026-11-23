"use server";

import { type HabitTicks, type HabitTicksSeed, habitTicksSeed, cleanHabitTicks } from "@/lib/habit-ticks";
import { writeExtra } from "@/lib/data/extras";
import * as ritesData from "@/lib/data/rites";
import { coinsForXp } from "@/lib/coins";
import * as xp from "@/lib/data/xp";
import * as rewardsData from "@/lib/data/rewards";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireProfileId, readExtras, QUEST_ID, assertDay } from "./_shared";

// Habits done more than once a day (owner, Nov 16: "every tick of the checkbox gives another
// completion/victory/xp gain… the card keeps track of how many times per day it's been done")
async function saveHabitTicks(ownerId: string, extras: Record<string, unknown>, ticks: HabitTicks) {
  // The last 14 days are enough for an undo.
  const days = Object.fromEntries(Object.entries(ticks.days).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14));
  const { error } = await writeExtra(ownerId, "habitTicks", { many: ticks.many, days });
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

/** Which habits count every tick, and today's ticks after the first. */
export async function habitTicksAction(day: string): Promise<HabitTicksSeed> {
  const ownerId = await requireProfileId();
  return habitTicksSeed((await readExtras(ownerId)).habitTicks, day);
}

/** A habit counts every tick (many times a day), or goes back to once a day. */
export async function setHabitManyAction(riteId: string, on: boolean) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(riteId)) throw new Error("Unknown habit.");
  const extras = await readExtras(ownerId);
  const ticks = cleanHabitTicks(extras.habitTicks);
  ticks.many = on ? [...new Set([...ticks.many, riteId])] : ticks.many.filter((id) => id !== riteId);
  await saveHabitTicks(ownerId, extras, ticks);
}

/** Done again today: pays the habit's XP and coins once more and counts it. */
export async function tickHabitAgainAction(riteId: string, day: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) throw new Error("That habit is gone.");
  const extras = await readExtras(ownerId);
  const ticks = cleanHabitTicks(extras.habitTicks);
  const earned = Math.max(0, rite.xp_value);
  const coinAdjust = rite.coin_value == null ? 0 : Math.max(0, rite.coin_value) - coinsForXp(rite.xp_value);
  const list = [...(ticks.days[day]?.[riteId] ?? []), [earned, coinAdjust] as [number, number]];
  ticks.days[day] = { ...(ticks.days[day] ?? {}), [riteId]: list };
  await saveHabitTicks(ownerId, extras, ticks);
  let coinsEarned = 0;
  if (earned > 0) coinsEarned = (await xp.awardXp(ownerId, earned, "task_completed")).coinsEarned;
  if (coinAdjust !== 0) {
    await rewardsData.addCoins(ownerId, coinAdjust);
    coinsEarned += coinAdjust;
  }
  revalidatePath("/");
  return { xp: earned, coinsEarned, extra: list.length };
}

/** Take back the last extra tick of the day (what it paid). False when there was none: undo the habit itself. */
export async function undoHabitTickAction(riteId: string, day: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  if (!QUEST_ID.test(riteId)) throw new Error("Unknown habit.");
  const extras = await readExtras(ownerId);
  const ticks = cleanHabitTicks(extras.habitTicks);
  const list = [...(ticks.days[day]?.[riteId] ?? [])];
  const last = list.pop();
  if (!last) return { undone: false, extra: 0 };
  ticks.days[day] = { ...(ticks.days[day] ?? {}), [riteId]: list };
  await saveHabitTicks(ownerId, extras, cleanHabitTicks(ticks));
  if (last[0] > 0) await xp.awardXp(ownerId, -last[0], "task_completed").catch(() => {});
  if (last[1] !== 0) await rewardsData.addCoins(ownerId, -last[1]).catch(() => {});
  revalidatePath("/");
  return { undone: true, extra: list.length };
}

/** The XP changed on the celebration (owner, Nov 16): the habit pays that from now on, and the tick just made is paid the difference. */
export async function setHabitXpNowAction(riteId: string, day: string, xpValue: number) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) throw new Error("That habit is gone.");
  const next = Math.max(0, Math.min(500, Math.round(Number(xpValue) || 0)));
  const db = supabaseAdmin();
  const { error } = await db.from("rites").update({ xp_value: next }).eq("owner_id", ownerId).eq("id", riteId);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  const extras = await readExtras(ownerId);
  const ticks = cleanHabitTicks(extras.habitTicks);
  const list = [...(ticks.days[day]?.[riteId] ?? [])];
  let delta = 0;
  if (list.length) {
    // The latest tick was an extra one.
    delta = next - list[list.length - 1][0];
    list[list.length - 1] = [next, list[list.length - 1][1]];
    ticks.days[day] = { ...(ticks.days[day] ?? {}), [riteId]: list };
    await saveHabitTicks(ownerId, extras, ticks);
  } else {
    // It was the day's first: the completion itself.
    const { data } = await db.from("rite_completions").select("xp_awarded").eq("owner_id", ownerId).eq("rite_id", riteId).eq("day", day).maybeSingle<{ xp_awarded: number }>();
    if (data) {
      delta = next - data.xp_awarded;
      await db.from("rite_completions").update({ xp_awarded: next }).eq("owner_id", ownerId).eq("rite_id", riteId).eq("day", day);
    }
  }
  if (delta !== 0) await xp.awardXp(ownerId, delta, "task_completed").catch(() => {});
  revalidatePath("/");
  return { xp: next };
}
