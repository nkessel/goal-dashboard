import "server-only";
// The Duet dispatcher: every function here takes the owner's id explicitly (it never reads a session).
import { DuetError } from "./pure";
import { recordChange } from "./log";
import { today, find, board } from "./reads";
import { addQuest, editQuest, placeQuest, moveQuest, completeQuest, reopenQuest, archiveQuest, restoreQuest } from "./quests";
import { addHabit, editHabit, moveHabit, completeHabit, uncompleteHabit, removeHabit, restoreHabit } from "./habits";
import { addBoard, editBoard, moveBoard } from "./boards";
import { undo } from "./undo";
import type { Args, Out } from "./types";

type Handler = (ownerId: string, args: Args) => Promise<Out>;

export const ACTIONS: Record<string, Handler> = {
  today, find, board,
  add_quest: addQuest, edit_quest: editQuest, place_quest: placeQuest, move_quest: moveQuest,
  complete_quest: completeQuest, reopen_quest: reopenQuest, archive_quest: archiveQuest, restore_quest: restoreQuest,
  add_habit: addHabit, edit_habit: editHabit, move_habit: moveHabit, complete_habit: completeHabit,
  uncomplete_habit: uncompleteHabit, remove_habit: removeHabit, restore_habit: restoreHabit,
  add_board: addBoard, edit_board: editBoard, move_board: moveBoard,
  undo,
};

export type DuetResult = { ok: true; change_id?: string; summary: string; data?: unknown; notes?: string[] } | { ok: false; error: string; candidates?: unknown[] };

export async function runDuet(ownerId: string, action: string, args: Args): Promise<DuetResult> {
  const handler = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!handler) return { ok: false, error: `Unknown action "${action}". Actions: ${Object.keys(ACTIONS).join(", ")}.` };
  try {
    const out = await handler(ownerId, args);
    const notes = [...(out.notes ?? [])];
    let change_id: string | undefined;
    if (out.change) {
      const id = await recordChange(ownerId, action, args, out.change);
      if (id) change_id = id;
      else notes.push("The change was made, but it couldn't be logged, so undo isn't available for it.");
    }
    return { ok: true, ...(change_id ? { change_id } : {}), summary: out.summary, ...(out.data !== undefined ? { data: out.data } : {}), ...(notes.length ? { notes } : {}) };
  } catch (e) {
    if (e instanceof DuetError) return { ok: false, error: e.message, ...(e.candidates?.length ? { candidates: e.candidates } : {}) };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
