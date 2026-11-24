"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import * as schedulingData from "@/lib/data/scheduling";
import { writeExtra } from "@/lib/data/extras";
import { revalidatePath } from "next/cache";
import * as tasksData from "@/lib/data/tasks";
import * as stepsData from "@/lib/data/steps";
import * as ritesData from "@/lib/data/rites";
import { stepsComplete } from "@/lib/habit-steps";
import * as xp from "@/lib/data/xp";
import * as rewardsData from "@/lib/data/rewards";
import { requireProfileId, guideTasks, readExtras, assertDay } from "./_shared";
import { completeRiteAction, uncompleteRiteAction } from "./evening";

// ---- Getting up to date on coursework.
/** Your boards with dated quests (imports included), for the catch-up plan. */
export async function courseworkAction() {
  const ownerId = await requireProfileId();
  const [tasks, extras] = await Promise.all([guideTasks(ownerId, { imports: true }), readExtras(ownerId)]);
  const dated = tasks.filter((t) => t.due_at && t.board_id);
  const byBoard = new Map<string, { id: string; title: string; dated: number }>();
  for (const t of dated) {
    const b = byBoard.get(t.board_id!) ?? { id: t.board_id!, title: t.board ?? "Board", dated: 0 };
    b.dated += 1;
    byBoard.set(t.board_id!, b);
  }
  const saved = (extras.catchUp as { boards?: string[] } | undefined)?.boards ?? null;
  return {
    boards: [...byBoard.values()].sort((a, b) => b.dated - a.dated),
    chosen: saved,
    items: tasks.filter((t) => t.board_id && byBoard.has(t.board_id)).map((t) => ({ id: t.id, title: t.title, due_at: t.due_at, estimate_minutes: t.estimate_minutes, board: t.board, board_id: t.board_id, needs_review: t.needs_review, scheduled_start: t.scheduled_start })),
  };
}

/**
 * Use a catch-up plan: its imported quests become real quests, estimates are
 * kept, and the whole order goes to the top of your scheduling list (so the
 * scheduler, the toucan and Today all follow it).
 */
export async function applyCatchUpAction(boardIds: string[], orderedIds: string[], estimates: Record<string, number>) {
  const ownerId = await requireProfileId();
  const db = supabaseAdmin();
  const ids = [...new Set(orderedIds)].slice(0, 80);
  if (ids.length) await db.from("tasks").update({ needs_review: false }).eq("owner_id", ownerId).in("id", ids).eq("needs_review", true);
  await Promise.all(
    Object.entries(estimates)
      .filter(([id, m]) => ids.includes(id) && m > 0)
      .map(([id, m]) => db.from("tasks").update({ estimate_minutes: Math.max(5, Math.min(600, Math.round(m))) }).eq("owner_id", ownerId).eq("id", id))
  );
  const current = (await schedulingData.listSchedulingList(ownerId)).map((t) => t.id).filter((id) => !ids.includes(id));
  await schedulingData.setSchedulingOrder(ownerId, [...ids, ...current]);
  await writeExtra(ownerId, "catchUp", { boards: boardIds.slice(0, 20), at: new Date().toISOString() });
  revalidatePath("/", "layout");
}

/** How much the toucan does (simple, light guide, full guide) and which of his lines are switched off. */
export async function saveToucanPrefsAction(patch: { mode?: "simple" | "lite" | "full"; retired?: string[] }) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const prev = (extras.toucanPrefs as { mode?: string; retired?: string[] } | undefined) ?? {};
  const next = {
    mode: patch.mode && ["simple", "lite", "full"].includes(patch.mode) ? patch.mode : (prev.mode ?? "full"),
    retired: Array.isArray(patch.retired) ? patch.retired.filter((x) => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 200) : (prev.retired ?? []),
  };
  await writeExtra(ownerId, "toucanPrefs", next);
}

export async function toucanPrefsAction() {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const p = (extras.toucanPrefs as { mode?: "simple" | "lite" | "full"; retired?: string[] } | undefined) ?? {};
  const { cleanStyle } = await import("@/lib/toucan-style");
  return { mode: p.mode ?? "full", retired: p.retired ?? [], style: cleanStyle(extras.toucanStyle) };
}

