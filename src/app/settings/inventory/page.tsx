import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";
import { getProfileById } from "@/lib/data/profiles";
import { normalizeInventory } from "@/lib/inventory";
import { Backpack } from "@/components/settings/Backpack";

/** Your backpack: what you carry, and what needs refilling. */
export default async function InventoryPage() {
  const session = await requireSession();
  const profile = await getProfileById(session.user.id);
  if (!profile) notFound();
  const isAdventure = profile.theme === "adventure";
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <ViewTransitionLink
            href="/settings"
            ariaLabel="Back to settings"
            className="hover-glow flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)", border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M15 5l-7 7 7 7" stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ViewTransitionLink>
          <h1 className="font-display text-xl" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
            Inventory
          </h1>
        </div>
        <section className="rounded-2xl p-4" style={{ background: isAdventure ? "var(--t-panel)" : "var(--t-card)", border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }}>
          <Backpack initial={normalizeInventory(profile.life_wheel?.inventory)} />
        </section>
      </div>
    </AppShell>
  );
}
