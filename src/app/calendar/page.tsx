import Link from "next/link";
import { ConnectCalendar } from "@/components/calendar/ConnectCalendar";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { CreateFab } from "@/components/create/CreateFab";
import { PageHeader } from "@/components/layout/PageHeader";
import { getProfileById } from "@/lib/data/profiles";
import { xpToNextLevel } from "@/lib/data/xp";
import { listCalendarTasksForOwner } from "@/lib/data/tasks";
import { listEventsAllCalendars, type GoogleCalendarEvent, type GoogleCalendarInfo } from "@/lib/google-calendar";
import { CalendarLayers } from "@/components/calendar/CalendarLayers";
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
  searchParams: Promise<{ view?: string; date?: string; n?: string }>;
}) {
  const session = await requireSession();
  const { view: viewParam, date: dateParam, n: nParam } = await searchParams;
  const view = parseView(viewParam);
  // "Days" shows any number of days from 1 to 7 (the slider in the calendar's settings).
  const nDays = view === "3day" ? 3 : Math.max(1, Math.min(7, Math.round(Number(nParam) || 2)));
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
  rangeStart = addDays(rangeStart, -1);
  rangeEnd = addDays(rangeEnd, 1);
  const [tasks, toSchedule, scheduleFolders] = await Promise.all([
    listCalendarTasksForOwner(session.user.id, rangeStart, rangeEnd),
    listSchedulingList(session.user.id),
    getSchedulingFolders(session.user.id),
  ]);
  const todayHref = `/calendar?view=${view}&date=${formatDateParam(today)}`;

  // Real Google Calendar appointments, layered onto the same view — separate
  // from quests/tasks the app scheduled itself. Best-effort: a token refresh
  // failure or a Calendar API hiccup shouldn't break the whole page, it just
  // means no appointments show up this load.
  let events: GoogleCalendarEvent[] = [];
  let calendars: GoogleCalendarInfo[] = [];
  if (session.googleAccessToken) {
    try {
      const importedEventIds = new Set(
        tasks.map((t) => t.google_calendar_event_id).filter((id): id is string => Boolean(id))
      );
      const all = await listEventsAllCalendars(session.googleAccessToken, rangeStart, rangeEnd);
      calendars = all.calendars;
      events = all.events.filter((e) => !importedEventIds.has(e.id));
    } catch (err) {
      console.warn("Failed to load Google Calendar events:", err);
    }
  }

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id} wide>
      <div className="flex gap-4">
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

        <div className="-mb-1 flex justify-end gap-2">
          <Link
            href="/plan"
            className="hover-glow flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-bold"
            style={isAdventure ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { background: "var(--t-accent)", color: "#fff" }}
          >
            <span aria-hidden>🗺</span> Plan my week
          </Link>
          <Link
            href="/plan?mode=month"
            className="flex h-9 items-center rounded-full px-3 text-[13px] font-semibold"
            style={{ border: `1px solid ${isAdventure ? "rgba(217,180,95,.55)" : "var(--t-card-border)"}`, color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
          >
            Plan the month
          </Link>
          <Link
            href="/plan?mode=mom"
            className="flex h-9 items-center rounded-full px-3 text-[13px] font-semibold"
            style={{ border: `1px solid ${isAdventure ? "rgba(217,180,95,.55)" : "var(--t-card-border)"}`, color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
          >
            🤝 With Mom
          </Link>
        </div>
        {/* View toggle */}
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
              <Link
                key={v}
                href={`/calendar?view=${v}&date=${formatDateParam(date)}`}
                className={`flex-1 rounded-full py-1.5 text-center text-xs font-semibold capitalize ${isAdventure ? "font-display" : ""}`}
                style={{
                  background: active ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "transparent",
                  color: active ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-nav-inactive)" : "var(--t-ink-soft)",
                }}
              >
                {VIEW_LABELS[v]}
              </Link>
            );
          })}
        </div>

        {/* Prev / heading / next */}
        <div className="flex items-center justify-between">
          <Link href={prevHref} aria-label="Previous" className="flex h-8 w-8 items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 5l-7 7 7 7"
                stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)"}
                strokeWidth="2"
                fill="none"
              />
            </svg>
          </Link>
          <div className="flex flex-col items-center">
            <span
              className={isAdventure ? "font-display text-sm" : "text-sm font-semibold"}
              style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
            >
              {heading}
            </span>
            <Link
              href={todayHref}
              className="text-[11px] underline"
              style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-accent)" }}
            >
              Today
            </Link>
          </div>
          <Link href={nextHref} aria-label="Next" className="flex h-8 w-8 items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 5l7 7-7 7"
                stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)"}
                strokeWidth="2"
                fill="none"
              />
            </svg>
          </Link>
        </div>

        <CalendarLayers
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
        />
        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={theme} />
      </div>
      <SchedulingDrawer tasks={toSchedule} folders={scheduleFolders} theme={theme} />
      </div>
    </AppShell>
  );
}