/** Save how you like to be checked in (the check-in quiz, or Settings). */
export async function saveToucanStyleAction(style: unknown) {
  const ownerId = await requireProfileId();
  const { cleanStyle } = await import("@/lib/toucan-style");
  const clean = cleanStyle(style);
  await writeExtra(ownerId, "toucanStyle", clean);
  revalidatePath("/", "layout");
  return clean;
}

/** The colour theme for the Adventure look (forest, moonlit, ember…). */
export async function savePaletteAction(palette: string) {
  const ownerId = await requireProfileId();
  const { isPalette } = await import("@/lib/palettes");
  if (!isPalette(palette)) throw new Error("That isn't one of the colour themes.");
  await writeExtra(ownerId, "palette", palette);
  revalidatePath("/", "layout");
}

export async function saveMapPrefsAction(boardId: string, prefs: Record<string, unknown>) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const all = { ...((extras.mapPrefs as Record<string, unknown>) ?? {}), [boardId.slice(0, 40)]: JSON.parse(JSON.stringify(prefs ?? {})) };
  await writeExtra(ownerId, "mapPrefs", all);
}

/* ── Quest sequences ─────────────────────────────────────────────────── */
/** The sequence a quest belongs to, front to back. */
export async function sequenceOfAction(taskId: string) {
  const ownerId = await requireProfileId();
  const { sequenceOf } = await import("@/lib/data/sequences");
  return sequenceOf(ownerId, taskId);
}

/** One quest, whole, to open in the editor from somewhere that only has its id (e.g. a quest waiting in a sequence). */
export async function questForEditAction(taskId: string) {
  const ownerId = await requireProfileId();
  return tasksData.getTask(taskId, ownerId);
}

/** Open quests to pick from when adding one to a sequence (title search). */
export async function findQuestsAction(query: string, exclude: string[] = []) {
  const ownerId = await requireProfileId();
  let q = supabaseAdmin().from("tasks").select("id, title, board_id, icon_key").eq("owner_id", ownerId).eq("status", "open").is("reward_id", null);
  const term = query.replace(/[%,()]/g, " ").trim();
  if (term) q = q.ilike("title", `%${term}%`);
  const { data } = await q.order("updated_at", { ascending: false }).limit(40);
  const skip = new Set(exclude);
  return ((data ?? []) as { id: string; title: string; board_id: string | null; icon_key: string | null }[]).filter((t) => !skip.has(t.id)).slice(0, 12);
}

/**
 * Put a quest before or after another in its sequence: an existing quest, or
 * a new one by title (made on the same board). Returns the updated sequence.
 */
export async function sequenceLinkAction(anchorId: string, where: "before" | "after", pick: { id: string } | { title: string }) {
  const ownerId = await requireProfileId();
  const seq = await import("@/lib/data/sequences");
  const anchor = await tasksData.getTask(anchorId, ownerId);
  if (!anchor) throw new Error("That quest isn't there any more.");
  let id: string;
  if ("id" in pick) id = pick.id;
  else {
    const title = pick.title.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!title) throw new Error("Give the new quest a name.");
    const made = await tasksData.createTask(ownerId, { title, boardId: anchor.board_id ?? null, goalId: anchor.goal_id ?? null });
    id = made.id;
  }
  // A quest already in a sequence just moves here.
  if (where === "after") await seq.placeAfter(ownerId, id, anchorId);
  else {
    await seq.placeBefore(ownerId, id, anchorId);
    // The quest put in front takes the anchor's place (owner, Nov 4: adding a pre-quest to a quest on
    // Today made both vanish: the anchor was locked away and the new one wasn't on Today).
    const take: Record<string, unknown> = {};
    const order = (anchor as unknown as { sort_order?: number }).sort_order;
    if (typeof order === "number") take.sort_order = order;
    if (anchor.is_manual_priority) take.is_manual_priority = true;
    if (Object.keys(take).length) await supabaseAdmin().from("tasks").update(take).eq("owner_id", ownerId).eq("id", id).eq("status", "open");
  }
  revalidatePath("/", "layout");
  return seq.sequenceOf(ownerId, anchorId);
}

/**
 * Turn a quest into a project: each of its open top-level steps becomes its
 * own quest, in order, ahead of this one (their sub-tasks come along as their
 * steps). The quest itself comes last and closes the project out.
 */
