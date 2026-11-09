import type { Task } from "@/lib/data/types";

/** How a board's quests are listed (owner, Nov 5: "a board's quests ordered manually, by due date or other"). */
export type BoardOrderBy = "mine" | "due" | "new" | "xp" | "az";
export type BoardOrder = { by: BoardOrderBy; ids?: string[] };

export const BOARD_ORDERS: { by: BoardOrderBy; label: string }[] = [
  { by: "mine", label: "My order" },
  { by: "due", label: "Due soonest" },
  { by: "new", label: "Newest" },
  { by: "xp", label: "Most XP" },
  { by: "az", label: "A–Z" },
];

export function normalizeBoardOrder(v: unknown): BoardOrder {
  const o = (v ?? {}) as { by?: unknown; ids?: unknown };
  const by = BOARD_ORDERS.some((x) => x.by === o.by) ? (o.by as BoardOrderBy) : "mine";
  const ids = Array.isArray(o.ids) ? o.ids.filter((x): x is string => typeof x === "string").slice(0, 500) : undefined;
  return ids?.length ? { by, ids } : { by };
}

/** The quests in the chosen order. "My order" keeps your arrangement; quests not in it yet follow in the board's own order. */
export function orderQuests<T extends Pick<Task, "id" | "title" | "xp_value" | "created_at"> & { due_at?: string | null }>(tasks: T[], order: BoardOrder): T[] {
  const list = [...tasks];
  const due = (t: T) => (t.due_at ? Date.parse(t.due_at) : Infinity);
  switch (order.by) {
    case "due":
      return list.sort((a, b) => due(a) - due(b));
    case "new":
      return list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    case "xp":
      return list.sort((a, b) => (b.xp_value ?? 0) - (a.xp_value ?? 0));
    case "az":
      return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    default: {
      if (!order.ids?.length) return list;
      const at = new Map(order.ids.map((id, i) => [id, i]));
      return list.map((t, i) => [t, at.get(t.id) ?? order.ids!.length + i] as const).sort((a, b) => a[1] - b[1]).map(([t]) => t);
    }
  }
}
