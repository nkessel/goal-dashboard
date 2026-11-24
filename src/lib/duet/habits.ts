import "server-only";
import { revalidatePath } from "next/cache";
import * as ritesData from "@/lib/data/rites";
import { supabaseAdmin } from "@/lib/supabase/server";
import { appDayKey } from "@/lib/data/tomorrow";
import {
  cleanHabitPlan,
  completeRiteForOwner,
  createRiteForOwner,
  readExtrasOf,
  setCoreHabitForOwner,
  tickRiteStepForOwner,
  uncompleteRiteForOwner,
  updateRiteForOwner,
} from "@/lib/data/quest-ops";
import { DuetError, anchorOf, clampInt, dayNames, isDay, moveAround, parseClock, parseDays } from "./pure";
import { habits as loadHabits, pick, slotOf, type HabitRow } from "./load";
import type { Args, Out } from "./types";

const has = (a: Args, k: string) => a[k] !== undefined;
const slotArg = (v: unknown): "day" | "evening" => {
  if (v !== "day" && v !== "evening") throw new DuetError('slot must be "day" (a daily habit) or "evening" (an evening rite).');
  return v;
};

/** A repeat "every N units from a day" (instead of weekdays), checked here because the app's cleaner would quietly drop a bad one. */
function repeatArg(v: unknown): { every: number; unit: "day" | "week" | "month" | "year"; from: string } | null {
  if (v === null) return null;
  const r = (v ?? {}) as { every?: unknown; unit?: unknown; from?: unknown };
  const every = Math.round(Number(r.every));
  if (!(every >= 1 && every <= 999)) throw new DuetError("repeat.every must be 1 to 999.");
  if (r.unit !== "day" && r.unit !== "week" && r.unit !== "month" && r.unit !== "year") throw new DuetError("repeat.unit must be day, week, month or year.");
  const from = r.from === undefined ? appDayKey() : r.from;
  if (!isDay(from)) throw new DuetError("repeat.from must look like 2026-11-27.");
  return { every, unit: r.unit, from };
}

const view = (h: HabitRow) => ({ id: h.id, title: h.title, slot: slotOf(h), days: dayNames(h.days), time: h.due_time ?? null, xp: h.xp_value, coins: h.coin_value ?? null, minutes: h.estimate_minutes ?? null });

async function planCore(ownerId: string, id: string) {
  return cleanHabitPlan((await readExtrasOf(ownerId)).habitPlan).core.includes(id);
}

export async function addHabit(ownerId: string, a: Args): Promise<Out> {
  const title = typeof a.title === "string" ? a.title.trim() : "";
  if (!title) throw new DuetError("Give the habit a title.");
  const slot = has(a, "slot") ? slotArg(a.slot) : "day";
  const repeat = has(a, "repeat") && a.repeat !== null ? repeatArg(a.repeat) : undefined;
  const days = repeat ? null : has(a, "days") ? parseDays(a.days) : undefined;
  const id = await createRiteForOwner(ownerId, {
    title,
    // The editor makes every daily habit "core" in the rites table; the always-in-Today's-Quests flag is the habit plan's.
    isCore: slot === "day" ? true : a.core !== false,
    xpValue: has(a, "xp") ? clampInt(a.xp, 0, 1000, "xp") : undefined,
    slot,
    days,
    dueTime: has(a, "time") ? parseClock(a.time) : undefined,
    coinValue: has(a, "coins") ? (a.coins === null ? null : clampInt(a.coins, 0, 1000, "coins")) : undefined,
    estimateMinutes: has(a, "minutes") ? (a.minutes === null ? null : clampInt(a.minutes, 0, 600, "minutes")) : undefined,
    ...(repeat ? { repeat } : {}),
  });
  if (slot === "day" && a.core === true) await setCoreHabitForOwner(ownerId, id, true);
  const h = (await loadHabits(ownerId)).find((x) => x.id === id)!;
  return { summary: `Added ${slot === "day" ? "daily habit" : "evening rite"} "${title}" (${repeat ? `every ${repeat.every} ${repeat.unit}${repeat.every === 1 ? "" : "s"}` : dayNames(h.days)}).`, data: { habit: view(h) }, change: { kind: "habit", id, before: null, after: { id, title } } };
}

export type HabitBefore = { title: string; xp_value: number; days: number[] | null; due_time: string | null; coin_value: number | null; estimate_minutes: number | null; repeat: unknown; is_core: boolean; slot: "day" | "evening"; plan_core: boolean };

