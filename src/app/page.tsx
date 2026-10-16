import { auth, signIn } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";
import { TodayTaskBoard } from "@/components/tasks/TodayTaskBoard";
import { VictoriesToday } from "@/components/xp/VictoriesToday";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { XpSummary } from "@/components/xp/XpSummary";
import {
  listOpenTasksForOwnerWithCategory,
  listCompletedTasksForOwner,
  countCompletedTasksForOwner,
} from "@/lib/data/tasks";
import { getProfileById } from "@/lib/data/profiles";
import { getWeeklyXpEarned, currentWeekStart } from "@/lib/data/xp";
import { listFriendIds } from "@/lib/data/friendships";
import { listClaimedSince } from "@/lib/data/rewards";
import { listRites, listRiteCompletions, listCompletionsFor, listHabitSkips } from "@/lib/data/rites";
import { listJournalEntries } from "@/lib/data/journal";
import { DayNightFlip } from "@/components/evening/DayNightFlip";
import { BeginEveningButton } from "@/components/evening/BeginEveningButton";
import { EveningRites } from "@/components/evening/EveningRites";
import { DailyHabits } from "@/components/habits/DailyHabits";
import { appDayKey, listTomorrowQueue, promoteQueuedQuests } from "@/lib/data/tomorrow";
import { getCheckMetrics, latestCheckIns, latestEnergy } from "@/lib/data/energy";
import { bossesTableExists, getActiveBoss } from "@/lib/data/bosses";

