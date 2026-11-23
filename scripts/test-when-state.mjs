// Checks for src/components/tasks/editor/when-state.ts (the quest editor's When panel, When 2). Run with:
//   node scripts/test-when-state.mjs
process.env.TZ = "America/New_York";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "when-state-"));
const out = join(dir, "when-state.mjs");
execSync(`npx --yes esbuild --bundle --format=esm --platform=neutral src/components/tasks/editor/when-state.ts --outfile=${out}`, { cwd: new URL("..", import.meta.url).pathname, stdio: "ignore" });
const S = await import(out);

let bad = 0;
function eq(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(ok ? "OK:" : "FAIL:", msg, ok ? "" : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`);
}

// Wed Nov 18, 2026, 10:00 local
const now = new Date(2026, 10, 18, 10, 0);
const none = { dueDate: "", dueTime: "", planDays: null };
const week = S.applyWhenChoice(none, { kind: "range", days: 7 }, now);
eq(week, { dueDate: "", dueTime: "", planDays: 7 }, "range is Flexible");
eq(S.editorWhenFace(week, null, now), { words: "Within a week", late: false }, "face: within a week");
eq(S.editorWhenFace({ ...none, planDays: 30 }, null, now).words, "Within a month", "face: within a month (import card's words)");
const fri = S.applyWhenChoice(none, { kind: "day", day: "2026-11-20" }, now);
eq(fri, { dueDate: "", dueTime: "", planDays: 2 }, "a day with nothing set starts Flexible");
eq(S.editorWhenFace(fri, null, now).words, "Around Fri", "face: around Fri");
const fixedWeek = S.applyWhenChoice(week, { kind: "firm", firm: true }, now);
eq(fixedWeek, { dueDate: "2026-11-25", dueTime: "", planDays: 7 }, "Within a week made Fixed: its last day, still on the list");
eq(S.editorWhenFace(fixedWeek, null, now).words, "By Nov 25", "face: by Nov 25");
const fixedFri = S.applyWhenChoice(fri, { kind: "firm", firm: true }, now);
eq(fixedFri.dueDate, "2026-11-20", "Around Fri made Fixed: Fri");
eq(S.applyWhenChoice(fixedFri, { kind: "day", day: "2026-11-21" }, now), { dueDate: "2026-11-21", dueTime: "", planDays: 3 }, "a day on a Fixed date stays Fixed");
eq(S.applyWhenChoice({ dueDate: "2026-11-20", dueTime: "17:00", planDays: null }, { kind: "firm", firm: false }, now), { dueDate: "", dueTime: "", planDays: 2 }, "Fixed made Flexible: around that day");
eq(S.applyWhenChoice(fixedFri, { kind: "range", days: 14 }, now), { dueDate: "", dueTime: "", planDays: 14 }, "a range on a Fixed date: Flexible");
eq(S.applyWhenChoice(fixedFri, { kind: "clear" }, now), none, "clear");
eq(S.applyWhenChoice(none, { kind: "firm", firm: true }, now), none, "Fixed with nothing set: nothing");
eq(S.editorWhenFace({ dueDate: "2026-11-18", dueTime: "", planDays: 0 }, null, now), { words: "Due today", late: true }, "Fixed today reads red");
eq(S.editorWhenFace({ dueDate: "2026-11-17", dueTime: "", planDays: null }, null, now), { words: "Overdue", late: true }, "Fixed past: Overdue");
eq(S.editorWhenFace({ dueDate: "", dueTime: "", planDays: 0 }, null, now), { words: "Around today", late: false }, "Flexible today never late");
const slot = { start: new Date(2026, 10, 19, 15, 0).toISOString(), end: new Date(2026, 10, 19, 15, 30).toISOString() };
eq(S.editorWhenFace({ dueDate: "2026-11-20", dueTime: "", planDays: 2 }, slot, now).words, "By Fri · Tomorrow 3pm", "Fixed + a picked time");
eq(S.editorWhenFace(none, slot, now).words, "Tomorrow 3pm", "a picked time alone");
eq(S.editorWhenFace(none, null, now).words, "When", "nothing: When");

console.log(bad ? `\n${bad} failed` : "\nall passed");
process.exit(bad ? 1 : 0);
