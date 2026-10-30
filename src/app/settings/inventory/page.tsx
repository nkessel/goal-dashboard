import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";
import { getProfileById } from "@/lib/data/profiles";
import { normalizeInventory, withOwnerBringSeed } from "@/lib/inventory";
import { Backpack } from "@/components/settings/Backpack";

/** Your backpack: what you carry, and what needs refilling. */
export default async function InventoryPage() {
  const session = await requireSession();
  const profile = await getProfileById(session.user.id);
  if (!profile) notFound();
  const raw = profile.life_wheel?.inventory;
  // The profile row already says whether you're the owner: no second round trip.
  const inventory = withOwnerBringSeed(normalizeInventory(raw), raw, !!(profile as { is_admin?: boolean }).is_admin);
  const isAdventure = profile.theme === "adventure";
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <ViewTransitionLink
            href="/settings"
            ariaLabel="Back to Settings"
            className="hover-glow flex h-10 shrink-0 items-center gap-1 rounded-full pl-1.5 pr-3.5 text-[15px]"
            style={{
              background: isAdventure ? "rgba(10,12,32,.6)" : "var(--t-card)",
              border: `1.5px solid ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`,
              color: isAdventure ? "var(--t-cream)" : "var(--t-ink)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M14.5 5.5 8 12l6.5 6.5" stroke={isAdventure ? "var(--t-gold)" : "currentColor"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={isAdventure ? "font-display" : "font-semibold"}>Settings</span>
          </ViewTransitionLink>
          <h1 className="font-display text-xl" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
            Inventory
          </h1>
        </div>
        <section className="rounded-2xl p-4" style={{ background: isAdventure ? "var(--t-panel)" : "var(--t-card)", border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }}>
          <Backpack initial={inventory} />
        </section>
      </div>
    </AppShell>
  );
}