/** Start of a window `n` days back (kept outside render for purity). */
function daysAgoISO(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div
        data-theme="adventure"
        className="flex min-h-screen flex-col items-center justify-center gap-8 p-8"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-3xl" style={{ color: "var(--t-cream)" }}>
            Goal Dashboard
          </h1>
          <p className="max-w-xs text-sm" style={{ color: "var(--t-cream)", opacity: 0.75 }}>
            Turn your to-do list into a daily quest log — track tasks, earn XP, and share progress
            with friends.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button
            type="submit"
            className="font-display rounded-full px-6 py-3 text-sm font-bold"
            style={{ background: "var(--t-gold)", color: "#3b2a10" }}
          >
            Sign in with Google
          </button>
        </form>
      </div>
    );
  }

  // A new day: last evening's plan moves into Today's Quests first.
  await promoteQueuedQuests(session.user.id).catch(() => false);
  const [openTasks, completedTasks, profile, questsComplete, xpThisWeek, friendIds] = await Promise.all([
    listOpenTasksForOwnerWithCategory(session.user.id),
    listCompletedTasksForOwner(session.user.id, 40),
    getProfileById(session.user.id),
    countCompletedTasksForOwner(session.user.id),
    getWeeklyXpEarned(session.user.id, currentWeekStart()),
    listFriendIds(session.user.id),
  ]);
  // A two-day window; VictoriesToday narrows it to the viewer's own local day.
  const [recentClaims, rites, riteCompletions, tomorrowRows, boss, bossesEnabled, lastEnergy, checkMetrics, lastReadings] = await Promise.all([
    listClaimedSince(session.user.id, daysAgoISO(2)).catch(() => []),
    listRites(session.user.id).catch(() => null),
    listRiteCompletions(session.user.id, daysAgoISO(2).slice(0, 10)).catch(() => []),
    listTomorrowQueue(session.user.id).catch(() => null),
    getActiveBoss(session.user.id),
    bossesTableExists(),
    latestEnergy(session.user.id),
    getCheckMetrics(session.user.id).catch(() => []),
    latestCheckIns(session.user.id, daysAgoISO(2)).catch(() => ({})),
  ]);
  const energyToday = lastEnergy && appDayKey(new Date(lastEnergy.created_at)) === appDayKey() ? lastEnergy.level : null;
  // Today's latest reading of each extra check-in metric.
  const metricsToday = Object.fromEntries(
    Object.entries(lastReadings as Record<string, { level: number; at: string }>)
      .filter(([, r]) => appDayKey(new Date(r.at)) === appDayKey())
      .map(([k, r]) => [k, r.level])
  ) as Record<string, number>;
  const tomorrow = tomorrowRows?.map((r) => openTasks.find((t) => t.id === r.id) ?? r) ?? null;
  const riteView = (r: NonNullable<typeof rites>[number]) => ({ id: r.id, title: r.title, description: r.description, is_core: r.is_core, xp_value: r.xp_value, slot: r.slot ?? "evening", days: r.days ?? null, due_time: r.due_time ?? null, kind: r.kind ?? null, icon_key: r.icon_source ? r.icon_key : null, icon_source: r.icon_source ?? null, coin_value: r.coin_value ?? null, estimate_minutes: r.estimate_minutes ?? null });
  const habits = rites?.filter((r) => r.slot === "day").map(riteView) ?? null;
  // Habit streaks look back a few months; skips end a streak. Journal entries join today's victories.
  const [habitHistory, habitSkips, journal] = await Promise.all([
    habits?.length ? listCompletionsFor(session.user.id, habits.map((h) => h.id), daysAgoISO(120).slice(0, 10)) : Promise.resolve([]),
    listHabitSkips(session.user.id, daysAgoISO(120).slice(0, 10)),
    listJournalEntries(session.user.id, 30).catch(() => null),
  ]);
  const eveningRites = rites?.filter((r) => r.slot !== "day").map(riteView) ?? null;
  // Imports wait for approval before they show here at all; quests taken off
  // the Today screen live only on their boards.
  const onToday = openTasks.filter((t) => !t.needs_review);
  const topPriorities = onToday.filter((t) => t.is_manual_priority);
  const otherTasks = onToday.filter((t) => !t.is_manual_priority && t.in_additional !== false);
  const theme = profile?.theme ?? "calm";
  const stats = profile && (
    <section>
      <XpSummary
        profile={profile}
        stats={{ questsComplete, xpThisWeek, partySize: friendIds.length }}
        boss={boss ? { id: boss.id, level: boss.level, title: boss.title, target: boss.target, progress: boss.progress } : null}
        bossesEnabled={bossesEnabled}
        energyToday={energyToday}
        energyAt={energyToday !== null ? (lastEnergy?.created_at ?? null) : null}
        checkMetrics={checkMetrics}
        metricsToday={metricsToday}
      />
    </section>
  );

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <DayNightFlip
        day={
          <div className="flex flex-col gap-6">
            {stats}
            <TodayTaskBoard
              priorityTasks={topPriorities}
              otherTasks={otherTasks}
              theme={theme}
              between={
                habits && rites?.some((r) => "slot" in r) ? (
                  <DailyHabits habits={habits} completions={habitHistory} skips={habitSkips} theme={theme} />
                ) : null
              }
            />
            <BeginEveningButton />
            <section>
              <AddTaskForm theme={theme} />
            </section>
            <VictoriesToday
              tasks={completedTasks}
              claimed={recentClaims.map((r) => ({ id: r.id, title: r.title, claimed_at: r.claimed_at }))}
              lastCheckInAt={profile?.last_check_in_at ?? null}
              rites={riteCompletions.flatMap((c) => {
                const r = rites?.find((x) => x.id === c.rite_id);
                return r ? [{ id: c.id, title: r.title, day: c.day, xp: c.xp_awarded }] : [];
              })}
              journal={(journal ?? []).filter((j) => j.created_at >= daysAgoISO(2)).map((j) => ({ id: j.id, body: j.body, kind: j.kind, created_at: j.created_at }))}
              theme={theme}
            />
          </div>
        }
        evening={
          <div className="flex flex-col gap-6">
            {stats}
            <EveningRites
              rites={eveningRites}
              completions={riteCompletions.map((c) => ({ rite_id: c.rite_id, day: c.day }))}
              theme={theme}
              tomorrow={tomorrow}
              openQuests={openTasks.filter((t) => !t.reward_id && !t.needs_review)}
            />
          </div>
        }
      />
    </AppShell>
  );
}
