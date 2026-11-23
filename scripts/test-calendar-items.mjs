// Planner step 4 / split plan C2: the one calendar item list (`lib/calendar-items.ts`) and the week grid's layout
// (`calendar/week/lanes.ts`) must place every card exactly where the week grid placed it before. This compares
// them, on many made-up days, with a copy of the code WeekView.tsx and MonthView.tsx ran until Nov 23. Run with:
//   node scripts/test-calendar-items.mjs
process.env.TZ = "America/New_York";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "cal-items-"));
const entry = join(dir, "entry.ts");
writeFileSync(entry, `export * from "${root}src/lib/calendar-items.ts";\nexport * from "${root}src/components/calendar/week/lanes.ts";\nexport { getTaskDisplayWindow, showsOnCalendar, sessionRef } from "${root}src/lib/calendar-task-window.ts";\nexport { isSameDay } from "${root}src/lib/calendar-dates.ts";\n`);
const out = join(dir, "bundle.mjs");
execSync(`npx --yes esbuild --bundle --format=esm --platform=neutral --tsconfig=${root}tsconfig.json ${entry} --outfile=${out}`, { cwd: root, stdio: "ignore" });
const L = await import(out);

// ---- the old code, as it stood in WeekView.tsx (lines 496-504 and 654-710 on Nov 22) ----
function oldWeek(tasks, events, days, H0, gridMinutes, HOUR_PX, hiddenEvents) {
  const hidden = { early: 0, late: 0 };
  const gridStart = (d) => { const x = new Date(d); x.setHours(H0, 0, 0, 0); return x.getTime(); };
  const outside = (start, end, day) => {
    const a = (start.getTime() - gridStart(day)) / 60_000;
    const b = (end.getTime() - gridStart(day)) / 60_000;
    if (b <= 0) hidden.early++;
    else if (a >= gridMinutes) hidden.late++;
    return b <= 0 || a >= gridMinutes;
  };
  const offset = (d, day) => Math.min(gridMinutes, Math.max(0, (d.getTime() - gridStart(day)) / 60_000));
  const items = [];
  for (const event of events) {
    if (event.isAllDay || hiddenEvents.has(event.id)) continue;
    const start = new Date(event.start);
    const end = new Date(event.end);
    const dayIndex = days.findIndex((d) => L.isSameDay(d, start));
    if (dayIndex === -1) continue;
    if (outside(start, end, days[dayIndex])) continue;
    const top = offset(start, days[dayIndex]);
    items.push({ kind: "event", key: `e-${event.id}`, dayIndex, top, bottom: Math.max(top + 20, offset(end, days[dayIndex])), start, end });
  }
  for (const task of tasks) {
    if (!L.showsOnCalendar(task)) continue;
    const { start, end } = L.getTaskDisplayWindow(task);
    const dayIndex = days.findIndex((d) => L.isSameDay(d, start));
    if (dayIndex === -1) continue;
    if (outside(start, end, days[dayIndex])) continue;
    const minMins = Math.max(20, (30 / HOUR_PX) * 60);
    const top = Math.max(0, Math.min(offset(start, days[dayIndex]), gridMinutes - minMins));
    items.push({ kind: "task", key: `t-${L.sessionRef(task)}`, dayIndex, top, bottom: Math.max(top + minMins, offset(end, days[dayIndex])), start, end });
  }
  const lanes = new Map();
  for (let d = 0; d < days.length; d++) {
    const dayItems = items.filter((x) => x.dayIndex === d).sort((a, b) => a.top - b.top || b.bottom - a.bottom);
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => { const count = Math.max(1, ...cluster.map((c) => c.lane + 1)); cluster.forEach((c) => lanes.set(c.it.key, { lane: c.lane, count })); cluster = []; };
    for (const it of dayItems) {
      if (it.top >= clusterEnd && cluster.length) flush();
      const laneEnds = [];
      cluster.forEach((c) => (laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -1, c.it.bottom)));
      let lane = laneEnds.findIndex((end) => end <= it.top);
      if (lane === -1) lane = laneEnds.length;
      cluster.push({ it, lane });
      clusterEnd = Math.max(clusterEnd, it.bottom);
    }
    if (cluster.length) flush();
  }
  return { items, hidden, lanes };
}
// MonthView.tsx line 63-64 on Nov 22.
const oldMonth = (tasks, events, day) => ({
  tasks: tasks.filter((t) => L.showsOnCalendar(t) && L.isSameDay(L.getTaskDisplayWindow(t).start, day)).map((t) => t.id + (t.session_id ?? "")),
  events: events.filter((e) => L.isSameDay(new Date(e.start), day)).map((e) => e.id),
});

