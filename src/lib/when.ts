// One "when" for quests (docs/plans/2026-11-17-due-and-scheduling-plan.md, sections 2-3, step "When 1").
// Pure: no React, no server, no Date.now() (callers pass `now`). Dates are local YYYY-MM-DD strings,
// times local "HH:MM", sessions ISO strings. Nothing reads this yet; WhenPanel (step 2) will.
//
// Data (no new columns): Flexible = plan_by + plan_within_days; Fixed = due_at (+ early bonus fields);
// picked time = scheduled_start/end + task_sessions. Setting Fixed clears Flexible and the other way round.
// whenFromImportCard is left for step 4 (it needs the import card's attrs shape).

export type EarlyBonus = { xp: number | null; coins: number | null; perDay: number | null };
export type TimeRange =
  | { kind: "after"; from: string }
  | { kind: "before"; to: string }
  | { kind: "between"; from: string; to: string };
export type WhenSession = { start: string; end: string };

export type WhenValue = {
  by:
    | null
    | { firm: false; withinDays: number; from: string } // "Within a week", counted from `from`
    | { firm: false; date: string } // "Around Fri"
    | { firm: true; date: string; time?: string; early?: EarlyBonus }; // "By Fri"
  range?: TimeRange;
  sessions: WhenSession[];
};

export type WhenOp =
  | { op: "setFixed"; date: string; time: string | null; early: EarlyBonus | null }
  | { op: "clearFixed" }
  | { op: "setFlexible"; date: string; withinDays: number | null }
  | { op: "clearFlexible" }
  | { op: "setRange"; range: TimeRange | null }
  | { op: "setSessions"; sessions: WhenSession[] };

/** The bits of a task row (and its sessions) this file reads. */
export type WhenTaskInput = {
  due_at?: string | null;
  plan_by?: string | null;
  plan_within_days?: number | null;
  early_bonus_xp?: number | null;
  early_bonus_coins?: number | null;
  early_bonus_per_day?: number | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
};

// ---------- date helpers (local time) ----------

