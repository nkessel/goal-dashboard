/** The backpack: a utility pocket on top and a main pocket below, one item per slot. */

export type PocketKey = "top" | "main";
export type ItemStatus = "full" | "low" | "empty";

export type InventoryItem = {
  id: string;
  name: string;
  pocket: PocketKey;
  slot: number;
  icon: string | null;
  status: ItemStatus;
  note?: string | null;
  /** When it last ran out / was refilled (ISO). */
  emptiedAt?: string | null;
  refilledAt?: string | null;
};

export type Inventory = { slots: Record<PocketKey, number>; items: InventoryItem[] };

export const POCKETS: { key: PocketKey; label: string; hint: string }[] = [
  { key: "top", label: "Utility pocket", hint: "The little pocket on top" },
  { key: "main", label: "Main pocket", hint: "The big pocket below" },
];

export const EMPTY_INVENTORY: Inventory = { slots: { top: 4, main: 8 }, items: [] };

export function normalizeInventory(raw: unknown): Inventory {
  const r = (raw ?? {}) as Partial<Inventory>;
  const slots = { top: Math.max(4, Math.min(16, Number(r.slots?.top) || 4)), main: Math.max(4, Math.min(32, Number(r.slots?.main) || 8)) };
  const items = (Array.isArray(r.items) ? r.items : [])
    .filter((i): i is InventoryItem => !!i && typeof i.id === "string" && typeof i.name === "string")
    .map((i) => ({
      id: i.id.slice(0, 40),
      name: i.name.replace(/\s+/g, " ").trim().slice(0, 48) || "Item",
      pocket: (i.pocket === "main" ? "main" : "top") as PocketKey,
      slot: Math.max(0, Math.floor(Number(i.slot) || 0)),
      icon: typeof i.icon === "string" && /^https?:\/\/|^\//.test(i.icon) ? i.icon : null,
      status: (["full", "low", "empty"].includes(i.status) ? i.status : "full") as ItemStatus,
      note: typeof i.note === "string" ? i.note.slice(0, 200) : null,
      emptiedAt: typeof i.emptiedAt === "string" ? i.emptiedAt : null,
      refilledAt: typeof i.refilledAt === "string" ? i.refilledAt : null,
    }))
    .slice(0, 48);
  for (const i of items) if (i.slot >= slots[i.pocket]) slots[i.pocket] = Math.min(32, Math.ceil((i.slot + 1) / 4) * 4);
  return { slots, items };
}

export const needsRefill = (inv: Inventory) => inv.items.filter((i) => i.status === "empty");
