import { supabaseAdmin } from "@/lib/supabase/server";
import { addonById, cleanToucan, type ToucanSlot, type ToucanState } from "@/lib/toucan";
import { addCoins, getCoins } from "./rewards";

export async function getToucan(ownerId: string): Promise<ToucanState> {
  const { data } = await supabaseAdmin().from("profiles").select("toucan").eq("id", ownerId).maybeSingle<{ toucan: unknown }>();
  return cleanToucan(data?.toucan);
}

async function saveToucan(ownerId: string, state: ToucanState) {
  const { error } = await supabaseAdmin().from("profiles").update({ toucan: state }).eq("id", ownerId);
  if (error && /toucan/.test(error.message)) throw new Error("The toucan's wardrobe needs a quick database update first.");
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

/** Buy an add-on with coins and put it on straight away. */
export async function buyAddon(ownerId: string, addonId: string): Promise<{ state: ToucanState; coins: number }> {
  const addon = addonById(addonId);
  if (!addon) throw new Error("That add-on doesn't exist.");
  const state = await getToucan(ownerId);
  if (state.owned.includes(addonId)) return { state, coins: await getCoins(ownerId) };
  const coins = await getCoins(ownerId);
  if (coins < addon.price) throw new Error(`You need ${addon.price - coins} more coins for that.`);
  const left = await addCoins(ownerId, -addon.price);
  const next: ToucanState = { owned: [...state.owned, addonId], equipped: { ...state.equipped, [addon.slot]: addonId } };
  try {
    await saveToucan(ownerId, next);
  } catch (e) {
    await addCoins(ownerId, addon.price); // refund
    throw e;
  }
  return { state: next, coins: left };
}

/** Wear an owned add-on in its slot, or take that slot off (null). */
export async function equipAddon(ownerId: string, slot: ToucanSlot, addonId: string | null): Promise<ToucanState> {
  const state = await getToucan(ownerId);
  const equipped = { ...state.equipped };
  if (addonId === null) delete equipped[slot];
  else {
    if (!state.owned.includes(addonId) || addonById(addonId)?.slot !== slot) throw new Error("You don't own that yet.");
    equipped[slot] = addonId;
  }
  const next = { ...state, equipped };
  await saveToucan(ownerId, next);
  return next;
}