export async function stepsToSequenceAction(taskId: string) {
  const ownerId = await requireProfileId();
  const seq = await import("@/lib/data/sequences");
  const anchor = await tasksData.getTask(taskId, ownerId);
  if (!anchor) throw new Error("That quest isn't there any more.");
  const all = (await stepsData.listStepsForTask(taskId, ownerId)) ?? [];
  const tops = all.filter((s) => !s.parent_id && !s.done && !s.state);
  if (!tops.length) throw new Error("This quest has no open steps to turn into quests.");
  const under = (id: string): typeof all => all.filter((s) => s.parent_id === id).flatMap((s) => [s, ...under(s.id)]);
  const moved = new Set<string>();
  for (const [i, st] of tops.entries()) {
    const made = await tasksData.createTask(ownerId, {
      title: st.title.slice(0, 200),
      boardId: anchor.board_id ?? null,
      goalId: anchor.goal_id ?? null,
      // The first one takes the project's place on Today.
      isManualPriority: i === 0 && !!anchor.is_manual_priority,
    });
    await seq.placeBefore(ownerId, made.id, taskId);
    const kids = under(st.id);
    if (kids.length) {
      await stepsData.replaceSteps(
        made.id,
        ownerId,
        kids.map((k) => ({ key: k.id, parentKey: k.parent_id === st.id ? null : (k.parent_id ?? null), title: k.title, done: k.done, xp: k.xp ?? 0, weight: k.weight ?? null, progress: k.progress ?? 0, state: k.state ?? null }))
      );
    }
    moved.add(st.id);
    for (const k of kids) moved.add(k.id);
  }
  await stepsData.replaceSteps(
    taskId,
    ownerId,
    all.filter((s) => !moved.has(s.id)).map((s) => ({ id: s.id, key: s.id, parentKey: s.parent_id ?? null, title: s.title, done: s.done, xp: s.xp ?? 0, weight: s.weight ?? null, progress: s.progress ?? 0, state: s.state ?? null }))
  );
  revalidatePath("/", "layout");
  return seq.sequenceOf(ownerId, taskId);
}

/** Take a quest out of its sequence (the rest close up). */
export async function sequenceDetachAction(taskId: string, viewFrom?: string) {
  const ownerId = await requireProfileId();
  const seq = await import("@/lib/data/sequences");
  await seq.detachFromSequence(ownerId, taskId);
  revalidatePath("/", "layout");
  return viewFrom ? seq.sequenceOf(ownerId, viewFrom) : [];
}

/** Move a quest one place earlier or later in its sequence. */
/**
 * The open quests of a sequence in a new order (the sequence window's cards are dragged, owner Nov 4).
 * The front quest takes the old front's place on Today, so the sequence never drops out of sight.
 */
export async function sequenceReorderAction(ids: string[], viewFrom: string) {
  const ownerId = await requireProfileId();
  const seq = await import("@/lib/data/sequences");
  const chain = (await seq.sequenceOf(ownerId, viewFrom)).filter((t) => t.status === "open" && !t.reward);
  const known = new Set(chain.map((c) => c.id));
  const order = ids.filter((id) => known.has(id));
  if (order.length !== chain.length || order.every((id, i) => id === chain[i].id)) return seq.sequenceOf(ownerId, viewFrom);
  const db = supabaseAdmin();
  const { data: front } = await db.from("tasks").select("locked_by_task_id, is_manual_priority, sort_order").eq("owner_id", ownerId).eq("id", chain[0].id).maybeSingle<{ locked_by_task_id: string | null; is_manual_priority: boolean; sort_order: number | null }>();
  for (let i = 0; i < order.length; i++) {
    const patch: Record<string, unknown> = { locked_by_task_id: i === 0 ? (front?.locked_by_task_id ?? null) : order[i - 1] };
    if (i === 0 && order[0] !== chain[0].id) {
      if (front?.is_manual_priority) patch.is_manual_priority = true;
      if (typeof front?.sort_order === "number") patch.sort_order = front.sort_order;
    }
    await db.from("tasks").update(patch).eq("owner_id", ownerId).eq("id", order[i]);
  }
  revalidatePath("/", "layout");
  return seq.sequenceOf(ownerId, viewFrom);
}

