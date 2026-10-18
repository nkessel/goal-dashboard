import { ConnectCalendar } from "@/components/calendar/ConnectCalendar";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { CreateFab } from "@/components/create/CreateFab";
import { PageHeader } from "@/components/layout/PageHeader";
import { getProfileById } from "@/lib/data/profiles";
import { xpToNextLevel } from "@/lib/data/xp";
import { listCalendarTasksForOwner } from "@/lib/data/tasks";
import { listCalendars, listEvents, type GoogleCalendarEvent, type GoogleCalendarSource } from "@/lib/google-calendar";
import { getCalendarPrefs } from "@/lib/data/calendar-sources";
import { CalendarSources } from "@/components/calendar/CalendarSources";
import { CalendarNav, CalendarSlide } from "@/components/calendar/CalendarNav";
import { DayView } from "@/components/calendar/DayView";
import { WeekView } from "@/components/calendar/WeekView";
import { MonthView } from "@/components/calendar/MonthView";
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

type ViewKind = "day" | "3day" | "week" | "next7" | "month";

function parseView(v: string | undefined): ViewKind {
  return v === "day" || v === "3day" || v === "month" || v === "next7" ? v : "week";
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
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const session = await requireSession();
  const { view: viewParam, date: dateParam } = await searchParams;
  const view = parseView(viewParam);
  const date = parseDateParam(dateParam ?? todayKey());
  const today = parseDateParam(todayKey());

  const profile = await getProfileById(session.user.id);
  const theme = profile?.theme ?? "adventure";
  const isAdventure = theme === "adventure";
  const level = profile ? xpToNextLevel(profile.total_xp).level : 1;

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
  } else if (view === "3day") {
    rangeStart = startOfDay(date);
    rangeEnd = addDays(rangeStart, 3);
    {
      const last = addDays(rangeStart, 2);
      const a = rangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const b = last.toLocaleDateString("en-US", last.getMonth() === rangeStart.getMonth() ? { day: "numeric" } : { month: "short", day: "numeric" });
      heading = `${a} – ${b}`;
    }
    prevHref = `/calendar?view=3day&date=${formatDateParam(addDays(date, -3))}`;
    nextHref = `/calendar?view=3day&date=${formatDateParam(addDays(date, 3))}`;
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
  rangeStart = addDays(rangeStart, -1);
  rangeEnd = addDays(rangeEnd, 1);
  const [tasks, toSchedule, scheduleFolders, calendarPrefs] = await Promise.all([
    listCalendarTasksForOwner(session.user.id, rangeStart, rangeEnd),
    listSchedulingList(session.user.id),
    getSchedulingFolders(session.user.id),
    getCalendarPrefs(session.user.id),
  ]);

  // Real Google Calendar appointments, layered onto the same view — separate
  // from quests/tasks the app scheduled itself. Best-effort: a token refresh
  // failure or a Calendar API hiccup shouldn't break the whole page, it just
  // means no appointments show up this load.
  const events: GoogleCalendarEvent[] = [];
  let calendars: GoogleCalendarSource[] = [];
  if (session.googleAccessToken) {
    const token = session.googleAccessToken;
    const importedEventIds = new Set(
      tasks.map((t) => t.google_calendar_event_id).filter((id): id is string => Boolean(id))
    );
    // Every calendar the person has, each on or off (by default, as in Google).
    calendars = await listCalendars(token).catch((err) => {
      console.warn("Failed to list Google calendars:", err);
      return [] as GoogleCalendarSource[];
    });
    const shown = calendars.length
      ? calendars.filter((c) => calendarPrefs.on[c.id] ?? c.selected).slice(0, 20)
      : [{ id: "primary", name: "Calendar", color: null, primary: true, selected: true, writable: true }];
    const lists = await Promise.all(
      shown.map((c) =>
        listEvents(token, rangeStart, rangeEnd, c).catch((err) => {
          console.warn(`Failed to load events from ${c.name}:`, err);
          return [] as GoogleCalendarEvent[];
        })
      )
    );
    const seenIds = new Set<string>();
    for (const e of lists.flat()) {
      if (importedEventIds.has(e.id) || seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      events.push(e);
    }
  }

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id} wide>
      <div className="flex gap-4">
      {calendars.length > 0 && <CalendarSources calendars={calendars} prefs={calendarPrefs} theme={theme} />}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <PageHeader isAdventure={isAdventure} title="Quest Calendar" calmTitle="Calendar" />
        {!session.googleAccessToken && <ConnectCalendar isAdventure={isAdventure} />}

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

        <CalendarNav
          view={view}
          dateKey={formatDateParam(date)}
          todayKey={formatDateParam(today)}
          heading={heading}
          prevHref={prevHref}
          nextHref={nextHref}
          isAdventure={isAdventure}
        />

        <CalendarSlide slideKey={`${view}:${formatDateParam(date)}`}>
        {view === "day" && <DayView dateKey={formatDateParam(date)} tasks={tasks} events={events} theme={theme} />}
        {view === "3day" && (
          <WeekView dayKeys={Array.from({ length: 3 }, (_, i) => formatDateParam(addDays(date, i)))} tasks={tasks} events={events} theme={theme} />
        )}
        {(view === "week" || view === "next7") && (
          <WeekView
            dayKeys={Array.from({ length: 7 }, (_, i) => formatDateParam(addDays(view === "week" ? startOfWeek(date) : date, i)))}
            tasks={tasks}
            events={events}
            theme={theme}
          />
        )}
        {view === "month" && (
          <MonthView monthKey={formatDateParam(startOfMonth(date))} todayKey={formatDateParam(today)} tasks={tasks} events={events} theme={theme} />
        )}
        </CalendarSlide>
        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={theme} />
      </div>
      <SchedulingDrawer tasks={toSchedule} folders={scheduleFolders} theme={theme} />
      </div>
    </AppShell>
  );
}