const p2 = (n: number) => String(n).padStart(2, "0");
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDaysYmd(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
function dayDiff(a: string, b: string): number {
  return Math.round((parseYmd(a).getTime() - parseYmd(b).getTime()) / 86400000);
}
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today", "tomorrow", "Fri" (within the next 6 days), else "Nov 25". */
function dayName(date: string, today: string): string {
  const diff = dayDiff(date, today);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  const d = parseYmd(date);
  if (diff > 1 && diff < 7) return WD[d.getDay()];
  return `${MO[d.getMonth()]} ${d.getDate()}`;
}
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${p2(m)}${ap}` : `${h12}${ap}`;
}
function clockLong(d: Date): string {
  return `${d.getHours() % 12 === 0 ? 12 : d.getHours() % 12}:${p2(d.getMinutes())}`;
}
function withinPhrase(days: number): string {
  if (days === 7) return "a week";
  if (days === 14) return "2 weeks";
  if (days >= 28 && days <= 31) return "a month";
  return `${days} days`;
}

// ---------- building a value ----------

export function whenFromTask(t: WhenTaskInput, sessions: { starts_at: string; ends_at: string }[] = []): WhenValue {
  let by: WhenValue["by"] = null;
  if (t.due_at) {
    // A quest with due_at reads as Fixed (even if it also has plan_by: that stays the scheduler's aim only).
    const d = new Date(t.due_at);
    const hhmm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
    const hasTime = hhmm !== "00:00" && hhmm !== "23:59";
    const early: EarlyBonus | undefined =
      t.early_bonus_xp != null || t.early_bonus_coins != null || t.early_bonus_per_day != null
        ? { xp: t.early_bonus_xp ?? null, coins: t.early_bonus_coins ?? null, perDay: t.early_bonus_per_day ?? null }
        : undefined;
    by = { firm: true, date: ymd(d), ...(hasTime ? { time: hhmm } : {}), ...(early ? { early } : {}) };
  } else if (t.plan_by) {
    const date = ymd(new Date(t.plan_by));
    by =
      t.plan_within_days != null
        ? { firm: false, withinDays: t.plan_within_days, from: addDaysYmd(date, -t.plan_within_days) }
        : { firm: false, date };
  }
  let ss: WhenSession[] = sessions.map((s) => ({ start: s.starts_at, end: s.ends_at }));
  if (!ss.length && t.scheduled_start && t.scheduled_end) ss = [{ start: t.scheduled_start, end: t.scheduled_end }];
  ss.sort((a, b) => a.start.localeCompare(b.start));
  return { by, sessions: ss };
}

/** Flexible -> Fixed: a range becomes its last day ("Within a week" -> the date 7 days on). */
export function makeFixed(v: WhenValue): WhenValue {
  const b = v.by;
  if (!b || b.firm) return v;
  const date = "withinDays" in b ? addDaysYmd(b.from, b.withinDays) : b.date;
  return { ...v, by: { firm: true, date } };
}

/** Fixed -> Flexible: keeps the date as "Around <date>". */
export function makeFlexible(v: WhenValue): WhenValue {
  const b = v.by;
  if (!b || !b.firm) return v;
  return { ...v, by: { firm: false, date: b.date } };
}

// ---------- words ----------

function sessionWords(s: WhenSession, today: string): string {
  const d = new Date(s.start);
  const day = dayName(ymd(d), today);
  const label = day === "today" || day === "tomorrow" ? day[0].toUpperCase() + day.slice(1) : day;
  return `${label} ${clock(`${p2(d.getHours())}:${p2(d.getMinutes())}`)}`;
}

/** The pill face, on every screen and card. */
export function whenWords(v: WhenValue, now: Date): string {
  const today = ymd(now);
  const sess = v.sessions.length ? sessionWords(v.sessions[0], today) : null;
  const b = v.by;
  if (!b) return sess ?? "When";
  let main: string;
  if (b.firm) {
    const diff = dayDiff(b.date, today);
    const nowHm = `${p2(now.getHours())}:${p2(now.getMinutes())}`;
    if (diff < 0 || (diff === 0 && b.time && b.time < nowHm)) main = "Overdue";
    else if (diff === 0) main = "Due today";
    else main = `By ${dayName(b.date, today)}${b.time ? ` ${clock(b.time)}` : ""}`;
  } else if ("withinDays" in b) {
    // Flexible never goes overdue: once its window has passed it quietly counts from today again.
    main = b.withinDays === 7 ? "Within a week" : b.withinDays === 14 ? "Within 2 weeks" : b.withinDays >= 28 && b.withinDays <= 31 ? "This month" : `Within ${b.withinDays} days`;
  } else {
    const diff = dayDiff(b.date, today);
    main = diff <= 0 ? "Around today" : diff === 1 ? "Around tomorrow" : `Around ${dayName(b.date, today)}`;
  }
  return sess ? `${main} · ${sess}` : main;
}

/** The line above Import (and the quest editor's footer when creating): says what will happen. */
export function landsWords(v: WhenValue, board: string | null, place: "today" | "additional" | "board"): string {
  const parts: string[] = [];
  if (board) parts.push(`on the ${board} board`);
  if (place === "today") parts.push("in Today's Quests");
  else if (place === "additional") parts.push("in Additional Quests");
  const where = parts.length ? parts.join(" and ") : "on a board";
  const lead = `Goes ${where}`;
  const sess = v.sessions[0];
  if (sess) {
    const s = new Date(sess.start);
    const e = new Date(sess.end);
    const day = WD[s.getDay()];
    const ap = e.getHours() >= 12 ? "pm" : "am";
    return `${lead}, and on your calendar ${day} ${clockLong(s)}–${clockLong(e)} ${ap}.`;
  }
  const b = v.by;
  const tail = " It won't be on your calendar until you Auto-schedule it.";
  if (!b) return `${lead}. Not on your calendar.`;
  if (b.firm) {
    const d = parseYmd(b.date);
    return `${lead}, and onto the auto-scheduler's list, to be placed before ${WD[d.getDay()]} (fixed).${tail}`;
  }
  if ("withinDays" in b) return `${lead}, and onto the auto-scheduler's list to get a time within ${withinPhrase(b.withinDays)}.${tail}`;
  const d = parseYmd(b.date);
  return `${lead}, and onto the auto-scheduler's list to get a time around ${WD[d.getDay()]}.${tail}`;
}

// ---------- what to write ----------

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The writes that turn `before` into `after`; empty when nothing changed. Fixed and Flexible clear each other. */
export function whenChanges(before: WhenValue, after: WhenValue): WhenOp[] {
  const ops: WhenOp[] = [];
  const a = after.by;
  if (!same(before.by, a)) {
    if (!a) {
      if (before.by?.firm) ops.push({ op: "clearFixed" });
      else ops.push({ op: "clearFlexible" });
    } else if (a.firm) {
      ops.push({ op: "setFixed", date: a.date, time: a.time ?? null, early: a.early ?? null });
      if (before.by && !before.by.firm) ops.push({ op: "clearFlexible" });
    } else {
      const date = "withinDays" in a ? addDaysYmd(a.from, a.withinDays) : a.date;
      ops.push({ op: "setFlexible", date, withinDays: "withinDays" in a ? a.withinDays : null });
      if (before.by?.firm) ops.push({ op: "clearFixed" });
    }
  }
  if (!same(before.range, after.range)) ops.push({ op: "setRange", range: after.range ?? null });
  if (!same(before.sessions, after.sessions)) ops.push({ op: "setSessions", sessions: after.sessions });
  return ops;
}
