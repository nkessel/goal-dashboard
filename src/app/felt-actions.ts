"use server";

// "How do you feel?" (owner, Nov 19): five faces, -2 … 2, after a victory, a fail and a habit tick.
// Events and tracked events keep theirs on check_in_notes.tone. Kept out of actions.ts on purpose
// (it is being split by area; see docs/ACTIONS-SPLIT-PLAN.md).

import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export type FeltTarget = { kind: "quest"; id: string } | { kind: "habit"; riteId: string; day: string } | { kind: "note"; id: string };

async function me(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

/** Save (or clear, with null) how something felt. */
export async function setFeltAction(target: FeltTarget, felt: number | null) {
  const ownerId = await me();
  if (felt != null && !(Number.isInteger(felt) && felt >= -2 && felt <= 2)) throw new Error("That face isn't one of the five.");
  const db = supabaseAdmin();
  if (target.kind === "quest") {
    const { error } = await db.from("tasks").update({ felt }).eq("owner_id", ownerId).eq("id", target.id);
    if (error) throw new Error(`Couldn't save how it felt: ${error.message}`);
  } else if (target.kind === "habit") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target.day)) throw new Error("That day doesn't look right.");
    const { error } = await db.from("rite_completions").update({ felt }).eq("owner_id", ownerId).eq("rite_id", target.riteId).eq("day", target.day);
    if (error) throw new Error(`Couldn't save how it felt: ${error.message}`);
  } else {
    const { error } = await db.from("check_in_notes").update({ tone: felt }).eq("owner_id", ownerId).eq("id", target.id);
    if (error) throw new Error(`Couldn't save how it felt: ${error.message}`);
  }
}
