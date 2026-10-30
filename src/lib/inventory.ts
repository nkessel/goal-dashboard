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

/** The bring-from-home list in the backpack's side drawer: things to pack, ticked off as they go in. */
export type BringItem = { id: string; name: string; done: boolean };
export type BringList = { place: string; items: BringItem[] };

export type Inventory = { slots: Record<PocketKey, number>; items: InventoryItem[]; bring: BringList };

export const POCKETS: { key: PocketKey; label: string; hint: string }[] = [
  { key: "top", label: "Utility pocket", hint: "The little pocket on top" },
  { key: "main", label: "Main pocket", hint: "The big pocket below" },
];

export const EMPTY_INVENTORY: Inventory = { slots: { top: 4, main: 8 }, items: [], bring: { place: "", items: [] } };

function normalizeBring(raw: unknown): BringList {
  const r = (raw ?? {}) as Partial<BringList>;
  const items = (Array.isArray(r.items) ? r.items : [])
    .filter((i): i is BringItem => !!i && typeof i.id === "string" && typeof i.name === "string" && !!i.name.trim())
    .map((i) => ({ id: i.id.slice(0, 40), name: i.name.replace(/\s+/g, " ").trim().slice(0, 80), done: i.done === true }))
    .slice(0, 60);
  return { place: typeof r.place === "string" ? r.place.replace(/\s+/g, " ").trim().slice(0, 40) : "", items };
}

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
  return { slots, items, bring: normalizeBring(r.bring) };
}

export const needsRefill = (inv: Inventory) => inv.items.filter((i) => i.status === "empty");

/** The owner's first bring-from-home list (asked for Oct 30), shown until their list has been saved once. */
const OWNER_BRING_SEED: BringList = { place: "Natick", items: [{ id: "bseed1", name: "Coconut milk", done: false }, { id: "bseed2", name: "Energy tinctures", done: false }] };

export function withOwnerBringSeed(inv: Inventory, raw: unknown, isOwner: boolean): Inventory {
  const saved = !!raw && typeof raw === "object" && "bring" in raw;
  return isOwner && !saved ? { ...inv, bring: OWNER_BRING_SEED } : inv;
}
