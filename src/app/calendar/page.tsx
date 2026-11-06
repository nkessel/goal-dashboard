import Link from "next/link";
import { cookies } from "next/headers";
import type { Task } from "@/lib/data/types";
import { RememberView } from "@/components/calendar/RememberView";
import { ConnectCalendar } from "@/components/calendar/ConnectCalendar";
import { requireSession } from "@/lib/session";
import { isAdmin } from "@/lib/data/feedback";
import { AppShell } from "@/components/layout/AppShell";
import { CreateFab } from "@/components/create/CreateFab";
import { ScreenArrange } from "@/components/ui/ScreenArrange";
import { PageHeader } from "@/components/layout/PageHeader";
import { getProfileById } from "@/lib/data/profiles";
import { listCalendarTasksForOwner, listWaitingBehind } from "@/lib/data/tasks";
import { listEventsAllCalendars, type GoogleCalendarEvent, type GoogleCalendarInfo } from "@/lib/google-calendar";
import { CalendarLayers } from "@/components/calendar/CalendarLayers";
import { listRites } from "@/lib/data/rites";
import { timedHabitsFrom } from "@/lib/timed-habits";
import { cleanRepeat } from "@/lib/habit-repeat";
import { CalendarSlide, SlideLink } from "@/components/calendar/CalendarNav";
import { SchedulingDrawer } from "@/components/calendar/SchedulingList";
import { getSchedulingFolders, listSchedulingList } from "@/lib/data/scheduling";
import {
  addDays,
  addMonths,
  endOfDay,
  formatDateParam,
  formatDayHeading,
  formatMonthHeading,
  formatWeekRangeHeading,
  getMonthGridWeeks,
  parseDateParam,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "@/lib/calendar-dates";

type ViewKind = "day" | "3day" | "days" | "week" | "next7" | "month";
const VIEW_LABELS: Record<ViewKind, string> = { day: "Day", "3day": "3 days", days: "Days", week: "Week", next7: "7 days", month: "Month" };
/** Wider views sit to the right, so switching slides the way the tabs read. */
const VIEW_ORDER: Record<ViewKind, number> = { day: 0, days: 1, "3day": 1, week: 2, next7: 3, month: 4 };

function parseView(v: string | undefined): ViewKind {
  return v === "day" || v === "3day" || v === "days" || v === "month" || v === "next7" ? v : "week";
}

/** Today's date in the app's home time zone (the server itself runs on UTC). */
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; n?: string; plan?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  // No view in the link: open on the view used last time.
  const remembered = params.view ? null : decodeURIComponent((await cookies()).get(`cal-view-${session.user.id}`)?.value ?? "").split("|");
  const viewParam = params.view ?? remembered?.[0];
  const nParam = params.n ?? remembered?.[1];
  const dateParam = params.date;
  const view = parseView(viewParam);
  // "Days" shows any number of days from 1 to 7 (the slider in the calendar's settings).
  const nDays = view === "3day" ? 3 : Math.max(1, Math.min(14, Math.round(Number(nParam) || 2)));
  const date = parseDateParam(dateParam ?? todayKey());
  const today = parseDateParam(todayKey());

  // "With Mom" planning is only on the owner's profile.
  const [profile, rites, withMom] = await Promise.all([getProfileById(session.user.id), listRites(session.user.id).catch(() => null), isAdmin(session.user.id).catch(() => false)]);
  // Meal time, wind-down and tidy kept free, and habits with a set time, drawn on the grid.
  const daily = { settings: ((profile as { scheduler?: Record<string, unknown> | null } | null)?.scheduler ?? null), habits: timedHabitsFrom(rites ?? [], cleanRepeat) };
  const theme = profile?.theme ?? "adventure";
  const isAdventure = theme === "adventure";

  let rangeStart: Date;
  let rangeEnd: Date;
  let heading: string;
  let prevHref: string;
  let nextHref: string;

  if (view === "day") {
    rangeStart = startOfDay(date);
    rangeEnd = endOfDay(date);
    heading = formatDayHeading(date);
    prevHref = `/calendar?view=day&date=${formatDateParam(addDays(date, -1))}`;
    nextHref = `/calendar?view=day&date=${formatDateParam(addDays(date, 1))}`;
  } else if (view === "month") {
    const monthStart = startOfMonth(date);
    const grid = getMonthGridWeeks(date);
    rangeStart = grid[0][0];
    rangeEnd = addDays(grid[5][6], 1);
    heading = formatMonthHeading(monthStart);
    prevHref = `/calendar?view=month&date=${formatDateParam(addMonths(monthStart, -1))}`;
    nextHref = `/calendar?view=month&date=${formatDateParam(addMonths(monthStart, 1))}`;
  } else if (view === "3day" || view === "days") {
    rangeStart = startOfDay(date);
    rangeEnd = addDays(rangeStart, nDays);
    {
      const last = addDays(rangeStart, nDays - 1);
      const a = rangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const b = last.toLocaleDateString("en-US", last.getMonth() === rangeStart.getMonth() ? { day: "numeric" } : { month: "short", day: "numeric" });
      heading = `${a} – ${b}`;
    }
    const q = view === "days" ? `view=days&n=${nDays}` : "view=3day";
    prevHref = `/calendar?${q}&date=${formatDateParam(addDays(date, -nDays))}`;
    nextHref = `/calendar?${q}&date=${formatDateParam(addDays(date, nDays))}`;
  } else if (view === "next7") {
    rangeStart = startOfDay(date);
    rangeEnd = addDays(rangeStart, 7);
    heading = formatWeekRangeHeading(rangeStart);
    prevHref = `/calendar?view=next7&date=${formatDateParam(addDays(date, -7))}`;
    nextHref = `/calendar?view=next7&date=${formatDateParam(addDays(date, 7))}`;
  } else {
    const weekStart = startOfWeek(date);
    rangeStart = weekStart;
    rangeEnd = addDays(weekStart, 7);
    heading = formatWeekRangeHeading(weekStart);
    prevHref = `/calendar?view=week&date=${formatDateParam(addDays(date, -7))}`;
    nextHref = `/calendar?view=week&date=${formatDateParam(addDays(date, 7))}`;
  }

  // The server runs on UTC; fetch a day either side so evening items in the
  // viewer's time zone aren't cut off (the views place items by local day).
  // A week either side too (not the month): the days scroll on seamlessly into them (repeat ask 12).
  const extra = view === "month" ? 1 : 8;
  rangeStart = addDays(rangeStart, -extra);
  rangeEnd = addDays(rangeEnd, extra);
  // Google's appointments load alongside the quests (not after them).
  // A failure is shown, not swallowed (owner, Nov 3: "the google calendars are still not showing"): it says why and offers to reconnect.
  let googleProblem: string | null = null;
  const googleP = session.googleAccessToken
    ? listEventsAllCalendars(session.googleAccessToken, rangeStart, rangeEnd, decodeURIComponent((await cookies()).get("cal-skip")?.value ?? "").split("|").filter(Boolean)).catch((err) => {
        console.warn("Failed to load Google Calendar events:", err);
        googleProblem = googleProblemWords(err);
        return null;
      })
    : Promise.resolve(null);
  // Plan my day (owner, Nov 3): the auto-scheduler window lists that day's quests first.
  const planDay = params.plan && /^\d{4}-\d{2}-\d{2}$/.test(params.plan) ? params.plan : null;
  const planP = planDay
    ? import("@/app/actions").then(async ({ planDayTasksAction }) => {
        const end = new Date(`${planDay}T00:00:00`);
        end.setDate(end.getDate() + 1);
        return { day: planDay, tasks: (await planDayTasksAction(end.toISOString())) as Task[] };
      }).catch(() => ({ day: planDay, tasks: [] as Task[] }))
    : Promise.resolve(null);
  // Calendars of interest (owner, Nov 4): their feeds show in week and month views, for planning ahead.
  const interestP = import("@/app/actions").then(({ interestCalendarsAction }) => interestCalendarsAction()).catch(() => []);
  const interestEventsP = view === "week" || view === "month" || view === "next7"
    ? interestP.then(async (list) => {
        const { feedEvents } = await import("@/lib/data/ics");
        const { INTEREST_COLORS } = await import("@/lib/interest-calendars");
        const feeds = list.filter((c) => c.kind === "feed" && c.on !== false);
        const lists = await Promise.all(feeds.map((c, i) => feedEvents({ ...c, color: c.color ?? INTEREST_COLORS[i % INTEREST_COLORS.length] }, rangeStart, rangeEnd).catch(() => [])));
        return lists.flat();
      })
    : Promise.resolve([]);
  const [tasks, toSchedule, scheduleFolders, googleAll, planToday, interest, interestEvents] = await Promise.all([
    listCalendarTasksForOwner(session.user.id, rangeStart, rangeEnd),
    listSchedulingList(session.user.id),
    getSchedulingFolders(session.user.id),
    googleP,
    planP,
    interestP,
    interestEventsP,
  ]);
  // The quests waiting behind each quest on the calendar: its agenda (a visit's to-talk-about list).
  const agenda = await listWaitingBehind(session.user.id, tasks.filter((t) => t.status !== "completed").map((t) => t.id)).catch(() => ({}));
  const todayHref = `/calendar?view=${view}&date=${formatDateParam(today)}`;

  // Real Google Calendar appointments, layered onto the same view — separate
  // from quests/tasks the app scheduled itself. Best-effort: a token refresh
  // failure or a Calendar API hiccup shouldn't break the whole page, it just
  // means no appointments show up this load.
  let events: GoogleCalendarEvent[] = [];
  let calendars: GoogleCalendarInfo[] = [];
  if (googleAll) {
    const importedEventIds = new Set(tasks.map((t) => t.google_calendar_event_id).filter((id): id is string => Boolean(id)));
    calendars = googleAll.calendars;
    events = googleAll.events.filter((e) => !importedEventIds.has(e.id));
  }
  events = [...events, ...interestEvents];

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id} wide>
      <div className="flex gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <RememberView view={view} n={nDays} who={session.user.id} />
        <PageHeader isAdventure={isAdventure} title="Quest Calendar" calmTitle="Calendar" />
        {!session.googleAccessToken && <ConnectCalendar isAdventure={isAdventure} />}
        {session.googleAccessToken && googleProblem && <ConnectCalendar isAdventure={isAdventure} problem={googleProblem} />}

        {/* Its gear arranges the screen in place: drag the parts, the eye hides one. */}
        <ScreenArrange
          screen="calendar"
          name="the calendar"
          parts={[
            {
              key: "synced",
              label: "Synced with Google",
              hint: "The note that Google Calendar is linked",
              node: (
                <>
              <div
                className="flex items-center gap-2 text-xs"
                style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.7 : 1 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="16"
                    rx="2"
                    stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)"}
                    strokeWidth="1.5"
                  />
                  <path
                    d="M3 9h18M8 3v4M16 3v4"
                    stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)"}
                    strokeWidth="1.5"
                  />
                </svg>
                Synced with Google Calendar
              </div>
                </>
              ),
            },
            {
              key: "plan",
              label: "Plan buttons",
              hint: "Plan my week, plan the month",
              node: (
                <>
              <div className="no-scrollbar -mx-5 -mb-1 flex gap-2 overflow-x-auto whitespace-nowrap px-5 sm:mx-0 sm:justify-end sm:px-0">
                <Link
                  href="/plan"
                  className="hover-glow flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-bold"
                  style={isAdventure ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { background: "var(--t-accent)", color: "#fff" }}
                >
                  <span aria-hidden>🗺</span> Plan my week
                </Link>
                <Link
                  href="/plan?mode=month"
                  className="flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold"
                  style={{ border: `1px solid ${isAdventure ? "rgba(217,180,95,.55)" : "var(--t-card-border)"}`, color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
                >
                  Plan the month
                </Link>
                {withMom && (
                  <Link
                    href="/plan?mode=mom"
                    className="flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold"
                    style={{ border: `1px solid ${isAdventure ? "rgba(217,180,95,.55)" : "var(--t-card-border)"}`, color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
                  >
                    🤝 With Mom
                  </Link>
                )}
              </div>
                </>
              ),
            },
            {
              key: "views",
              label: "Views",
              hint: "Day, 3 days, week, next 7, month",
              node: (
                <>
              <div
                className="flex rounded-full p-1"
                style={{
                  background: isAdventure ? "var(--t-nav-bg)" : "var(--t-accent-soft)",
                  border: isAdventure ? "1px solid rgba(209,161,60,.35)" : undefined,
                }}
              >
                {(["day", "3day", "week", "next7", "month"] as const).map((v) => {
                  const active = v === view;
                  return (
                    <SlideLink
                      key={v}
                      dir={VIEW_ORDER[v] === VIEW_ORDER[view] ? "fade" : VIEW_ORDER[v] > VIEW_ORDER[view] ? "left" : "right"}
                      href={`/calendar?view=${v}&date=${formatDateParam(date)}`}
                      className={`flex-1 rounded-full py-1.5 text-center text-xs font-semibold capitalize ${isAdventure ? "font-display" : ""}`}
                      style={{
                        background: active ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "transparent",
                        color: active ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-nav-inactive)" : "var(--t-ink-soft)",
                      }}
                    >
                      {VIEW_LABELS[v]}
                    </SlideLink>
                  );
                })}
              </div>
                </>
              ),
            },
            {
              key: "nav",
              label: "Previous and next",
              hint: "Step through dates, back to today",
              node: (
                <>
              <div className="flex items-center justify-between">
                <SlideLink dir="right" href={prevHref} aria-label="Previous" className="flex h-10 w-10 items-center justify-center rounded-full">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M15 5l-7 7 7 7"
                      stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)"}
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>
                </SlideLink>
                <div className="flex flex-col items-center">
                  <span
                    className={isAdventure ? "font-display text-sm" : "text-sm font-semibold"}
                    style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
                  >
                    {heading}
                  </span>
                  <SlideLink
                    dir={formatDateParam(today) === formatDateParam(date) ? "fade" : today > date ? "left" : "right"}
                    href={todayHref}
                    className="text-[11px] underline"
                    style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-accent)" }}
                  >
                    Today
                  </SlideLink>
                </div>
                <SlideLink dir="left" href={nextHref} aria-label="Next" className="flex h-10 w-10 items-center justify-center rounded-full">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M9 5l7 7-7 7"
                      stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)"}
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>
                </SlideLink>
              </div>
                </>
              ),
            },
            {
              key: "calendar",
              label: "The calendar",
              keep: true,
              node: (
                <>
              <CalendarSlide slideKey={`${view}|${nDays}|${formatDateParam(rangeStart)}`}>
              <CalendarLayers
                agenda={agenda}
                interest={interest}
                view={view}
                dayKeys={
                  view === "day"
                    ? [formatDateParam(date)]
                    : view === "3day" || view === "days"
                      ? Array.from({ length: nDays }, (_, i) => formatDateParam(addDays(date, i)))
                      : Array.from({ length: 7 }, (_, i) => formatDateParam(addDays(view === "week" ? startOfWeek(date) : date, i)))
                }
                monthKey={formatDateParam(startOfMonth(date))}
                todayKey={formatDateParam(today)}
                tasks={tasks}
                events={events}
                calendars={calendars}
                theme={theme}
                dateKey={formatDateParam(date)}
                nDays={view === "day" ? 1 : view === "3day" || view === "days" ? nDays : view === "month" ? 7 : 7}
                toSchedule={toSchedule.length}
                daily={daily}
              />
              </CalendarSlide>
                </>
              ),
            },
          ]}
        />
        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={theme} />
      </div>
      <SchedulingDrawer tasks={toSchedule} folders={scheduleFolders} theme={theme} today={planToday} />
      </div>
    </AppShell>
  );
}

/** Why Google Calendar didn't answer, in plain words. */
function googleProblemWords(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number | string; status?: number })?.code ?? (err as { status?: number })?.status;
  if (code === 401 || /invalid[_ ]?(grant|credentials)|unauthori[sz]ed|expired/i.test(raw)) return "Google says the app's permission has expired or was taken back.";
  if (code === 403 || /insufficient|permission|scope/i.test(raw)) return "Google says the app isn't allowed to read your calendars.";
  return `Google didn't answer this time (${raw.slice(0, 120)}).`;
}

// The browser tab names the screen you are on (owner, Nov 5).
export const metadata = { title: "Calendar" };
