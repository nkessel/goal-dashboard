import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getProfileById } from "@/lib/data/profiles";
import { RouteModal } from "@/components/layout/RouteModal";
import { normalizeInventory } from "@/lib/inventory";
import { Backpack } from "@/components/settings/Backpack";

/** The backpack, opened over the screen you were on. */
export default async function InventoryModal() {
  const session = await requireSession();
  const profile = await getProfileById(session.user.id);
  if (!profile) notFound();
  return (
    <RouteModal theme={profile.theme === "adventure" ? "adventure" : "calm"} title="Inventory">
      <Backpack initial={normalizeInventory(profile.life_wheel?.inventory)} />
    </RouteModal>
  );
}
