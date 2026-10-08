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
import { listRites, listRiteCompletions } from "@/lib/data/rites";
import { DayNightFlip } from "@/components/evening/DayNightFlip";
import { BeginEveningButton } from "@/components/evening/BeginEveningButton";
import { EveningRites } from "@/components/evening/EveningRites";

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

  const [openTasks, completedTasks, profile, questsComplete, xpThisWeek, friendIds] = await Promise.all([
    listOpenTasksForOwnerWithCategory(session.user.id),
    listCompletedTasksForOwner(session.user.id, 40),
    getProfileById(session.user.id),
    countCompletedTasksForOwner(session.user.id),
    getWeeklyXpEarned(session.user.id, currentWeekStart()),
    listFriendIds(session.user.id),
  ]);
  // A two-day window; VictoriesToday narrows it to the viewer's own local day.
  const [recentClaims, rites, riteCompletions] = await Promise.all([
    listClaimedSince(session.user.id, daysAgoISO(2)).catch(() => []),
    listRites(session.user.id).catch(() => null),
    listRiteCompletions(session.user.id, daysAgoISO(2).slice(0, 10)).catch(() => []),
  ]);
  const topPriorities = openTasks.filter((t) => t.is_manual_priority);
  // Power-ups live in their own menu (⚡) unless pinned to Today's Battle.
  const otherTasks = openTasks.filter((t) => !t.is_manual_priority && !t.is_power_up);
  const theme = profile?.theme ?? "calm";
  const stats = profile && (
    <section>
      <XpSummary profile={profile} stats={{ questsComplete, xpThisWeek, partySize: friendIds.length }} />
    </section>
  );

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <DayNightFlip
        day={
          <div className="flex flex-col gap-6">
            {stats}
            <TodayTaskBoard priorityTasks={topPriorities} otherTasks={otherTasks} theme={theme} />
            <BeginEveningButton />
            <section>
              <AddTaskForm theme={theme} />
            </section>
            <VictoriesToday
              tasks={completedTasks}
              claimed={recentClaims.map((r) => ({ id: r.id, title: r.title, claimed_at: r.claimed_at }))}
              lastCheckInAt={profile?.last_check_in_at ?? null}
              theme={theme}
            />
          </div>
        }
        evening={
          <div className="flex flex-col gap-6">
            {stats}
            <EveningRites
              rites={rites?.map((r) => ({ id: r.id, title: r.title, description: r.description, is_core: r.is_core, xp_value: r.xp_value })) ?? null}
              completions={riteCompletions.map((c) => ({ rite_id: c.rite_id, day: c.day }))}
              theme={theme}
            />
          </div>
        }
      />
    </AppShell>
  );
}