export async function setSlot(ownerId: string, id: string, slot: "day" | "evening") {
  const { error } = await supabaseAdmin().from("rites").update({ slot, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_id", ownerId);
  if (error) throw new DuetError(`Couldn't move the habit: ${error.message}`);
  revalidatePath("/");
}

export async function editHabit(ownerId: string, a: Args): Promise<Out> {
  const h = pick(await loadHabits(ownerId), a.habit, "habit");
  const before: HabitBefore = {
    title: h.title, xp_value: h.xp_value, days: h.days ?? null, due_time: h.due_time ?? null, coin_value: h.coin_value ?? null,
    estimate_minutes: h.estimate_minutes ?? null, repeat: h.repeat ?? null, is_core: h.is_core, slot: slotOf(h), plan_core: await planCore(ownerId, h.id),
  };
  const slot = has(a, "slot") ? slotArg(a.slot) : slotOf(h);
  const changed: string[] = [];
  const patch: Parameters<typeof updateRiteForOwner>[2] = {};
  if (has(a, "title")) { patch.title = String(a.title ?? ""); changed.push("title"); }
  if (has(a, "xp")) { patch.xpValue = clampInt(a.xp, 0, 1000, "xp"); changed.push("xp"); }
  if (has(a, "repeat")) {
    patch.repeat = repeatArg(a.repeat);
    if (patch.repeat) patch.days = null;
    changed.push("repeat");
  }
  if (has(a, "days")) {
    if (patch.repeat) throw new DuetError("Give days or repeat, not both.");
    patch.days = parseDays(a.days);
    patch.repeat = null; // weekdays replace an interval, as the editor does
    changed.push("days");
  }
  if (has(a, "time")) { patch.dueTime = parseClock(a.time); changed.push("time"); }
  if (has(a, "coins")) { patch.coinValue = a.coins === null ? null : clampInt(a.coins, 0, 1000, "coins"); changed.push("coins"); }
  if (has(a, "minutes")) { patch.estimateMinutes = a.minutes === null ? null : clampInt(a.minutes, 0, 600, "minutes"); changed.push("minutes"); }
  if (has(a, "core") && slot !== "day") { patch.isCore = a.core === true; changed.push("core"); }
  const wantSlot = slot !== slotOf(h);
  const planChange = has(a, "core") && slot === "day";
  if (!changed.length && !wantSlot && !planChange) throw new DuetError("Nothing to change: give at least one of title, slot, days, time, xp, coins, minutes, core, repeat.");
  if (Object.keys(patch).length) await updateRiteForOwner(ownerId, h.id, patch);
  if (wantSlot) { await setSlot(ownerId, h.id, slot); changed.push("slot"); }
  if (planChange) { await setCoreHabitForOwner(ownerId, h.id, a.core === true); changed.push("core"); }
  const now = (await loadHabits(ownerId)).find((x) => x.id === h.id)!;
  return { summary: `Updated habit "${h.title}": ${changed.join(", ")}.`, data: { habit: view(now) }, change: { kind: "habit", id: h.id, before, after: { ...view(now) } } };
}

export async function moveHabit(ownerId: string, a: Args): Promise<Out> {
  const rows = await loadHabits(ownerId);
  const h = pick(rows, a.habit, "habit");
  const same = rows.filter((x) => slotOf(x) === slotOf(h));
  const { ref, where } = anchorOf(a);
  const other = pick(same.filter((x) => x.id !== h.id), ref, `${slotOf(h) === "day" ? "daily habit" : "evening rite"}`);
  const order = moveAround(same.map((x) => x.id), h.id, other.id, where);
  await ritesData.reorderRites(ownerId, order.slice(0, 100));
  revalidatePath("/");
  return { summary: `Moved "${h.title}" ${where} "${other.title}".`, change: { kind: "habits", id: h.id, before: { order: same.map((x) => ({ id: x.id, sort_order: x.sort_order })) }, after: { order } } };
}

export async function completeHabit(ownerId: string, a: Args): Promise<Out> {
  const h = pick(await loadHabits(ownerId), a.habit, "habit");
  const today = appDayKey();
  if (has(a, "day") && !isDay(a.day)) throw new DuetError("day must look like 2026-11-27.");
  const day = isDay(a.day) ? a.day : today;
  if (day > today) throw new DuetError("A habit can't be completed for a day that hasn't come yet.");
  const pct = has(a, "pct") ? clampInt(a.pct, 1, 100, "pct") : 100;
  const { data: had } = await supabaseAdmin().from("rite_completions").select("id").eq("owner_id", ownerId).eq("rite_id", h.id).eq("day", day).maybeSingle();
  if (had) return { summary: `"${h.title}" is already done for ${day}.`, notes: ["No change made."] };
  const r = await completeRiteForOwner(ownerId, h.id, day, pct);
  return {
    summary: `Completed "${h.title}" for ${day}: +${r.xp} XP, ${r.coinsEarned} coin${r.coinsEarned === 1 ? "" : "s"}${pct < 100 ? ` (${pct}%)` : ""}.`,
    data: { xp: r.xp, coins_earned: r.coinsEarned },
    change: { kind: "habit", id: h.id, before: { day, done: false }, after: { day, pct, ...r } },
  };
}

export async function uncompleteHabit(ownerId: string, a: Args): Promise<Out> {
  const h = pick(await loadHabits(ownerId), a.habit, "habit");
  if (has(a, "day") && !isDay(a.day)) throw new DuetError("day must look like 2026-11-27.");
  const day = isDay(a.day) ? a.day : appDayKey();
  const { data: had } = await supabaseAdmin().from("rite_completions").select("xp_awarded").eq("owner_id", ownerId).eq("rite_id", h.id).eq("day", day).maybeSingle<{ xp_awarded: number }>();
  if (!had) return { summary: `"${h.title}" wasn't marked done for ${day}.`, notes: ["No change made."] };
  await uncompleteRiteForOwner(ownerId, h.id, day);
  const pct = h.xp_value > 0 ? Math.max(1, Math.min(100, Math.round((had.xp_awarded * 100) / h.xp_value))) : 100;
  return { summary: `Un-completed "${h.title}" for ${day}: its XP and coins were taken back.`, change: { kind: "habit", id: h.id, before: { day, done: true, pct }, after: { day, done: false } } };
}

export async function removeHabit(ownerId: string, a: Args): Promise<Out> {
  const h = pick(await loadHabits(ownerId), a.habit, "habit");
  await ritesData.archiveRite(h.id, ownerId);
  revalidatePath("/");
  return { summary: `Removed habit "${h.title}" (archived: its history is kept, restore_habit brings it back).`, change: { kind: "habit", id: h.id, before: { archived: false }, after: { archived: true } } };
}

export async function restoreHabit(ownerId: string, a: Args): Promise<Out> {
  const h = pick(await loadHabits(ownerId, true), a.habit, "removed habit");
  await ritesData.restoreRite(h.id, ownerId);
  revalidatePath("/");
  return { summary: `Restored habit "${h.title}".`, change: { kind: "habit", id: h.id, before: { archived: true }, after: { archived: false } } };
}

/** Tick (or, with `on: false`, untick) one sub-habit, as the habit's checklist does in the app. */
export async function tickSubhabit(ownerId: string, a: Args): Promise<Out> {
  const h = pick(await loadHabits(ownerId), a.habit, "habit");
  const steps = ritesData.cleanRiteSteps(h.steps);
  if (!steps.length) throw new DuetError(`"${h.title}" has no sub-habits. complete_habit checks off the whole habit.`);
  const step = pick(steps, a.step, `sub-habit of "${h.title}"`);
  if (has(a, "on") && typeof a.on !== "boolean") throw new DuetError("on must be true (tick) or false (untick).");
  const on = a.on !== false;
  const today = appDayKey();
  if (has(a, "day") && !isDay(a.day)) throw new DuetError("day must look like 2026-11-27.");
  const day = isDay(a.day) ? a.day : today;
  if (day > today) throw new DuetError("A sub-habit can't be ticked for a day that hasn't come yet.");
  const was = ((await ritesData.listRiteStepChecks(ownerId, day)) ?? []).some((c) => c.rite_id === h.id && c.step_id === step.id && c.day === day);
  const r = was === on ? null : await tickRiteStepForOwner(ownerId, h.id, step.id, day, on);
  if (!r || !r.changed) return { summary: `"${step.title}" on "${h.title}" was already ${on ? "ticked" : "unticked"} for ${day}.`, notes: ["No change made."] };
  const paid = r.stepXp || r.stepCoins ? ` (${on ? "+" : "-"}${r.stepXp} XP${r.stepCoins ? `, ${r.stepCoins} coin${r.stepCoins === 1 ? "" : "s"}` : ""})` : "";
  const tail = r.completed ? ` That finished "${h.title}": +${r.xp} XP, ${r.coinsEarned} coin${r.coinsEarned === 1 ? "" : "s"}.` : r.uncompleted ? ` "${h.title}" is no longer done; its XP and coins were taken back.` : "";
  return {
    summary: `${on ? "Ticked" : "Unticked"} "${step.title}" on "${h.title}" for ${day}${paid}.${tail}`,
    data: { habit_done: r.done, xp: r.xp, coins_earned: r.coinsEarned },
    change: { kind: "habit", id: h.id, before: { day, step_id: step.id, on: !on }, after: { day, step_id: step.id, on, completed: r.completed, uncompleted: r.uncompleted } },
  };
}
