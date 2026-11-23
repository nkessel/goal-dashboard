import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The one write path for the calendar (planner step 5, docs/CALENDAR-PLANNER-DESIGN.md 2a). Every change to a time
 * goes through `applyCalendarOps`, which returns the opposite ops: applying those puts every row back, so Undo
 * (step 6) is a matter of keeping them. Rules, from the design:
 *
 * - The app's rows change first and Google after; a Google refusal is reported, never blocks.
 * - A batch is one undo step: its opposites come back in reverse order, as one list.
 * - Each opposite carries the values it expects to find. If the row has changed since (another device, another
 *   tab), that one is skipped with "That one changed since; left as it is."
 * - An undo never counts as a reschedule: it puts `reschedule_count` back.
 *
 * Refs: "t:<task id>" (a bare task id works too), "s:<session id>", "b:<calendar block id>".
 * Google event ids are never put back by an undo: a removed event is made again, a moved one is moved again.
 */

export type Cols = Record<string, unknown>;
export type CalTable = "tasks" | "task_sessions" | "calendar_blocks";

export type CalOp =
  /** Put an item at a time (also a move or a resize). `counts: false`: not a reschedule (a resize, planning a day). */
  | { op: "place"; ref: string; start: string; end: string; counts?: boolean }
  /** Take it off the calendar: a quest keeps its row; a session or a block row goes. */
  | { op: "remove"; ref: string }
  /** The opposite of the others: write `cols` back (or insert the row, or delete it), if the row still holds `expect`. */
  | { op: "restore"; row: { table: CalTable; id: string; cols: Cols; insert?: boolean; deleteIt?: boolean }; expect?: Cols | null }
  | { op: "travel"; ref: string; before: number; after: number }
  | { op: "google"; ref: string; on: boolean }
  /** One day of an essential, habit or series (a calendar block). */
  | { op: "skip"; ref: string; skipped: boolean }
  /** Today's snooze, so it travels with the time. */
  | { op: "queue"; ref: string; queued_for: string | null; snoozed_until: string | null };

/** What the app does on Google once its own rows have changed. Null: Google isn't connected. */
export type GoogleSide = {
  /** An item is (still) on the calendar at this row's time: move its event, or make one; returns a new event's id. */
  placed: (table: CalTable, row: Cols) => Promise<string | null | void>;
  /** An item came off the calendar: its event, as it was before. */
  removed: (table: CalTable, before: Cols) => Promise<void>;
};

export type CalOpsResult = {
  /** Apply these to put it all back (one undo step). Empty when nothing changed. */
  undo: CalOp[];
  /** Ops left as they were, with why. */
  skipped: string[];
  /** Google's side, when it didn't take a change. */
  google: string[];
};

export const CHANGED_SINCE = "That one changed since; left as it is.";

/** Columns an undo never writes back: Google's own ids (see above) and the row's clock. */
const NOT_RESTORED = new Set(["google_calendar_event_id", "google_event_id", "updated_at", "created_at"]);

function target(ref: string): { table: CalTable; id: string } {
  if (ref.startsWith("s:")) return { table: "task_sessions", id: ref.slice(2) };
  if (ref.startsWith("b:")) return { table: "calendar_blocks", id: ref.slice(2) };
  return { table: "tasks", id: ref.startsWith("t:") ? ref.slice(2) : ref };
}

/** Same value? Times compare as moments ("…Z" and "…+00:00" are the same time). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "string" && typeof b === "string" && /^\d{4}-\d{2}-\d{2}T/.test(a) && /^\d{4}-\d{2}-\d{2}T/.test(b)) return Date.parse(a) === Date.parse(b);
  return JSON.stringify(a) === JSON.stringify(b);
}

function holds(row: Cols | null, expect: Cols | null | undefined): boolean {
  if (expect === undefined) return true;
  if (expect === null) return row === null;
  if (!row) return false;
  return Object.entries(expect).every(([k, v]) => NOT_RESTORED.has(k) || sameValue(row[k], v));
}

/**
 * The columns a restore may write back on a row that's there: only the calendar's own. Opposites come back from the
 * page for Undo, so nothing else (an owner, a title, XP) can be written through here.
 */
const CAL_COLS: Record<CalTable, Set<string>> = {
  tasks: new Set(["scheduled_start", "scheduled_end", "is_on_calendar", "reschedule_count", "travel_before_min", "travel_after_min", "on_google", "queued_for", "snoozed_until"]),
  task_sessions: new Set(["starts_at", "ends_at", "travel_before_min", "travel_after_min", "on_google"]),
  calendar_blocks: new Set(["starts_at", "ends_at", "state", "travel_before_min", "travel_after_min", "on_google"]),
};
const calOnly = (table: CalTable, c: Cols): Cols => Object.fromEntries(Object.entries(c).filter(([k]) => CAL_COLS[table].has(k)));

const pickCols = (row: Cols, keys: string[]): Cols => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
const restorable = (c: Cols): Cols => Object.fromEntries(Object.entries(c).filter(([k]) => !NOT_RESTORED.has(k)));

/** Is it on the calendar, as this row stands? */
function onCalendar(table: CalTable, row: Cols | null): boolean {
  if (!row) return false;
  if (table === "tasks") return !!row.is_on_calendar && !!row.scheduled_start;
  if (table === "calendar_blocks") return row.state === "placed" && !!row.starts_at;
  return !!row.starts_at;
}

