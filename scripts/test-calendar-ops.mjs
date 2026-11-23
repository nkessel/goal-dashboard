// Apply-then-undo checks for src/lib/data/calendar-ops.ts (planner step 5), against the fake database that
// npm run ui-check uses (no network, no real data). Run with:
//   node scripts/test-calendar-ops.mjs
import { execSync } from "node:child_process";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { startFakeDb } from "./ui-check/fake-db.mjs";

const root = new URL("..", import.meta.url).pathname;
const PORT = 54391;
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${PORT}`;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";

// Bundled next to the scripts (like test-xp-module), so it finds the repo's own supabase-js.
const out = join(root, "scripts/.calendar-ops-module.mjs");
execSync(`npx --yes esbuild --bundle --platform=node --format=esm --external:@supabase/supabase-js --alias:server-only=./scripts/noop-server-only.mjs src/lib/data/calendar-ops.ts --outfile=${out}`, { cwd: root, stdio: "ignore" });
const { applyCalendarOps, CHANGED_SINCE } = await import(out);

const OWNER = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "00000000-0000-4000-8000-0000000000c2";
const at = (h) => new Date(Date.UTC(2026, 10, 24, h)).toISOString();
const ids = { placed: randomUUID(), loose: randomUUID(), sess: randomUUID(), block: randomUUID(), theirs: randomUUID() };
const fixtures = () => ({
  profiles: [{ id: OWNER }, { id: OTHER }],
  tasks: [
    { id: ids.placed, owner_id: OWNER, title: "Placed quest", status: "open", is_on_calendar: true, scheduled_start: at(14), scheduled_end: at(15), reschedule_count: 2, google_calendar_event_id: "g-placed", travel_before_min: 0, travel_after_min: 0, on_google: true, queued_for: null, snoozed_until: null },
    { id: ids.loose, owner_id: OWNER, title: "Loose quest", status: "open", is_on_calendar: false, scheduled_start: null, scheduled_end: null, reschedule_count: 0, google_calendar_event_id: null },
    { id: ids.theirs, owner_id: OTHER, title: "Someone else's", status: "open", is_on_calendar: true, scheduled_start: at(9), scheduled_end: at(10), reschedule_count: 0 },
  ],
  task_sessions: [{ id: ids.sess, owner_id: OWNER, task_id: ids.placed, starts_at: at(18), ends_at: at(19), google_calendar_event_id: "g-sess", travel_before_min: 10, travel_after_min: 5, on_google: true }],
  calendar_blocks: [{ id: ids.block, owner_id: OWNER, kind: "essential", source_key: "lunch", title: "Lunch", icon: null, day: "2026-11-24", starts_at: at(16), ends_at: at(17), state: "placed", series_id: null, travel_before_min: 0, travel_after_min: 0, on_google: false, google_event_id: null }],
});

const db = await startFakeDb({ port: PORT, fixtures });
let bad = 0;
const ok = (cond, msg, extra = "") => {
  if (!cond) bad++;
  console.log(cond ? "OK:" : "FAIL:", msg, cond ? "" : extra);
};
const strip = (r) => {
  const rest = { ...r };
  for (const k of ["updated_at", "created_at", "google_calendar_event_id", "google_event_id"]) delete rest[k];
  return rest;
};
const snap = () => JSON.stringify(["tasks", "task_sessions", "calendar_blocks"].map((t) => [...(db.tables[t] ?? [])].map(strip).sort((a, b) => (a.id < b.id ? -1 : 1))));
const row = (t, id) => (db.tables[t] ?? []).find((r) => r.id === id);
const reset = async () => fetch(`http://127.0.0.1:${PORT}/__reset`, { method: "POST" });

// A pretend Google: records each call; never the owner's calendar.
const calls = [];
let googleFails = false;
const google = {
  async placed(table, r) {
    calls.push(["placed", table, r.google_calendar_event_id ?? null]);
    if (googleFails) throw new Error("403 not yours");
    return r.google_calendar_event_id ? null : `g-new-${calls.length}`;
  },
  async removed(table, before) {
    calls.push(["removed", table, before.google_calendar_event_id ?? null]);
  },
};

