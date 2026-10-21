import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { catchUpOrder, catchUpPlan } from "@/lib/catch-up";
import type { Task } from "./types";

export type StandIn = { id: string; title: string; due_at: string | null; next_step: string | null; board: string | null };

/**
 * A stand-in quest ("AR class homework") speaks for a board: it keeps its own
 * clear title, but takes the due date and priority of that board's current
 * assignment (what's coming up first, then the oldest missed one), and shows
 * which assignment and step that is.
 */
export async function applyStandIns<T extends Task>(ownerId: string, tasks: T[]): Promise<(T & { stand_in?: StandIn | null })[]> {
  const standIns = tasks.filter((t) => t.stands_for);
  if (!standIns.length) return tasks;
  const db = supabaseAdmin();
  const { data: boards } = await db.from("boards").select("id, title, parent_board_id").eq("owner_id", ownerId);
  const all = (boards ?? []) as { id: string; title: string; parent_board_id: string | null }[];
  const inside = (root: string) => {
    const set = new Set([root]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const b of all) if (b.parent_board_id && set.has(b.parent_board_id) && !set.has(b.id)) (set.add(b.id), (grew = true));
    }
    return set;
  };
  const scopes = new Map(standIns.map((t) => [t.id, inside(t.stands_for!)]));
  const ids = [...new Set([...scopes.values()].flatMap((s) => [...s]))];
  const { data: rows } = await db
    .from("tasks")
    .select("id, title, due_at, estimate_minutes, importance, urgency, board_id, needs_review, stands_for")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .eq("is_aspiration", false)
    .in("board_id", ids);
  type Cand = { id: string; title: string; due_at: string | null; estimate_minutes: number | null; importance: number | null; urgency: number | null; board_id: string | null; needs_review: boolean; stands_for: string | null; board: string | null };
  const candidates = ((rows ?? []) as Omit<Cand, "board">[]).filter((r) => !r.stands_for);
  const names = new Map(all.map((b) => [b.id, b.title]));
  const now = new Date();
  const picks = new Map<string, Cand>();
  for (const t of standIns) {
    const scope = scopes.get(t.id)!;
    const mine: Cand[] = candidates.filter((c) => c.board_id && scope.has(c.board_id)).map((c) => ({ ...c, due_at: c.due_at ?? null, board: names.get(c.board_id!) ?? null }));
    const first = catchUpOrder(catchUpPlan(mine, now))[0];
    if (first) picks.set(t.id, first);
  }
  // The next step inside each current assignment.
  const pickIds = [...new Set([...picks.values()].map((p) => p.id))];
  const nextStep = new Map<string, string>();
  if (pickIds.length) {
    const { data: steps } = await db.from("quest_steps").select("id, task_id, title, done, state, parent_id, sort_order").eq("owner_id", ownerId).in("task_id", pickIds).order("sort_order");
    const list = (steps ?? []) as { id: string; task_id: string; title: string; done: boolean; state: string | null; parent_id: string | null }[];
    for (const id of pickIds) {
      const mine = list.filter((s) => s.task_id === id);
      const holders = new Set(mine.map((s) => s.parent_id).filter(Boolean));
      const kids = new Map<string | null, typeof mine>();
      for (const s of mine) kids.set(s.parent_id, [...(kids.get(s.parent_id) ?? []), s]);
      const ordered: typeof mine = [];
      const walk = (p: string | null) => {
        for (const s of kids.get(p) ?? []) {
          ordered.push(s);
          walk(s.id);
        }
      };
      walk(null);
      const next = ordered.find((s) => !holders.has(s.id) && !s.done && !s.state);
      if (next) nextStep.set(id, next.title);
    }
  }
  return tasks.map((t) => {
    if (!t.stands_for) return t;
    const p = picks.get(t.id);
    if (!p) return { ...t, stand_in: null };
    return {
      ...t,
      due_at: p.due_at ?? t.due_at,
      importance: Math.max(t.importance ?? 0, p.importance ?? 0),
      urgency: Math.max(t.urgency ?? 0, p.urgency ?? 0),
      estimate_minutes: t.estimate_minutes ?? p.estimate_minutes,
      stand_in: { id: p.id, title: p.title, due_at: p.due_at, next_step: nextStep.get(p.id) ?? null, board: names.get(p.board_id!) ?? null },
    };
  });
}

/** The assignment a stand-in quest points at right now (to complete it instead). */
export async function currentAssignment(ownerId: string, task: Task): Promise<string | null> {
  const [enriched] = await applyStandIns(ownerId, [task]);
  return (enriched as { stand_in?: StandIn | null }).stand_in?.id ?? null;
}
