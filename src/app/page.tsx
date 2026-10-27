import { auth, signIn } from "@/auth";
import { LowLightToggle } from "@/components/evening/LowLightToggle";
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
import { listRites, listRiteCompletions, listCompletionsFor, listHabitSkips, listRiteStepChecks, cleanRiteSteps } from "@/lib/data/rites";
import { listJournalEntries } from "@/lib/data/journal";
import { DayNightFlip } from "@/components/evening/DayNightFlip";
import { BeginEveningButton, EveningPromptOr } from "@/components/evening/BeginEveningButton";
import { EveningRites } from "@/components/evening/EveningRites";
import { PlanNudge } from "@/components/plan/PlanNudge";
import { oneStepPerProject } from "@/lib/next-action";
import { listBoardsForOwner } from "@/lib/data/boards";
import { getPlanSession, getWeekChapter, lastPairSession } from "@/lib/data/planning";
import { WeekChapter } from "@/components/plan/WeekChapter";
import { slipMatcher } from "@/lib/streaks";
import { DailyHabits } from "@/components/habits/DailyHabits";
import { appDayKey, nextDayKey, listTomorrowQueue, promoteQueuedQuests } from "@/lib/data/tomorrow";
import { getCheckMetrics, latestCheckIns, latestEnergy, listCheckNotesSince } from "@/lib/data/energy";
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
  const [recentClaims, rites, riteCompletions, tomorrowRows, boss, bossesEnabled, lastEnergy, checkMetrics, lastReadings, recentNotes] = await Promise.all([
    listClaimedSince(session.user.id, daysAgoISO(2)).catch(() => []),
    listRites(session.user.id).catch(() => null),
    listRiteCompletions(session.user.id, daysAgoISO(2).slice(0, 10)).catch(() => []),
    listTomorrowQueue(session.user.id).catch(() => null),
    getActiveBoss(session.user.id),
    bossesTableExists(),
    latestEnergy(session.user.id),
    getCheckMetrics(session.user.id).catch(() => []),
    latestCheckIns(session.user.id, daysAgoISO(2)).catch(() => ({})),
    listCheckNotesSince(session.user.id, daysAgoISO(2)).catch(() => []),
  ]);
  // Sunday/Monday: nudge toward the weekly ritual; the first days of a month, the monthly one.
  const dayKey = appDayKey();
  const dow = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
  const dom = Number(dayKey.slice(8, 10));
  const nudgeKind: "week" | "month" | null = dom <= 3 ? "month" : dow === 0 || dow === 1 ? "week" : null;
  const nudgeSession = nudgeKind ? await getPlanSession(session.user.id, nudgeKind).catch(() => null) : null;
  // The check-in with Mom: on Tuesdays (or once a walk left it half done), then midweek on Fri/Sat.
  const pair = await getPlanSession(session.user.id, "pair").catch(() => null);
  // Streak slips (Insights) never show in Today's check-in.
  const slipChecks = (profile?.life_wheel?.streaks ?? []).map((d) => slipMatcher(d.word));
  const isSlip = (body: string) => slipChecks.some((f) => f(body));
  // This week's big rocks, told as a chapter.
  const chapter = await getWeekChapter(session.user.id, profile?.created_at ?? null).catch(() => null);
  const pairData = (pair?.data ?? {}) as { walkedAt?: string | null; partner?: string; mid?: { doneAt?: string | null } };
  const hadPair = pair || (await lastPairSession(session.user.id).catch(() => null));
  const pairNudge: "week" | "mid" | null = !hadPair ? null : !pair?.completed_at ? (dow === 2 || pairData.walkedAt ? "week" : null) : (dow === 5 || dow === 6) && !pairData.mid?.doneAt ? "mid" : null;
  const planNudge = pairNudge ? (
    <PlanNudge kind={pairNudge === "mid" ? "pair-mid" : "pair"} started={!!pairData.walkedAt} partner={pairData.partner || "Mom"} />
  ) : nudgeKind && !nudgeSession?.completed_at ? (
    <PlanNudge kind={nudgeKind} started={!!nudgeSession} />
  ) : null; // "Waiting for a time" lives on the calendar and with the toucan, not on Today.
  const energyToday = lastEnergy && appDayKey(new Date(lastEnergy.created_at)) === appDayKey() ? lastEnergy.level : null;
  // Today's latest reading of each extra check-in metric.
  const metricsToday = Object.fromEntries(
    Object.entries(lastReadings as Record<string, { level: number; at: string }>)
      // Only what was part of the latest check-in: a metric skipped then isn't shown.
      .filter(([, r]) => appDayKey(new Date(r.at)) === appDayKey() && !!lastEnergy && Math.abs(new Date(r.at).getTime() - new Date(lastEnergy.created_at).getTime()) < 120_000)
      .map(([k, r]) => [k, r.level])
  ) as Record<string, number>;
  const tomorrow = tomorrowRows?.map((r) => openTasks.find((t) => t.id === r.id) ?? r) ?? null;
  const riteView = (r: NonNullable<typeof rites>[number]) => ({ id: r.id, title: r.title, description: r.description, is_core: r.is_core, xp_value: r.xp_value, slot: r.slot ?? "evening", days: r.days ?? null, due_time: r.due_time ?? null, kind: r.kind ?? null, icon_key: r.icon_source ? r.icon_key : null, icon_source: r.icon_source ?? null, coin_value: r.coin_value ?? null, estimate_minutes: r.estimate_minutes ?? null, steps: cleanRiteSteps(r.steps) });
  const habits = rites?.filter((r) => r.slot === "day").map(riteView) ?? null;
  // Habit streaks look back a few months; skips end a streak. Journal entries join today's victories.
  const [habitHistory, habitSkips, journal, projectBoards, stepChecks] = await Promise.all([
    habits?.length ? listCompletionsFor(session.user.id, habits.map((h) => h.id), daysAgoISO(120).slice(0, 10)) : Promise.resolve([]),
    listHabitSkips(session.user.id, daysAgoISO(120).slice(0, 10)),
    listJournalEntries(session.user.id, 150).catch(() => null),
    listBoardsForOwner(session.user.id).catch(() => []),
    habits?.some((h) => h.steps.length) ? listRiteStepChecks(session.user.id, daysAgoISO(2).slice(0, 10)).catch(() => null) : Promise.resolve([]),
  ]);
  const eveningRites = rites?.filter((r) => r.slot !== "day").map(riteView) ?? null;
  // Imports wait for approval before they show here at all; quests taken off
  // the Today screen live only on their boards.
  const onToday = openTasks.filter((t) => !t.needs_review);
  // Due today or tomorrow (or missed this past week): these go to the very top
  // of Today on their own, whatever list they're in, soonest first.
  const tomorrowKey = nextDayKey(dayKey);
  const dueNow = (t: { due_at?: string | null }) => {
    if (!t.due_at) return false;
    const ms = Date.parse(t.due_at);
    return ms > Date.parse(daysAgoISO(7)) && appDayKey(new Date(ms)) <= tomorrowKey;
  };
  const dueTasks = onToday.filter((t) => dueNow(t) && !t.reward_id).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  const rest = onToday.filter((t) => !dueTasks.includes(t));
  const topPriorities = rest.filter((t) => t.is_manual_priority);
  // Deadlines coming up rise to the top of Additional Quests (soonest first);
  // everything else keeps the order you gave it.
  const nowMs = Date.now();
  const dueSoon = (t: { due_at?: string | null }) => {
    if (!t.due_at) return false;
    const ms = Date.parse(t.due_at) - nowMs;
    return ms < 4 * 86_400_000 && ms > -7 * 86_400_000;
  };
  // A project (a board on your matrix) offers just its next step here.
  const extras = oneStepPerProject(rest.filter((t) => !t.is_manual_priority && t.in_additional !== false), projectBoards, openTasks);
  const soon = extras.filter(dueSoon).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  const otherTasks = [...soon, ...extras.filter((t) => !dueSoon(t))];
  const theme = profile?.theme ?? "adventure";
  // The evening side shows the same summary without the check-in.
  const statsView = (checkIn: boolean) => profile && (
    <section>
      <XpSummary
        profile={profile}
        stats={{ questsComplete, xpThisWeek, partySize: friendIds.length }}
        boss={boss ? { id: boss.id, level: boss.level, title: boss.title, target: boss.target, progress: boss.progress } : null}
        bossesEnabled={bossesEnabled}
        energyToday={checkIn ? energyToday : undefined}
        energyAt={energyToday !== null ? (lastEnergy?.created_at ?? null) : null}
        checkMetrics={checkMetrics}
        metricsToday={metricsToday}
        notesToday={recentNotes.filter((n) => appDayKey(new Date(n.created_at)) === appDayKey() && !isSlip(n.body)).map((n) => ({ id: n.id, body: n.body, at: n.created_at }))}
      />
    </section>
  );

  const stats = statsView(true);

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <DayNightFlip
        day={
          <div className="flex flex-col gap-6">
            {stats}
            <EveningPromptOr>{planNudge}</EveningPromptOr>
            {chapter && <WeekChapter chapter={chapter} theme={profile?.theme ?? "adventure"} />}
            <TodayTaskBoard
              dueTasks={dueTasks}
              priorityTasks={topPriorities}
              otherTasks={otherTasks}
              theme={theme}
              between={
                habits && rites?.some((r) => "slot" in r) ? (
                  <DailyHabits habits={habits} completions={habitHistory} skips={habitSkips} stepChecks={stepChecks ?? []} theme={theme} />
                ) : null
              }
            />
            <BeginEveningButton />
            <section>
              <AddTaskForm theme={theme} />
            </section>
            <VictoriesToday
              tasks={completedTasks}
              claimed={recentClaims.map((r) => ({ id: r.id, title: r.title, claimed_at: r.claimed_at, status: r.status, completed_at: r.completed_at ?? null, bonus_xp: r.bonus_xp ?? 0, bonus_coins: r.bonus_coins ?? 0 }))}
              lastCheckInAt={profile?.last_check_in_at ?? null}
              rites={riteCompletions.flatMap((c) => {
                const r = rites?.find((x) => x.id === c.rite_id);
                return r ? [{ id: c.id, title: r.title, day: c.day, xp: c.xp_awarded }] : [];
              })}
              journal={(journal ?? []).filter((j) => j.created_at >= daysAgoISO(2)).map((j) => ({ id: j.id, body: j.body, kind: j.kind, created_at: j.created_at, xp: j.xp_awarded ?? 0 }))}
              theme={theme}
            />
          </div>
        }
        evening={
          <div className="flex flex-col gap-6">
            <LowLightToggle />
            {statsView(false)}
            <EveningRites
              rites={eveningRites}
              completions={riteCompletions.map((c) => ({ rite_id: c.rite_id, day: c.day }))}
              theme={theme}
              tomorrow={tomorrow}
              todayIds={[...dueTasks, ...topPriorities].map((t) => t.id)}
              openQuests={openTasks.filter((t) => !t.reward_id && !t.needs_review)}
            />
          </div>
        }
      />
    </AppShell>
  );
}