export async function sequenceMoveAction(taskId: string, dir: -1 | 1, viewFrom?: string) {
  const ownerId = await requireProfileId();
  const seq = await import("@/lib/data/sequences");
  const chain = (await seq.sequenceOf(ownerId, taskId)).filter((t) => t.status === "open");
  const i = chain.findIndex((t) => t.id === taskId);
  const other = chain[i + dir];
  if (i >= 0 && other) {
    if (dir < 0) await seq.placeBefore(ownerId, taskId, other.id);
    else await seq.placeAfter(ownerId, taskId, other.id);
  }
  revalidatePath("/", "layout");
  return seq.sequenceOf(ownerId, viewFrom ?? taskId);
}

/* ── Sub-habits ──────────────────────────────────────────────────────── */
/** Save a habit's sub-habit checklist. */
export async function setRiteStepsAction(riteId: string, steps: { id: string; title: string; xp?: number; coins?: number; optional?: boolean }[]) {
  const ownerId = await requireProfileId();
  const clean = ritesData.cleanRiteSteps(steps);
  await ritesData.setRiteSteps(ownerId, riteId, clean);
  revalidatePath("/");
  return clean;
}

/**
 * Tick (or untick) one sub-habit for `day`. Ticking the last required one completes the
 * habit (XP and all); unticking a required one of a completed habit undoes that.
 */
export async function tickRiteStepAction(riteId: string, stepId: string, day: string, on: boolean) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) throw new Error("That habit isn't here anymore.");
  const changed = await ritesData.setRiteStepCheck(ownerId, riteId, stepId, day, on);
  const steps = ritesData.cleanRiteSteps(rite.steps);
  // A sub-habit with its own XP or coins pays them when ticked (and takes them back when unticked).
  const step = steps.find((st) => st.id === stepId);
  if (changed && step) await payStep(ownerId, step, on ? 1 : -1);
  const checks = ((await ritesData.listRiteStepChecks(ownerId, day)) ?? []).filter((c) => c.rite_id === riteId && c.day === day);
  const ticked = new Set(checks.map((c) => c.step_id));
  // Only the required sub-habits finish it; with none required, ticks never complete or undo it.
  const all = stepsComplete(steps, (id) => ticked.has(id));
  const { data: doneRow } = await supabaseAdmin().from("rite_completions").select("id").eq("owner_id", ownerId).eq("rite_id", riteId).eq("day", day).maybeSingle();
  let completed: { xp: number; coinsEarned: number } | null = null;
  if (all === true && !doneRow) completed = await completeRiteAction(riteId, day);
  else if (all === false && doneRow) await uncompleteRiteAction(riteId, day);
  revalidatePath("/");
  return { done: all ?? !!doneRow, xp: completed?.xp ?? 0 };
}

async function payStep(ownerId: string, step: ritesData.RiteStep, sign: 1 | -1) {
  if (step.xp) await xp.awardXp(ownerId, sign * step.xp, "task_completed").catch(() => {});
  if (step.coins) await rewardsData.addCoins(ownerId, sign * step.coins).catch(() => {});
}

/** Check (or clear) every sub-habit at once, with the habit itself. */
export async function tickAllRiteStepsAction(riteId: string, day: string, on: boolean) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) return;
  for (const st of ritesData.cleanRiteSteps(rite.steps)) {
    const changed = await ritesData.setRiteStepCheck(ownerId, riteId, st.id, day, on).catch(() => false);
    if (changed) await payStep(ownerId, st, on ? 1 : -1);
  }
}

/* ── Final Boss battle plans ─────────────────────────────────────────── */
/** Your notes on how to beat a Final Boss (kept with your account). */
export async function bossPlanAction(bossId: string) {
  const ownerId = await requireProfileId();
  const plans = ((await readExtras(ownerId)).bossPlans as Record<string, string> | undefined) ?? {};
  return typeof plans[bossId] === "string" ? plans[bossId] : "";
}

export async function saveBossPlanAction(bossId: string, text: string) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const plans = { ...((extras.bossPlans as Record<string, string> | undefined) ?? {}) };
  const t = text.slice(0, 4000);
  if (t.trim()) plans[bossId] = t;
  else delete plans[bossId];
  await writeExtra(ownerId, "bossPlans", plans);
}
