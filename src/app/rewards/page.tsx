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
        <div className="flex flex-col items-center gap-2 text-center">
          {isAdventure ? (
            <SectionTitle as="h1">Treasure Chest</SectionTitle>
          ) : (
            <h1 className="text-lg font-extrabold" style={{ color: "var(--t-ink)" }}>
              Rewards
            </h1>
          )}
          <span
            className="mt-1 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[19px] font-semibold tabular-nums"
            style={{
              background: isAdventure ? "linear-gradient(180deg, rgba(40,48,36,.9), rgba(20,26,18,.9))" : "var(--t-card)",
              color: isAdventure ? "#f2d27e" : "var(--t-ink)",
              border: isAdventure ? "1.5px solid #a88a3f" : "1px solid var(--t-card-border)",
              boxShadow: isAdventure ? "inset 0 1px 0 rgba(255,235,180,.12), 0 3px 8px rgba(0,0,0,.35)" : undefined,
            }}
          >
            <CoinIcon size={22} /> {coins} coins
          </span>
          <p className="m-0 text-[15px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.8 : 1 }}>
            Earn 1 coin for every 10 XP, then spend them on treats.
          </p>
        </div>
        <RewardsList rewards={rewards} coins={coins} theme={profile.theme} />
        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={profile.theme} />
      </div>
    </AppShell>
  );
}