// ---- made-up calendars ----
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const base = new Date(2026, 10, 20); // Fri Nov 20, local
const at = (dayOff, min) => { const d = new Date(base); d.setDate(d.getDate() + dayOff); d.setHours(0, min, 0, 0); return d; };
function world(n) {
  const tasks = [];
  const events = [];
  for (let i = 0; i < n; i++) {
    const day = Math.floor(rnd() * 9) - 1;
    const start = at(day, Math.floor(rnd() * 96) * 15); // any quarter hour, early and late ones too
    const len = pick([5, 15, 30, 45, 60, 90, 150, 300]);
    const end = new Date(start.getTime() + len * 60_000);
    const r = rnd();
    if (r < 0.4) events.push({ id: `ev${i}`, title: `Event ${i}`, description: null, start: start.toISOString(), end: end.toISOString(), isAllDay: rnd() < 0.1 });
    else {
      const kind = pick(["placed", "placed", "done", "tiny", "tinyEod", "session", "none"]);
      const t = { id: `q${i}`, title: `Quest ${i}`, status: "open", scheduled_start: null, scheduled_end: null, completed_at: null, due_at: null, is_tiny: false, estimate_minutes: pick([null, 5, 20]), google_calendar_event_id: rnd() < 0.3 ? `g${i}` : null, session_id: null };
      if (kind === "placed") Object.assign(t, { scheduled_start: start.toISOString(), scheduled_end: end.toISOString() });
      if (kind === "session") Object.assign(t, { id: `q${i - 1}`, session_id: `ss${i}`, scheduled_start: start.toISOString(), scheduled_end: end.toISOString() });
      if (kind === "done") Object.assign(t, { status: "completed", completed_at: start.toISOString() });
      if (kind === "tiny") Object.assign(t, { is_tiny: true, due_at: start.toISOString() });
      if (kind === "tinyEod") Object.assign(t, { is_tiny: true, due_at: at(day, 23 * 60 + 59).toISOString() });
      tasks.push(t);
    }
  }
  return { tasks, events };
}

let bad = 0;
let checks = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const view = (r) => ({ items: r.items.map((i) => [i.kind, i.key, i.dayIndex, i.top, i.bottom, i.start.getTime(), i.end.getTime()]), hidden: r.hidden, lanes: [...r.lanes.entries()].sort() });
for (let w = 0; w < 400; w++) {
  const { tasks, events } = world(5 + Math.floor(rnd() * 40));
  const nDays = pick([1, 3, 7]);
  const days = Array.from({ length: nDays }, (_, i) => at(i - (nDays > 1 ? 1 : 0), 0));
  const early = rnd() < 0.3;
  const late = rnd() < 0.3;
  const H0 = early ? 0 : 7;
  const H1 = late ? 24 : 22.5;
  const gridMinutes = (H1 - H0) * 60;
  const HOUR_PX = pick([24, 40, 56, 80]);
  const hiddenEvents = new Set(events.filter(() => rnd() < 0.1).map((e) => e.id));
  const old = oldWeek(tasks, events, days, H0, gridMinutes, HOUR_PX, hiddenEvents);
  const placed = L.placeOnGrid(L.calendarItems(tasks, events, { hiddenEvents }), { days, h0: H0, gridMinutes, hourPx: HOUR_PX });
  const now = { items: placed.items, hidden: placed.hidden, lanes: L.laneLayout(placed.items, days.length) };
  checks++;
  if (!same(view(old), view(now))) {
    bad++;
    if (bad < 4) console.log("FAIL week", w, JSON.stringify(view(old)).slice(0, 300), "\n vs", JSON.stringify(view(now)).slice(0, 300));
  }
  // The month view's dots, per day.
  const items = L.calendarItems(tasks, events);
  for (let d = -1; d < 8; d++) {
    const day = at(d, 0);
    const onDay = items.filter((it) => L.isSameDay(new Date(it.start), day));
    const got = { tasks: onDay.flatMap((it) => (it.task ? [it.task.id + (it.task.session_id ?? "")] : [])), events: onDay.flatMap((it) => (it.event ? [it.event.id] : [])) };
    checks++;
    if (!same(oldMonth(tasks, events, day), got)) {
      bad++;
      if (bad < 4) console.log("FAIL month", w, d, JSON.stringify(oldMonth(tasks, events, day)), JSON.stringify(got));
    }
  }
}
// The refs and the busy window.
const one = L.calendarItems([{ id: "a", title: "A", status: "open", scheduled_start: at(0, 600).toISOString(), scheduled_end: at(0, 660).toISOString(), session_id: null, google_calendar_event_id: null }, { id: "a", title: "A", status: "open", scheduled_start: at(1, 600).toISOString(), scheduled_end: at(1, 630).toISOString(), session_id: "s1", google_calendar_event_id: "g" }], [], { drives: { a: 20 } });
checks++;
if (!same(one.map((i) => [i.ref, i.kind, i.travelBefore, i.onGoogle]), [["t:a", "quest", 20, false], ["s:s1", "session", 20, true]])) {
  bad++;
  console.log("FAIL refs", JSON.stringify(one));
}
checks++;
if (!same(L.busyWindow(one[0]), { start: at(0, 580).getTime(), end: at(0, 680).getTime() })) {
  bad++;
  console.log("FAIL busyWindow");
}

console.log(bad ? `${bad} of ${checks} checks failed` : `all ${checks} checks passed (400 made-up calendars, week grid and month view)`);
process.exit(bad ? 1 : 0);
