// Checks for src/lib/when.ts (whenWords, landsWords, makeFixed, whenChanges, whenFromTask). Run with:
//   node scripts/test-when.mjs
process.env.TZ = "America/New_York";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "when-"));
const out = join(dir, "when.mjs");
execSync(`npx --yes esbuild --format=esm src/lib/when.ts --outfile=${out}`, { cwd: new URL("..", import.meta.url).pathname, stdio: "ignore" });
const W = await import(out);

let bad = 0;
function eq(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(ok ? "OK:" : "FAIL:", msg, ok ? "" : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`);
}

// Wed Nov 18, 2026, 10:00 local
const now = new Date(2026, 10, 18, 10, 0);
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const sess = (d, h, m, h2, m2) => ({ start: at(d, h, m), end: at(d, h2, m2) });

const none = { by: null, sessions: [] };
const week = { by: { firm: false, withinDays: 7, from: "2026-11-18" }, sessions: [] };
const around = { by: { firm: false, date: "2026-11-20" }, sessions: [] };
const byFri = { by: { firm: true, date: "2026-11-20" }, sessions: [] };
const byFri5 = { by: { firm: true, date: "2026-11-20", time: "17:00" }, sessions: [] };
const thu3 = sess(19, 15, 0, 15, 30);

eq(W.whenWords(none, now), "When", "nothing set");
eq(W.whenWords(week, now), "Within a week", "within a week");
eq(W.whenWords({ by: { firm: false, withinDays: 14, from: "2026-11-18" }, sessions: [] }, now), "Within 2 weeks", "within 2 weeks");
eq(W.whenWords(around, now), "Around Fri", "around Fri");
eq(W.whenWords(byFri, now), "By Fri", "by Fri");
eq(W.whenWords(byFri5, now), "By Fri 5pm", "by Fri 5pm");
eq(W.whenWords({ ...byFri, sessions: [thu3] }, now), "By Fri · Tomorrow 3pm", "fixed + picked time");
eq(W.whenWords({ by: null, sessions: [thu3] }, now), "Tomorrow 3pm", "picked time only");
eq(W.whenWords({ by: null, sessions: [thu3, sess(20, 9, 30, 10, 0)] }, now), "Tomorrow 3pm", "two sessions show the first");
eq(W.whenWords({ by: { firm: true, date: "2026-11-18" }, sessions: [] }, now), "Due today", "fixed due today");
eq(W.whenWords({ by: { firm: true, date: "2026-11-18", time: "09:00" }, sessions: [] }, now), "Overdue", "fixed today, time passed");
eq(W.whenWords({ by: { firm: true, date: "2026-11-15" }, sessions: [] }, now), "Overdue", "fixed overdue");
eq(W.whenWords({ by: { firm: false, date: "2026-11-10" }, sessions: [] }, now), "Around today", "flexible past its day moves forward");
eq(W.whenWords({ by: { firm: false, date: "2026-12-05" }, sessions: [] }, now), "Around Dec 5", "flexible far date");

eq(W.makeFixed(week).by, { firm: true, date: "2026-11-25" }, "makeFixed of a range = last day");
eq(W.makeFixed(around).by, { firm: true, date: "2026-11-20" }, "makeFixed of a date");
eq(W.makeFixed(none).by, null, "makeFixed of nothing");
eq(W.makeFlexible(byFri).by, { firm: false, date: "2026-11-20" }, "makeFlexible");

eq(W.whenChanges(none, none), [], "no change, no ops");
eq(W.whenChanges(none, week), [{ op: "setFlexible", date: "2026-11-25", withinDays: 7 }], "set within a week");
eq(W.whenChanges(week, W.makeFixed(week)), [{ op: "setFixed", date: "2026-11-25", time: null, early: null }, { op: "clearFlexible" }], "flexible -> fixed clears flexible");
eq(W.whenChanges(byFri, around), [{ op: "setFlexible", date: "2026-11-20", withinDays: null }, { op: "clearFixed" }], "fixed -> flexible clears due");
eq(W.whenChanges(byFri, none), [{ op: "clearFixed" }], "clear fixed");
eq(W.whenChanges(week, none), [{ op: "clearFlexible" }], "clear flexible");
eq(W.whenChanges(none, { by: null, sessions: [thu3] }), [{ op: "setSessions", sessions: [thu3] }], "pick a time");
eq(W.whenChanges(none, { by: null, range: { kind: "before", to: "12:00" }, sessions: [] }), [{ op: "setRange", range: { kind: "before", to: "12:00" } }], "set a range");

const L = (v, b, p) => W.landsWords(v, b, p);
eq(L(none, "Errands", "additional"), "Goes on the Errands board and in Additional Quests. Not on your calendar.", "lands: no date");
eq(L(week, "Errands", "additional"), "Goes on the Errands board and in Additional Quests, and onto the auto-scheduler's list to get a time within a week. It won't be on your calendar until you Auto-schedule it.", "lands: flexible");
eq(L(byFri, "Errands", "additional"), "Goes on the Errands board and in Additional Quests, and onto the auto-scheduler's list, to be placed before Fri (fixed). It won't be on your calendar until you Auto-schedule it.", "lands: fixed");
eq(L({ by: null, sessions: [thu3] }, "Errands", "additional"), "Goes on the Errands board and in Additional Quests, and on your calendar Thu 3:00–3:30 pm.", "lands: picked time");
eq(L(none, null, "today"), "Goes in Today's Quests. Not on your calendar.", "lands: no board");

eq(W.whenFromTask({ due_at: at(20, 23, 59) }).by, { firm: true, date: "2026-11-20" }, "task with due_at is Fixed (end of day = no time)");
eq(W.whenFromTask({ due_at: at(20, 17, 0), early_bonus_xp: 5 }).by, { firm: true, date: "2026-11-20", time: "17:00", early: { xp: 5, coins: null, perDay: null } }, "task fixed with time and early bonus");
eq(W.whenFromTask({ plan_by: at(25, 12, 0), plan_within_days: 7 }).by, { firm: false, withinDays: 7, from: "2026-11-18" }, "task plan_by + within days is Flexible range");
eq(W.whenFromTask({ plan_by: at(20, 12, 0) }).by, { firm: false, date: "2026-11-20" }, "task plan_by alone is Flexible date");
eq(W.whenFromTask({ due_at: at(20, 23, 59), plan_by: at(19, 12, 0) }).by.firm, true, "both set reads Fixed");
eq(W.whenFromTask({ scheduled_start: thu3.start, scheduled_end: thu3.end }).sessions, [thu3], "scheduled_start/end becomes a session");

if (bad) { console.error(`${bad} failed`); process.exit(1); }
console.log("all passed");
