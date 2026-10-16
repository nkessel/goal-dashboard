import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CreateFab } from "@/components/create/CreateFab";
import { InsightsView } from "@/components/insights/InsightsView";
import { getProfileById } from "@/lib/data/profiles";
import { getCheckMetrics, listCheckInsSince, listEnergySince } from "@/lib/data/energy";
import { listWinsSince } from "@/lib/data/wins";

export default async function InsightsPage() {
  const session = await requireSession();
  const since = new Date(Date.now() - 92 * 86_400_000).toISOString();
  const [profile, energy, checks, metrics, wins] = await Promise.all([
    getProfileById(session.user.id),
    listEnergySince(session.user.id, since),
    listCheckInsSince(session.user.id, since),
    getCheckMetrics(session.user.id),
    listWinsSince(session.user.id, since),
  ]);
  const theme = profile?.theme ?? "adventure";
  const isAdventure = theme === "adventure";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id} wide>
      <div className="flex flex-col gap-4">
        <PageHeader isAdventure={isAdventure} title="Insights" calmTitle="Insights" subtitle="What your check-ins and quests are telling you" />
        <InsightsView
          theme={theme}
          readings={[
            ...energy.map((e) => ({ metric: "Energy", level: e.level, at: e.created_at })),
            ...checks.map((c) => ({ metric: c.metric, level: c.level, at: c.created_at })),
          ]}
          metrics={["Energy", ...metrics]}
          wins={wins.filter((w) => w.kind !== "feedback" || (w.xp ?? 0) > 0).map((w) => ({ kind: w.kind, at: w.at, xp: w.xp ?? 0, title: w.title }))}
        />
        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={theme} />
      </div>
    </AppShell>
  );
}
