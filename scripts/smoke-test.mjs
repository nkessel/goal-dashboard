// One-off smoke test: exercises the boards/goals/tasks CRUD paths directly
// against the live Supabase project, bypassing the browser/OAuth flow.
// Cleans up the test profile it creates. Run with: node scripts/smoke-test.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function fail(step, error) {
  console.error(`FAIL [${step}]`, error);
  process.exit(1);
}

const sub = `smoke-test-${Date.now()}`;

const { data: profile, error: profileErr } = await db
  .from("profiles")
  .insert({ google_sub: sub, email: `${sub}@example.com`, name: "Smoke Test" })
  .select("*")
  .single();
if (profileErr) fail("create profile", profileErr);
console.log("OK created profile", profile.id);

const { data: board, error: boardErr } = await db
  .from("boards")
  .insert({ owner_id: profile.id, title: "Daily Tasks" })
  .select("*")
  .single();
if (boardErr) fail("create board", boardErr);
console.log("OK created board", board.id);

const { data: goal, error: goalErr } = await db
  .from("goals")
  .insert({ owner_id: profile.id, board_id: board.id, title: "Ship v1" })
  .select("*")
  .single();
if (goalErr) fail("create goal", goalErr);
console.log("OK created goal", goal.id);

const { error: progressErr } = await db
  .from("goals")
  .update({ progress: 40 })
  .eq("id", goal.id);
if (progressErr) fail("update goal progress", progressErr);
console.log("OK updated goal progress to 40%");

const { data: task, error: taskErr } = await db
  .from("tasks")
  .insert({
    owner_id: profile.id,
    goal_id: goal.id,
    title: "Write onboarding email",
    importance: 4,
    urgency: 2,
    xp_value: 10,
  })
  .select("*")
  .single();
if (taskErr) fail("create task", taskErr);
console.log("OK created task", task.id);

const { error: pinErr } = await db
  .from("tasks")
  .update({ is_manual_priority: true })
  .eq("id", task.id);
if (pinErr) fail("pin task to top 3", pinErr);
console.log("OK pinned task to top-3");

const { error: completeErr } = await db
  .from("tasks")
  .update({ status: "completed", completed_at: new Date().toISOString() })
  .eq("id", task.id);
if (completeErr) fail("complete task", completeErr);
console.log("OK marked task completed");

const { error: activityErr } = await db
  .from("activity_events")
  .insert({ owner_id: profile.id, kind: "task_completed", task_id: task.id, is_public: true });
if (activityErr) fail("log activity event", activityErr);
console.log("OK logged activity event");

// Cleanup (cascades: task -> activity_events, goal -> task via FK set null already handled)
await db.from("activity_events").delete().eq("owner_id", profile.id);
await db.from("tasks").delete().eq("owner_id", profile.id);
await db.from("goals").delete().eq("owner_id", profile.id);
await db.from("boards").delete().eq("owner_id", profile.id);
await db.from("profiles").delete().eq("id", profile.id);
console.log("OK cleaned up test data");

console.log("\nAll smoke tests passed.");
