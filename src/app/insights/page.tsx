import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CreateFab } from "@/components/create/CreateFab";
import { InsightsView } from "@/components/insights/InsightsView";
import { getProfileById } from "@/lib/data/profiles";
import { getCheckMetrics, latestCheckIns, latestEnergy, listCheckInsSince, listCheckNotesSince, listEnergySince } from "@/lib/data/energy";
import { appDayKey } from "@/lib/data/tomorrow";
import { EnergyCheck } from "@/components/xp/EnergyCheck";
import { EventLog } from "@/components/insights/EventLog";
import { DEFAULT_WHEEL, LifeWheel } from "@/components/insights/LifeWheel";
import { listWinsSince } from "@/lib/data/wins";

export default async function InsightsPage() {
  const session = await requireSession();
  const since = new Date(Date.now() - 92 * 86_400_000).toISOString();
  const [profile, energy, checks, metrics, wins, lastEnergy, lastReadings, notes] = await Promise.all([
    getProfileById(session.user.id),
    listEnergySince(session.user.id, since),
    listCheckInsSince(session.user.id, since),
    getCheckMetrics(session.user.id),
    listWinsSince(session.user.id, since),
    latestEnergy(session.user.id),
    latestCheckIns(session.user.id, new Date(Date.now() - 2 * 86_400_000).toISOString()).catch(() => ({})),
    listCheckNotesSince(session.user.id, since),
  ]);
  const energyToday = lastEnergy && appDayKey(new Date(lastEnergy.created_at)) === appDayKey() ? lastEnergy.level : null;
  const metricsToday = Object.fromEntries(
    Object.entries(lastReadings as Record<string, { level: number; at: string }>)
      // Only what was part of the latest check-in: a metric skipped then isn't shown.
      .filter(([, r]) => appDayKey(new Date(r.at)) === appDayKey() && !!lastEnergy && Math.abs(new Date(r.at).getTime() - new Date(lastEnergy.created_at).getTime()) < 120_000)
      .map(([k, r]) => [k, r.level])
  ) as Record<string, number>;
  const theme = profile?.theme ?? "adventure";
  const isAdventure = theme === "adventure";
  // The life wheel's readings are kept apart from the chart's metrics.
  const WHEEL = "◎ ";
  const wheelTopics = profile?.life_wheel?.topics?.length ? profile.life_wheel.topics : DEFAULT_WHEEL;
  const wheelLast: Record<string, { level: number; at: string }> = {};
  for (const c of checks) if (c.metric.startsWith(WHEEL)) wheelLast[c.metric.slice(WHEEL.length)] = { level: c.level, at: c.created_at };
  const chartChecks = checks.filter((c) => !c.metric.startsWith(WHEEL));

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
          <EnergyCheck full today={energyToday} todayAt={energyToday !== null ? (lastEnergy?.created_at ?? null) : null} metrics={metrics} metricsToday={metricsToday} notesToday={notes.filter((n) => appDayKey(new Date(n.created_at)) === appDayKey()).map((n) => ({ id: n.id, body: n.body, at: n.created_at }))} />
        </section>
        <section
          aria-label="Events and tags"
          className="flex flex-col gap-2 rounded-2xl px-4 py-3.5"
          style={{ background: "linear-gradient(180deg, #f6ecd2, #ecdcb4)", border: "1.5px solid rgba(139,112,64,.45)", boxShadow: "0 4px 14px rgba(0,0,0,.25)" }}
        >
          <h2 className={`m-0 ${isAdventure ? "font-display text-[18px]" : "text-[15px] font-bold"}`} style={{ color: "#3b2a14" }}>
            Events &amp; #tags <span className="text-[13px] font-normal" style={{ color: "#6b5631" }}>— log anything, any time</span>
          </h2>
          <EventLog notes={notes.map((n) => ({ id: n.id, body: n.body, created_at: n.created_at }))} />
        </section>
        <section
          aria-label="Life wheel"
          className="flex flex-col gap-2 rounded-2xl px-4 py-3.5"
          style={{ background: "linear-gradient(180deg, #f6ecd2, #ecdcb4)", border: "1.5px solid rgba(139,112,64,.45)", boxShadow: "0 4px 14px rgba(0,0,0,.25)" }}
        >
          <h2 className={`m-0 ${isAdventure ? "font-display text-[18px]" : "text-[15px] font-bold"}`} style={{ color: "#3b2a14" }}>
            Life wheel <span className="text-[13px] font-normal" style={{ color: "#6b5631" }}>— how each part of life feels</span>
          </h2>
          <LifeWheel topics={wheelTopics} last={wheelLast} />
        </section>
        <InsightsView
          theme={theme}
          readings={[
            ...energy.map((e) => ({ metric: "Energy", level: e.level, at: e.created_at })),
            ...chartChecks.map((c) => ({ metric: c.metric, level: c.level, at: c.created_at })),
          ]}
          metrics={["Energy", ...metrics]}
          wins={[
            ...wins.filter((w) => w.kind !== "feedback" || (w.xp ?? 0) > 0).map((w) => ({ kind: w.kind, at: w.at, xp: w.xp ?? 0, title: w.title, icon: w.icon ?? null })),
            ...notes.map((n) => ({ kind: "note", at: n.created_at, xp: 0, title: n.body })),
          ]}
        />
        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={theme} />
      </div>
    </AppShell>
  );
}
