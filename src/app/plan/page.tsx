import { auth } from "@/auth";
import { requireSession } from "@/lib/session";
import { listBoardsForOwner } from "@/lib/data/boards";
import { wheelAreasFrom } from "@/lib/wheel-areas";
import { AppShell } from "@/components/layout/AppShell";
import { PlanRitual } from "@/components/plan/PlanRitual";
import { PairRitual } from "@/components/plan/PairRitual";
import { getProfileById } from "@/lib/data/profiles";
import { listCalendarTasksForOwner, listOpenTasksForOwnerWithCategory } from "@/lib/data/tasks";
import { focusFollowUp, getPlanSession, lastPairSession, lookBack, PLAN_XP, questsToReview, type PlanKind } from "@/lib/data/planning";
import { getSchedulingFolders, listSchedulingList } from "@/lib/data/scheduling";
import { listBoardsWithStatsForOwner } from "@/lib/data/boards";
import { listCheckInsSince } from "@/lib/data/energy";
import { listEventsAllCalendars, type GoogleCalendarEvent } from "@/lib/google-calendar";
import { DEFAULT_WHEEL } from "@/components/insights/LifeWheel";
import { isAdmin } from "@/lib/data/feedback";

/** The weekly and monthly planning rituals. */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ mode?: string; mid?: string }> }) {
  const session = await requireSession();
  const { mode, mid } = await searchParams;
  const ownerId = session.user.id;
  // Planning with Mom is only on the owner's profile.
  const owner = await isAdmin(ownerId).catch(() => false);
  const kind: PlanKind = mode === "month" ? "month" : mode === "mom" && owner ? "pair" : "week";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 8 * 86_400_000);
  const [profile, draft, back, open, toSchedule, folders, calTasks, boards, checks, followUp] = await Promise.all([
    getProfileById(ownerId),
    getPlanSession(ownerId, kind).catch(() => null),
    lookBack(ownerId, kind),
    listOpenTasksForOwnerWithCategory(ownerId),
    listSchedulingList(ownerId),
    getSchedulingFolders(ownerId),
    listCalendarTasksForOwner(ownerId, new Date(start.getTime() - 86_400_000), end),
    kind === "month" ? listBoardsWithStatsForOwner(ownerId).catch(() => []) : Promise.resolve([]),
    listCheckInsSince(ownerId, new Date(Date.now() - 92 * 86_400_000).toISOString()).catch(() => []),
    kind === "pair" ? Promise.resolve(null) : focusFollowUp(ownerId, kind).catch(() => null),
  ]);
  let events: GoogleCalendarEvent[] = [];
  const s = await auth();
  if (s?.googleAccessToken) {
    try {
      const ids = new Set(calTasks.map((t) => t.google_calendar_event_id).filter(Boolean));
      events = (await listEventsAllCalendars(s.googleAccessToken, new Date(start.getTime() - 86_400_000), end)).events.filter((e) => !ids.has(e.id));
    } catch {
      /* calendar is best-effort */
    }
  }
  const live = open.filter((t) => !t.needs_review && !t.reward_id);
  const review = questsToReview(live);
  const boardAreas = wheelAreasFrom(await listBoardsForOwner(session.user.id).catch(() => []));
  const wheelLast: Record<string, { level: number; at: string }> = {};
  for (const c of checks) if (c.metric.startsWith("◎ ")) wheelLast[c.metric.slice(2)] = { level: c.level, at: c.created_at };
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (kind === "pair") {
    const last = await lastPairSession(ownerId).catch(() => null);
    return (
      <AppShell userLabel={session.user.email ?? ""} profileId={ownerId} wide>
        <PairRitual
          xp={PLAN_XP.pair}
          theme={profile?.theme ?? "adventure"}
          draft={(draft?.data as Record<string, unknown>) ?? null}
          sealedAt={draft?.completed_at ?? null}
          last={last}
          finished={back.completed.map((t) => ({ id: t.id, title: t.title }))}
          open={live.map((t) => ({ id: t.id, title: t.title, board: t.categoryLabel }))}
          midweek={mid === "1"}
          calendar={{ dayKeys: Array.from({ length: 7 }, (_, i) => dayKey(new Date(start.getTime() + i * 86_400_000))), tasks: calTasks, events, toSchedule, folders }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={ownerId} wide>
      <PlanRitual
        kind={kind}
        withMom={owner}
        xp={PLAN_XP[kind]}
        theme={profile?.theme ?? "adventure"}
        draft={(draft?.data as Record<string, unknown>) ?? null}
        sealedAt={draft?.completed_at ?? null}
        back={back}
        followUp={followUp}
        open={live.map((t) => ({ id: t.id, title: t.title, xp: t.xp_value, board: t.categoryLabel, due: t.due_at ?? null }))}
        review={{ overdue: review.overdue.map((t) => ({ id: t.id, title: t.title, due: t.due_at ?? null, board: t.categoryLabel })), stale: review.stale.map((t) => ({ id: t.id, title: t.title, due: t.due_at ?? null, board: t.categoryLabel })) }}
        someday={live.filter((t) => t.categoryLabel === "Someday / Maybe").map((t) => ({ id: t.id, title: t.title, due: null, board: t.categoryLabel }))}
        boards={boards.filter((b) => !b.isVirtual).map((b) => ({ id: b.id, title: b.title, open: b.questTotal - b.questDone }))}
        wheel={{ topics: boardAreas.length >= 3 ? boardAreas : profile?.life_wheel?.topics?.length ? profile.life_wheel.topics : DEFAULT_WHEEL, last: wheelLast }}
        calendar={{ dayKeys: Array.from({ length: 7 }, (_, i) => dayKey(new Date(start.getTime() + i * 86_400_000))), tasks: calTasks, events, toSchedule, folders }}
      />
    </AppShell>
  );
}
