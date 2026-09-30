// Exercises the ACTUAL src/lib/data/xp.ts implementation (bundled via
// esbuild, not a hand-copied replica) against the live Supabase DB, so a
// real bug in the leveling/budget/check-in logic would actually be caught.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = new URL("..", import.meta.url).pathname;
execSync(
  `npx --yes esbuild --bundle --platform=node --format=esm --external:@supabase/supabase-js --alias:server-only=./scripts/noop-server-only.mjs src/lib/data/xp.ts --outfile=scripts/.xp-module.mjs`,
  { cwd: root, stdio: "inherit" }
);

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
process.env.NEXT_PUBLIC_SUPABASE_URL ??= line(envText, "NEXT_PUBLIC_SUPABASE_URL");
process.env.SUPABASE_SERVICE_ROLE_KEY ??= line(envText, "SUPABASE_SERVICE_ROLE_KEY");
function line(text, key) {
  const l = text.split("\n").find((l) => l.startsWith(key + "="));
  return l ? l.slice(key.length + 1).trim() : undefined;
}

const { computeLevelForXp, xpToNextLevel, currentWeekStart, recordTaskXpAssignment, awardXp, dailyCheckIn } =
  await import("./.xp-module.mjs");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("OK:", msg);
  }
}

// --- Pure functions ---
assert(computeLevelForXp(0) === 1, "0 xp -> level 1");
assert(computeLevelForXp(449) === 3, "449 xp -> still level 3");
assert(computeLevelForXp(450) === 4, "450 xp -> level 4");
assert(computeLevelForXp(3200) === 10, "3200 xp -> level 10 (max)");
assert(computeLevelForXp(999999) === 10, "xp beyond the curve caps at level 10");
assert(typeof currentWeekStart() === "string" && /^\d{4}-\d{2}-\d{2}$/.test(currentWeekStart()), "currentWeekStart returns YYYY-MM-DD");
const nxt = xpToNextLevel(100);
assert(nxt.level === 2 && nxt.nextLevel === 3, `xpToNextLevel(100) -> level 2, next 3 (got level ${nxt.level}, next ${nxt.nextLevel})`);

// --- Live: weekly budget enforcement via the real function ---
const stamp = Date.now();
const { data: profile } = await db
  .from("profiles")
  .insert({ google_sub: `xpmod-${stamp}`, email: `xpmod-${stamp}@example.com`, name: "XP Module Test" })
  .select("*")
  .single();
const { data: dummyTask } = await db
  .from("tasks")
  .insert({ owner_id: profile.id, title: "XP module test task" })
  .select("*")
  .single();

try {
  await recordTaskXpAssignment(profile.id, dummyTask.id, 60);
  console.log("OK: assign 60/100 weekly XP via the real recordTaskXpAssignment");
} catch (e) {
  console.error("FAIL: assign 60/100 weekly XP threw:", e.message);
  failures++;
}

let rejected = false;
try {
  await recordTaskXpAssignment(profile.id, dummyTask.id, 50);
} catch {
  rejected = true;
}
assert(rejected, "recordTaskXpAssignment rejects a second assignment that would exceed the 100 weekly budget (60+50>100)");

// --- Live: awardXp crossing a level, applying functional-tier perks ---
const award = await awardXp(profile.id, 500, "task_completed");
assert(award.leveledUp === true, "awardXp reports leveledUp after a 500 XP award");
assert(award.level === 4, `awardXp computes level 4 at 500 total XP (got ${award.level})`);

const { data: afterAward } = await db.from("profiles").select("*").eq("id", profile.id).single();
assert(afterAward.weekly_xp_budget === 120, `real awardXp bumped weekly_xp_budget to 120 (got ${afterAward.weekly_xp_budget})`);
assert(afterAward.streak_protection_tokens === 1, `real awardXp granted 1 streak-protection token (got ${afterAward.streak_protection_tokens})`);

const { data: levelUpActivity } = await db
  .from("activity_events")
  .select("*")
  .eq("owner_id", profile.id)
  .eq("kind", "level_up");
assert(levelUpActivity.length === 1, `real awardXp logged exactly one level_up activity event (got ${levelUpActivity.length})`);

// --- Live: dailyCheckIn, first-ever check-in ---
const checkIn1 = await dailyCheckIn(profile.id);
assert(checkIn1.alreadyCheckedInToday === false, "first check-in is not flagged as already-done");
assert(checkIn1.streakCount === 1, `first-ever check-in starts a streak of 1 (got ${checkIn1.streakCount})`);

const checkIn2 = await dailyCheckIn(profile.id);
assert(checkIn2.alreadyCheckedInToday === true, "checking in again same day is correctly rejected as already-done");

// Cleanup
await db.from("activity_events").delete().eq("owner_id", profile.id);
await db.from("xp_events").delete().eq("owner_id", profile.id);
await db.from("tasks").delete().eq("owner_id", profile.id);
await db.from("profiles").delete().eq("id", profile.id);

console.log(`\n${failures === 0 ? "All" : failures + " FAILED,"} xp.ts module tests ${failures === 0 ? "passed" : "of"}.`);
process.exit(failures === 0 ? 0 : 1);
