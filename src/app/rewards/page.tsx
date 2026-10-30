import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { CreateFab } from "@/components/create/CreateFab";
import { getProfileById } from "@/lib/data/profiles";
import { listRewards } from "@/lib/data/rewards";
import { RewardsList } from "@/components/rewards/RewardsList";
import { SectionTitle } from "@/components/ui/Ornaments";
import { CoinIcon } from "@/components/ui/Icons";

export default async function RewardsPage() {
  const session = await requireSession();
  const [profile, rewards] = await Promise.all([getProfileById(session.user.id), listRewards(session.user.id).catch(() => [])]);
  if (!profile) notFound();
  const isAdventure = profile.theme === "adventure";
  const coins = profile.coins ?? 0;

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        <div className="relative flex flex-col items-center gap-2 text-center">
          {isAdventure ? (
            <SectionTitle as="h1">Treasure Chest</SectionTitle>
          ) : (
            <h1 className="text-lg font-extrabold" style={{ color: "var(--t-ink)" }}>
              Rewards
            </h1>
          )}
          {/* Your coins: small, tucked to the side. */}
          <span className="absolute right-0 top-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13.5px] font-semibold tabular-nums" style={{ color: isAdventure ? "#f2d27e" : "var(--t-ink-soft)", background: isAdventure ? "rgba(20,26,18,.55)" : "transparent", border: isAdventure ? "1px solid rgba(168,138,63,.6)" : "1px solid var(--t-card-border)" }} title={`${coins} coins to spend`}>
            <CoinIcon size={15} /> {coins}
          </span>
        </div>
        <RewardsList rewards={rewards} coins={coins} theme={profile.theme} />
        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={profile.theme} />
      </div>
    </AppShell>
  );
}
