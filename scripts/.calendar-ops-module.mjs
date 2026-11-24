// src/lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Grab it from the Supabase dashboard: Project Settings -> API -> Legacy API Keys -> service_role, and add it to .env.local. Never expose this key to the browser."
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// src/lib/data/calendar-ops.ts
var CHANGED_SINCE = "That one changed since; left as it is.";
var NOT_RESTORED = /* @__PURE__ */ new Set(["google_calendar_event_id", "google_event_id", "updated_at", "created_at"]);
function target(ref) {
  if (ref.startsWith("s:")) return { table: "task_sessions", id: ref.slice(2) };
  if (ref.startsWith("b:")) return { table: "calendar_blocks", id: ref.slice(2) };
  return { table: "tasks", id: ref.startsWith("t:") ? ref.slice(2) : ref };
}
function sameValue(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "string" && typeof b === "string" && /^\d{4}-\d{2}-\d{2}T/.test(a) && /^\d{4}-\d{2}-\d{2}T/.test(b)) return Date.parse(a) === Date.parse(b);
  return JSON.stringify(a) === JSON.stringify(b);
}
function holds(row, expect) {
  if (expect === void 0) return true;
  if (expect === null) return row === null;
  if (!row) return false;
  return Object.entries(expect).every(([k, v]) => NOT_RESTORED.has(k) || sameValue(row[k], v));
}
var CAL_COLS = {
  tasks: /* @__PURE__ */ new Set(["scheduled_start", "scheduled_end", "is_on_calendar", "reschedule_count", "travel_before_min", "travel_after_min", "on_google", "queued_for", "snoozed_until"]),
  task_sessions: /* @__PURE__ */ new Set(["starts_at", "ends_at", "travel_before_min", "travel_after_min", "on_google"]),
  calendar_blocks: /* @__PURE__ */ new Set(["starts_at", "ends_at", "state", "travel_before_min", "travel_after_min", "on_google"])
};
var calOnly = (table, c) => Object.fromEntries(Object.entries(c).filter(([k]) => CAL_COLS[table].has(k)));
var pickCols = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
var restorable = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => !NOT_RESTORED.has(k)));
function onCalendar(table, row) {
  if (!row) return false;
  if (table === "tasks") return !!row.is_on_calendar && !!row.scheduled_start;
  if (table === "calendar_blocks") return row.state === "placed" && !!row.starts_at;
  return !!row.starts_at;
}
async function applyCalendarOps(ownerId, ops, opts = {}) {
  const db = supabaseAdmin();
  const undo = [];
  const skipped = [];
  const googleNotes = [];
  async function read(table, id) {
    const { data, error } = await db.from(table).select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
    if (error) throw new Error(`Couldn't read that: ${error.message}`);
    return data ?? null;
  }
  async function update(table, id, cols) {
    const { error } = await db.from(table).update(cols).eq("id", id).eq("owner_id", ownerId);
    if (error) throw new Error(`Couldn't change that: ${error.message}`);
  }
  async function google(table, before, id) {
    const g = opts.google;
    if (!g) return;
    const after = await read(table, id).catch(() => null);
    try {
      if (onCalendar(table, after)) {
        const made = await g.placed(table, after);
        const col = table === "calendar_blocks" ? "google_event_id" : "google_calendar_event_id";
        if (made && after && !after[col]) await update(table, id, { [col]: made });
      } else if (before && onCalendar(table, before)) await g.removed(table, before);
    } catch (e) {
      googleNotes.push(`Google didn't take it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function write(table, id, before, cols) {
    await update(table, id, cols);
    undo.unshift({ op: "restore", row: { table, id, cols: restorable(pickCols(before, Object.keys(cols))) }, expect: restorable(cols) });
  }
  for (const o of ops) {
    if (o.op === "restore") {
      const { table: table2, id: id2 } = o.row;
      const before2 = await read(table2, id2);
      if (!holds(before2, o.expect)) {
        skipped.push(CHANGED_SINCE);
        continue;
      }
      if (o.row.deleteIt) {
        if (!before2) continue;
        const { error } = await db.from(table2).delete().eq("id", id2).eq("owner_id", ownerId);
        if (error) throw new Error(`Couldn't put that back: ${error.message}`);
        undo.unshift({ op: "restore", row: { table: table2, id: id2, cols: restorable(before2), insert: true }, expect: null });
      } else if (o.row.insert) {
        if (before2) continue;
        if (table2 === "tasks") throw new Error("Couldn't put that back.");
        const cols = { ...restorable(o.row.cols), id: id2, owner_id: ownerId };
        if (table2 === "task_sessions" && !await read("tasks", String(cols.task_id ?? ""))) {
          skipped.push(CHANGED_SINCE);
          continue;
        }
        const { error } = await db.from(table2).insert(cols);
        if (error) throw new Error(`Couldn't put that back: ${error.message}`);
        undo.unshift({ op: "restore", row: { table: table2, id: id2, cols: {}, deleteIt: true }, expect: restorable(cols) });
      } else {
        if (!before2) {
          skipped.push(CHANGED_SINCE);
          continue;
        }
        await write(table2, id2, before2, calOnly(table2, restorable(o.row.cols)));
      }
      await google(table2, before2, id2);
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
      const m = (n) => Math.max(0, Math.min(600, Math.round(n) || 0));
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
export {
  CHANGED_SINCE,
  applyCalendarOps
};
