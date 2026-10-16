import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CreateFab } from "@/components/create/CreateFab";
import { InsightsView } from "@/components/insights/InsightsView";
import { getProfileById } from "@/lib/data/profiles";
import { getCheckMetrics, latestCheckIns, latestEnergy, listCheckInsSince, listEnergySince } from "@/lib/data/energy";
import { appDayKey } from "@/lib/data/tomorrow";
import { EnergyCheck } from "@/components/xp/EnergyCheck";
import { listWinsSince } from "@/lib/data/wins";

export default async function InsightsPage() {
  const session = await requireSession();
  const since = new Date(Date.now() - 92 * 86_400_000).toISOString();
  const [profile, energy, checks, metrics, wins, lastEnergy, lastReadings] = await Promise.all([
    getProfileById(session.user.id),
    listEnergySince(session.user.id, since),
    listCheckInsSince(session.user.id, since),
    getCheckMetrics(session.user.id),
    listWinsSince(session.user.id, since),
    latestEnergy(session.user.id),
    latestCheckIns(session.user.id, new Date(Date.now() - 2 * 86_400_000).toISOString()).catch(() => ({})),
  ]);
  const energyToday = lastEnergy && appDayKey(new Date(lastEnergy.created_at)) === appDayKey() ? lastEnergy.level : null;
  const metricsToday = Object.fromEntries(
    Object.entries(lastReadings as Record<string, { level: number; at: string }>)
      .filter(([, r]) => appDayKey(new Date(r.at)) === appDayKey())
      .map(([k, r]) => [k, r.level])
  ) as Record<string, number>;
  const theme = profile?.theme ?? "adventure";
  const isAdventure = theme === "adventure";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id} wide>
      <div className="flex flex-col gap-4">
        <PageHeader isAdventure={isAdventure} title="Insights" calmTitle="Insights" subtitle="What your check-ins and quests are telling you" />
        <section
          aria-label="Check in"
          className="flex flex-col gap-2 rounded-2xl px-4 py-3.5"
          style={{ background: "linear-gradient(180deg, rgba(28,24,16,.92), rgba(18,16,11,.92))", border: "1.5px solid rgba(217,180,95,.45)", boxShadow: "0 6px 18px rgba(0,0,0,.35)" }}
        >
          <h2 className={`m-0 text-center ${isAdventure ? "font-display text-[20px]" : "text-[16px] font-bold"}`} style={{ color: "#f2d27e" }}>
            Check in
          </h2>
          <EnergyCheck full today={energyToday} todayAt={energyToday !== null ? (lastEnergy?.created_at ?? null) : null} metrics={metrics} metricsToday={metricsToday} />
        </section>
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