export async function applyCalendarOps(ownerId: string, ops: CalOp[], opts: { google?: GoogleSide | null } = {}): Promise<CalOpsResult> {
  const db = supabaseAdmin();
  const undo: CalOp[] = [];
  const skipped: string[] = [];
  const googleNotes: string[] = [];

  async function read(table: CalTable, id: string): Promise<Cols | null> {
    const { data, error } = await db.from(table).select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
    if (error) throw new Error(`Couldn't read that: ${error.message}`);
    return (data as Cols | null) ?? null;
  }
  async function update(table: CalTable, id: string, cols: Cols) {
    const { error } = await db.from(table).update(cols).eq("id", id).eq("owner_id", ownerId);
    if (error) throw new Error(`Couldn't change that: ${error.message}`);
  }
  async function google(table: CalTable, before: Cols | null, id: string) {
    const g = opts.google;
    if (!g) return;
    const after = await read(table, id).catch(() => null);
    try {
      if (onCalendar(table, after)) {
        const made = await g.placed(table, after!);
        const col = table === "calendar_blocks" ? "google_event_id" : "google_calendar_event_id";
        if (made && after && !after[col]) await update(table, id, { [col]: made });
      } else if (before && onCalendar(table, before)) await g.removed(table, before);
    } catch (e) {
      googleNotes.push(`Google didn't take it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  /** Write `cols` over the row and keep what they replaced as the opposite. */
  async function write(table: CalTable, id: string, before: Cols, cols: Cols) {
    await update(table, id, cols);
    undo.unshift({ op: "restore", row: { table, id, cols: restorable(pickCols(before, Object.keys(cols))) }, expect: restorable(cols) });
  }

  for (const o of ops) {
    if (o.op === "restore") {
      const { table, id } = o.row;
      const before = await read(table, id);
      if (!holds(before, o.expect)) {
        skipped.push(CHANGED_SINCE);
        continue;
      }
      if (o.row.deleteIt) {
        if (!before) continue;
        const { error } = await db.from(table).delete().eq("id", id).eq("owner_id", ownerId);
        if (error) throw new Error(`Couldn't put that back: ${error.message}`);
        undo.unshift({ op: "restore", row: { table, id, cols: restorable(before), insert: true }, expect: null });
      } else if (o.row.insert) {
        if (before) continue;
        // Only a session or a block row is ever made again (a quest keeps its row), and a session only on your own quest.
        if (table === "tasks") throw new Error("Couldn't put that back.");
        const cols: Cols = { ...restorable(o.row.cols), id, owner_id: ownerId };
        if (table === "task_sessions" && !(await read("tasks", String(cols.task_id ?? "")))) {
          skipped.push(CHANGED_SINCE);
          continue;
        }
        const { error } = await db.from(table).insert(cols);
        if (error) throw new Error(`Couldn't put that back: ${error.message}`);
        undo.unshift({ op: "restore", row: { table, id, cols: {}, deleteIt: true }, expect: restorable(cols) });
      } else {
        if (!before) {
          skipped.push(CHANGED_SINCE);
          continue;
        }
        await write(table, id, before, calOnly(table, restorable(o.row.cols)));
      }
      await google(table, before, id);
      continue;
    }

    const { table, id } = target(o.ref);
    const before = await read(table, id);
    if (!before) {
      skipped.push("That isn't on the calendar anymore.");
      continue;
    }
    if (o.op === "place") {
      const start = new Date(o.start);
      const end = new Date(o.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error("Pick a time first.");
      const s = start.toISOString();
      const e = end.toISOString();
      if (table === "tasks") {
        // Moving a quest that's already on the calendar is a reschedule, unless it's a resize or planning a day.
        const counts = o.counts !== false && !!before.is_on_calendar;
        await write(table, id, before, { scheduled_start: s, scheduled_end: e, is_on_calendar: true, reschedule_count: Number(before.reschedule_count ?? 0) + (counts ? 1 : 0) });
      } else if (table === "task_sessions") await write(table, id, before, { starts_at: s, ends_at: e });
      else await write(table, id, before, { starts_at: s, ends_at: e, state: "placed" });
    } else if (o.op === "remove") {
      if (table === "tasks") await write(table, id, before, { is_on_calendar: false, scheduled_start: null, scheduled_end: null, google_calendar_event_id: null });
      else {
        const { error } = await db.from(table).delete().eq("id", id).eq("owner_id", ownerId);
        if (error) throw new Error(`Couldn't take that off the calendar: ${error.message}`);
        undo.unshift({ op: "restore", row: { table, id, cols: restorable(before), insert: true }, expect: null });
      }
    } else if (o.op === "travel") {
      const m = (n: number) => Math.max(0, Math.min(600, Math.round(n) || 0));
      await write(table, id, before, { travel_before_min: m(o.before), travel_after_min: m(o.after) });
    } else if (o.op === "google") {
      await write(table, id, before, { on_google: o.on });
    } else if (o.op === "skip") {
      if (table !== "calendar_blocks") {
        skipped.push("Only a day of an essential or a habit can be skipped.");
        continue;
      }
      await write(table, id, before, { state: o.skipped ? "skipped" : "placed" });
    } else if (o.op === "queue") {
      if (table !== "tasks") {
        skipped.push("Only a quest can be snoozed.");
        continue;
      }
      await write(table, id, before, { queued_for: o.queued_for, snoozed_until: o.snoozed_until });
    }
    if (o.op === "place" || o.op === "remove") await google(table, before, id);
  }
  return { undo, skipped, google: googleNotes };
}
