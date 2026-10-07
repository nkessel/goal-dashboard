import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { getProfileById } from "@/lib/data/profiles";
import { listRewards } from "@/lib/data/rewards";
import { RewardsList } from "@/components/rewards/RewardsList";

export default async function RewardsPage() {
  const session = await requireSession();
  const [profile, rewards] = await Promise.all([getProfileById(session.user.id), listRewards(session.user.id).catch(() => [])]);
  if (!profile) notFound();
  const isAdventure = profile.theme === "adventure";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className={isAdventure ? "font-display text-xl" : "text-lg font-extrabold"} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
            {isAdventure ? "Treasure Chest" : "Rewards"}
          </h1>
          <p className="text-sm" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.75 : 1 }}>
            Treats you can pick when you finish a quest marked with 🎁.
          </p>
        </div>
        <RewardsList rewards={rewards} theme={profile.theme} />
      </div>
    </AppShell>
  );
}