try {
  const start = snap();

  // 1. Moving a placed quest counts as a reschedule; its undo puts the count back.
  let r = await applyCalendarOps(OWNER, [{ op: "place", ref: `t:${ids.placed}`, start: at(20), end: at(21) }], { google });
  ok(row("tasks", ids.placed).reschedule_count === 3 && row("tasks", ids.placed).scheduled_start === at(20), "move: new time, reschedule counted");
  ok(calls.at(-1)?.[0] === "placed" && calls.at(-1)?.[2] === "g-placed", "move: Google event moved after the row");
  let u = await applyCalendarOps(OWNER, r.undo, { google });
  ok(snap() === start, "move: undo puts every row back (count 2 again)");
  ok(u.skipped.length === 0, "move: nothing skipped");

  // 2. A resize (counts false) isn't a reschedule.
  r = await applyCalendarOps(OWNER, [{ op: "place", ref: ids.placed, start: at(14), end: at(16), counts: false }]);
  ok(row("tasks", ids.placed).reschedule_count === 2, "resize: not counted (bare id works)");
  await applyCalendarOps(OWNER, r.undo);
  ok(snap() === start, "resize: undo");

  // 3. Placing a loose quest makes a Google event; the undo takes the quest off and the event with it.
  calls.length = 0;
  r = await applyCalendarOps(OWNER, [{ op: "place", ref: `t:${ids.loose}`, start: at(11), end: at(12) }], { google });
  const made = row("tasks", ids.loose).google_calendar_event_id;
  ok(row("tasks", ids.loose).is_on_calendar === true && row("tasks", ids.loose).reschedule_count === 0, "place: on the calendar, not a reschedule");
  ok(made === "g-new-1", "place: new Google id kept on the row", made);
  await applyCalendarOps(OWNER, r.undo, { google });
  ok(snap() === start, "place: undo takes it off");
  ok(JSON.stringify(calls.at(-1)) === JSON.stringify(["removed", "tasks", "g-new-1"]), "place: undo removes the Google event it made", JSON.stringify(calls));

  // 4. Removing a session deletes its row; the undo makes it again (same id and times) and a new Google event.
  calls.length = 0;
  r = await applyCalendarOps(OWNER, [{ op: "remove", ref: `s:${ids.sess}` }], { google });
  ok(!row("task_sessions", ids.sess), "remove session: row gone");
  ok(JSON.stringify(calls[0]) === JSON.stringify(["removed", "task_sessions", "g-sess"]), "remove session: its Google event removed");
  const redo = await applyCalendarOps(OWNER, r.undo, { google });
  ok(snap() === start, "remove session: undo brings the row back");
  ok(calls.at(-1)?.[0] === "placed" && row("task_sessions", ids.sess).google_calendar_event_id?.startsWith("g-new"), "remove session: undo makes its Google event again");
  // Redo (the undo's own opposite) removes it again, and undoing that brings it back.
  const re = await applyCalendarOps(OWNER, redo.undo);
  ok(!row("task_sessions", ids.sess), "redo: removed again");
  await applyCalendarOps(OWNER, re.undo);
  ok(snap() === start, "redo: and back");

  // 5. Removing a placed quest keeps its row, takes it off.
  r = await applyCalendarOps(OWNER, [{ op: "remove", ref: ids.placed }]);
  ok(row("tasks", ids.placed) && row("tasks", ids.placed).is_on_calendar === false && row("tasks", ids.placed).scheduled_start === null, "remove quest: off the calendar, row kept");
  await applyCalendarOps(OWNER, r.undo);
  ok(snap() === start, "remove quest: undo");

  // 6. One batch of everything is one undo step.
  r = await applyCalendarOps(OWNER, [
    { op: "place", ref: `b:${ids.block}`, start: at(12), end: at(13) },
    { op: "skip", ref: `b:${ids.block}`, skipped: true },
    { op: "travel", ref: `s:${ids.sess}`, before: 25, after: 9999 },
    { op: "google", ref: `t:${ids.placed}`, on: false },
    { op: "queue", ref: `t:${ids.loose}`, queued_for: "2026-11-25", snoozed_until: at(23) },
    { op: "remove", ref: `b:${ids.block}` },
  ]);
  ok(!row("calendar_blocks", ids.block) && row("task_sessions", ids.sess).travel_after_min === 600 && row("tasks", ids.placed).on_google === false && row("tasks", ids.loose).queued_for === "2026-11-25", "batch: every op applied (travel capped at 600)");
  ok(r.undo.length === 6 && r.undo.every((o) => o.op === "restore"), "batch: six opposites");
  await applyCalendarOps(OWNER, r.undo);
  ok(snap() === start, "batch: one undo puts all of it back");

  // 7. Changed since: an undo leaves a row someone else moved.
  r = await applyCalendarOps(OWNER, [{ op: "place", ref: `t:${ids.placed}`, start: at(20), end: at(21) }]);
  row("tasks", ids.placed).scheduled_start = at(7);
  u = await applyCalendarOps(OWNER, r.undo);
  ok(u.skipped.length === 1 && u.skipped[0] === CHANGED_SINCE && row("tasks", ids.placed).scheduled_start === at(7), "changed since: left as it is");
  await reset();
  ok(snap() === start, "reset");

  // 8. Opposites come back from the page, so a restore writes only calendar columns, only on your own rows.
  await applyCalendarOps(OWNER, [{ op: "restore", row: { table: "tasks", id: ids.placed, cols: { owner_id: OTHER, title: "Hacked", xp_reward: 9999, scheduled_start: at(8) } } }]);
  const p = row("tasks", ids.placed);
  ok(p.owner_id === OWNER && p.title === "Placed quest" && p.scheduled_start === at(8), "restore: only calendar columns written");
  await reset();
  u = await applyCalendarOps(OWNER, [{ op: "restore", row: { table: "tasks", id: ids.theirs, cols: { scheduled_start: at(1) } } }]);
  ok(u.skipped.length === 1 && row("tasks", ids.theirs).scheduled_start === at(9), "restore: someone else's row is left alone");
  u = await applyCalendarOps(OWNER, [{ op: "place", ref: `t:${ids.theirs}`, start: at(1), end: at(2) }]);
  ok(u.skipped.length === 1 && row("tasks", ids.theirs).scheduled_start === at(9), "place: someone else's row is left alone");
  let threw = false;
  try {
    await applyCalendarOps(OWNER, [{ op: "restore", row: { table: "tasks", id: randomUUID(), cols: { title: "x" }, insert: true }, expect: null }]);
  } catch {
    threw = true;
  }
  ok(threw, "restore: a quest row is never made through here");
  const before8 = snap();
  u = await applyCalendarOps(OWNER, [{ op: "restore", row: { table: "task_sessions", id: randomUUID(), cols: { task_id: ids.theirs, starts_at: at(1), ends_at: at(2) }, insert: true }, expect: null }]);
  ok(u.skipped.length === 1 && snap() === before8, "restore: no session on someone else's quest");

  // 9. Google refusing never blocks the app's own change.
  googleFails = true;
  r = await applyCalendarOps(OWNER, [{ op: "place", ref: `t:${ids.placed}`, start: at(20), end: at(21) }], { google });
  ok(row("tasks", ids.placed).scheduled_start === at(20) && r.google.length === 1 && /403/.test(r.google[0]), "Google refuses: row still moved, note given");
  googleFails = false;
  await applyCalendarOps(OWNER, r.undo);
  ok(snap() === start, "Google refuses: undo");

  // 10. A bad time is refused before anything is written.
  threw = false;
  try {
    await applyCalendarOps(OWNER, [{ op: "place", ref: ids.placed, start: at(5), end: at(4) }]);
  } catch {
    threw = true;
  }
  ok(threw && snap() === start, "place: end before start refused, nothing written");
} finally {
  db.close();
}

console.log(bad ? `\n${bad} failed` : "\nAll calendar-ops checks passed.");
process.exit(bad ? 1 : 0);
