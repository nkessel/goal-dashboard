import "server-only";
import { revalidatePath } from "next/cache";
import * as tasksData from "@/lib/data/tasks";
import * as ritesData from "@/lib/data/rites";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  archiveTaskForOwner,
  completeRiteForOwner,
  deleteTaskForOwner,
  finishTaskForOwner,
  reopenTaskForOwner,
  restoreArchivedQuestForOwner,
  setCoreHabitForOwner,
  uncompleteRiteForOwner,
  tickRiteStepForOwner,
  updateRiteForOwner,
} from "@/lib/data/quest-ops";
import { undoCheckIn } from "./checkins";
import { DuetError, isUuid } from "./pure";
import { getChange, latestChange, markUndone, type LoggedChange } from "./log";
import { questById } from "./load";
import { applyQuestEdit, setPlacementColumns, type QPatch } from "./quests";
import { setSlot, type HabitBefore } from "./habits";
import { removeEmptyBoard } from "./boards";
import type { Out } from "./types";

type Order = { order: { id: string; sort_order: number }[] };

async function restoreOrders(ownerId: string, table: "tasks" | "rites" | "boards", rows: Order["order"]) {
  const db = supabaseAdmin();
  const res = await Promise.all(rows.map((r) => db.from(table).update({ sort_order: r.sort_order }).eq("id", r.id).eq("owner_id", ownerId)));
  const bad = res.find((r) => r.error);
  if (bad?.error) throw new DuetError(`Couldn't put the order back: ${bad.error.message}`);
  revalidatePath("/");
  if (table === "boards") revalidatePath("/boards", "layout");
}

