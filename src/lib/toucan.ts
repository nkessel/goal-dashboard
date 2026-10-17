/** The great toucan spirit's add-ons, bought with coins and worn one per slot. */

export type ToucanSlot = "head" | "eyes" | "neck" | "aura" | "bill";

export type ToucanAddon = { id: string; slot: ToucanSlot; name: string; price: number; blurb: string };

export const TOUCAN_SLOTS: { slot: ToucanSlot; label: string }[] = [
  { slot: "head", label: "Headwear" },
  { slot: "eyes", label: "Eyewear" },
  { slot: "neck", label: "Pendant" },
  { slot: "aura", label: "Aura" },
  { slot: "bill", label: "Bill" },
];

export const TOUCAN_ADDONS: ToucanAddon[] = [
  { id: "hibiscus", slot: "head", name: "Hibiscus bloom", price: 500, blurb: "A tropical flower tucked behind the crest." },
  { id: "laurel", slot: "head", name: "Laurel wreath", price: 800, blurb: "For champions of many quests." },
  { id: "wizard", slot: "head", name: "Wizard's hat", price: 1200, blurb: "Starry, pointed, and very wise." },
  { id: "crown", slot: "head", name: "Royal crown", price: 2000, blurb: "Gold and rubies. Long may it reign." },
  { id: "spectacles", slot: "eyes", name: "Scholar's spectacles", price: 600, blurb: "Round gold rims for reading ancient scrolls." },
  { id: "monocle", slot: "eyes", name: "Gilded monocle", price: 750, blurb: "With a fine chain. Most distinguished." },
  { id: "gem", slot: "neck", name: "Teardrop gem", price: 400, blurb: "A teal gem on a thin gold chain." },
  { id: "feather", slot: "neck", name: "Golden feather", price: 400, blurb: "A quiet token of wisdom." },
  { id: "moon", slot: "neck", name: "Crescent moon", price: 400, blurb: "For evening rites under the stars." },
  { id: "heart", slot: "neck", name: "Warm heart", price: 400, blurb: "A soft, glowing heart." },
  { id: "aura-gold", slot: "aura", name: "Golden aura", price: 600, blurb: "Bathe in sunrise light." },
  { id: "aura-violet", slot: "aura", name: "Violet aura", price: 600, blurb: "Deep, mystical twilight." },
  { id: "aura-rose", slot: "aura", name: "Rose aura", price: 600, blurb: "A warm, gentle glow." },
  { id: "aura-cosmic", slot: "aura", name: "Cosmic aura", price: 1500, blurb: "A swirl of every colour, flecked with stars." },
  { id: "bill-rainbow", slot: "bill", name: "Rainbow bill", price: 1000, blurb: "Like the keel-billed toucans of the jungle." },
  { id: "bill-gilded", slot: "bill", name: "Gilded bill", price: 1800, blurb: "Pure gold, polished to a shine." },
];

export type ToucanState = { owned: string[]; equipped: Partial<Record<ToucanSlot, string>> };

export const EMPTY_TOUCAN: ToucanState = { owned: [], equipped: {} };

export function addonById(id: string) {
  return TOUCAN_ADDONS.find((a) => a.id === id) ?? null;
}

/** Tidy a stored value: only known add-ons, and only worn if owned and in the right slot. */
export function cleanToucan(raw: unknown): ToucanState {
  const r = (raw && typeof raw === "object" ? raw : {}) as { owned?: unknown; equipped?: unknown };
  const owned = Array.isArray(r.owned) ? r.owned.filter((x): x is string => typeof x === "string" && !!addonById(x)) : [];
  const equipped: ToucanState["equipped"] = {};
  const eq = (r.equipped && typeof r.equipped === "object" ? r.equipped : {}) as Record<string, unknown>;
  for (const { slot } of TOUCAN_SLOTS) {
    const id = eq[slot];
    if (typeof id === "string" && owned.includes(id) && addonById(id)?.slot === slot) equipped[slot] = id;
  }
  return { owned: [...new Set(owned)], equipped };
}

/** Tell any toucan on screen that what it's wearing changed. */
export function announceToucan(state: ToucanState) {
  window.dispatchEvent(new CustomEvent("toucan-change", { detail: state }));
}