async function undoIt(ownerId: string, c: LoggedChange): Promise<{ summary: string; notes: string[] }> {
  const id = c.target_id;
  const before = (c.before ?? {}) as Record<string, unknown>;
  const notes: string[] = [];
  const need = () => {
    if (!id) throw new DuetError("That change has no target to undo.");
    return id;
  };
  switch (c.action) {
    case "add_quest": {
      if (!(await questById(ownerId, need()))) return { summary: "That quest is already gone.", notes };
      await deleteTaskForOwner(ownerId, need());
      return { summary: "Removed the quest that was added (any XP it had paid was taken back).", notes };
    }
    case "edit_quest": {
      const row = await questById(ownerId, need());
      if (!row) throw new DuetError("That quest isn't there any more.");
      notes.push(...(await applyQuestEdit(ownerId, row, before as QPatch)));
      return { summary: `Put "${row.title}" back as it was before the edit.`, notes };
    }
    case "place_quest": {
      await setPlacementColumns(ownerId, need(), before as { is_manual_priority: boolean; in_additional: boolean; sort_order: number });
      return { summary: "Put the quest back where it was on Today.", notes };
    }
    case "move_quest":
      await restoreOrders(ownerId, "tasks", (before as Order).order);
      return { summary: "Put Today's Quests back in their earlier order.", notes };
    case "complete_quest": {
      const row = await questById(ownerId, need());
      if (!row || row.status !== "completed") return { summary: "That quest isn't completed any more, so there was nothing to undo.", notes };
      // Reopening takes back everything the completion paid, its early-bird bonus included.
      await reopenTaskForOwner(ownerId, need());
      await setPlacementColumns(ownerId, need(), before as { is_manual_priority: boolean; in_additional: boolean; sort_order: number });
      notes.push("XP and coins (early-bird bonus included) were taken back. If it was part of a sequence, the next quest that stepped forward stays where it is.");
      return { summary: `Reopened "${row.title}" and put it back where it was on Today.`, notes };
    }
    case "reopen_quest": {
      const row = await questById(ownerId, need());
      if (!row || row.status !== "open") return { summary: "That quest isn't open any more, so there was nothing to undo.", notes };
      if (before.failed_at) await tasksData.failTask(need(), ownerId, (before.fail_reason as string | null) ?? null);
      else await finishTaskForOwner(ownerId, need(), (before.completed_at as string | null) ?? undefined);
      return { summary: `Completed "${row.title}" again.`, notes };
    }
    case "archive_quest": {
      const r = await restoreArchivedQuestForOwner(ownerId, need());
      return { summary: `Restored "${r.title}".`, notes };
    }
    case "restore_quest":
      await archiveTaskForOwner(ownerId, need());
      return { summary: "Archived the quest again.", notes };
    case "add_habit":
    case "restore_habit":
      await ritesData.archiveRite(need(), ownerId);
      revalidatePath("/");
      return { summary: c.action === "add_habit" ? "Removed the habit that was added (archived, history kept)." : "Removed the habit again.", notes };
    case "remove_habit":
      await ritesData.restoreRite(need(), ownerId);
      revalidatePath("/");
      return { summary: "Brought the habit back.", notes };
    case "edit_habit": {
      const b = before as unknown as HabitBefore;
      await updateRiteForOwner(ownerId, need(), { title: b.title, xpValue: b.xp_value, days: b.days, dueTime: b.due_time, coinValue: b.coin_value, estimateMinutes: b.estimate_minutes, repeat: (b.repeat ?? null) as never, isCore: b.is_core });
      await setSlot(ownerId, need(), b.slot);
      await setCoreHabitForOwner(ownerId, need(), b.plan_core);
      return { summary: `Put "${b.title}" back as it was before the edit.`, notes };
    }
    case "move_habit":
      await restoreOrders(ownerId, "rites", (before as Order).order);
      return { summary: "Put the habits back in their earlier order.", notes };
    case "complete_habit":
      await uncompleteRiteForOwner(ownerId, need(), String(before.day));
      return { summary: `Un-completed the habit for ${before.day}.`, notes };
    case "uncomplete_habit":
      await completeRiteForOwner(ownerId, need(), String(before.day), Number(before.pct) || 100);
      return { summary: `Marked the habit done again for ${before.day}.`, notes };
    case "tick_subhabit": {
      const r = await tickRiteStepForOwner(ownerId, need(), String(before.step_id), String(before.day), before.on === true);
      if (r.completed) notes.push("That finished the habit again, XP and coins paid.");
      if (r.uncompleted) notes.push("The habit is no longer done; its XP and coins were taken back.");
      return { summary: `${before.on === true ? "Ticked" : "Unticked"} the sub-habit again for ${before.day}.`, notes };
    }
    case "check_in":
    case "remove_check_in":
      return { summary: await undoCheckIn(ownerId, c.action, c.before, c.after), notes };
    case "add_board": {
      const why = await removeEmptyBoard(ownerId, need());
      if (why) throw new DuetError(why);
      return { summary: "Removed the board that was added.", notes };
    }
    case "edit_board": {
      const { error } = await supabaseAdmin().from("boards").update({ title: before.title, parent_board_id: before.parent_board_id, sort_order: before.sort_order }).eq("id", need()).eq("owner_id", ownerId);
      if (error) throw new DuetError(`Couldn't put the board back: ${error.message}`);
      revalidatePath("/boards", "layout");
      return { summary: `Put the board back as "${before.title}".`, notes };
    }
    case "move_board":
      await restoreOrders(ownerId, "boards", (before as Order).order);
      return { summary: "Put the boards back in their earlier order.", notes };
    default:
      throw new DuetError(`Can't undo "${c.action}".`);
  }
}

export async function undo(ownerId: string, args: Record<string, unknown>): Promise<Out> {
  const given = args.change_id;
  if (given !== undefined && !isUuid(given)) throw new DuetError("change_id must be an id from an earlier result.");
  const c = given ? await getChange(ownerId, given as string) : await latestChange(ownerId);
  if (!c) throw new DuetError(given ? "No change with that id." : "Nothing to undo.");
  if (c.undone_at) throw new DuetError("That change was already undone.");
  const r = await undoIt(ownerId, c);
  await markUndone(ownerId, c.id);
  return { summary: `Undid ${c.action.replace(/_/g, " ")}: ${r.summary}`, notes: r.notes, data: { undone_change_id: c.id, action: c.action } };
}
