// Sanity-check the Priority Matrix's board-resolution query against the
// live Supabase schema: creates a profile + board + goal + task, then
// verifies listOpenTasksWithBoardForOwner-equivalent join resolves board_id.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("OK:", msg);
}

const stamp = Date.now();
const { data: profile, error: pErr } = await db
  .from("profiles")
  .insert({ google_sub: `matrix-test-${stamp}`, email: `matrix-test-${stamp}@example.com`, name: "Matrix Test" })
  .select("*")
  .single();
assert(!pErr, `create profile (${pErr?.message})`);

const { data: board, error: bErr } = await db
  .from("boards")
  .insert({ owner_id: profile.id, title: "Matrix Test Board" })
  .select("*")
  .single();
assert(!bErr, `create board (${bErr?.message})`);

const { data: goal, error: gErr } = await db
  .from("goals")
  .insert({ owner_id: profile.id, board_id: board.id, title: "Matrix Test Goal" })
  .select("*")
  .single();
assert(!gErr, `create goal (${gErr?.message})`);

const { error: t1Err } = await db
  .from("tasks")
  .insert({ owner_id: profile.id, goal_id: goal.id, title: "Task with goal", importance: 4, urgency: 5 });
assert(!t1Err, `create task with goal (${t1Err?.message})`);

const { error: t2Err } = await db
  .from("tasks")
  .insert({ owner_id: profile.id, title: "Standalone task", importance: 2, urgency: 1 });
assert(!t2Err, `create standalone task (${t2Err?.message})`);

const { data: rows, error: qErr } = await db
  .from("tasks")
  .select("*, goals(board_id)")
  .eq("owner_id", profile.id)
  .eq("status", "open");
assert(!qErr, `join query (${qErr?.message})`);
assert(rows.length === 2, `returns 2 open tasks (got ${rows.length})`);

const withGoal = rows.find((r) => r.title === "Task with goal");
const standalone = rows.find((r) => r.title === "Standalone task");
assert(withGoal.goals?.board_id === board.id, "task-with-goal resolves board_id via goals join");
assert(standalone.goals === null, "standalone task's goals join is null (-> board_id: null)");

// Cleanup
await db.from("tasks").delete().eq("owner_id", profile.id);
await db.from("goals").delete().eq("owner_id", profile.id);
await db.from("boards").delete().eq("owner_id", profile.id);
await db.from("profiles").delete().eq("id", profile.id);

console.log("\nAll matrix query tests passed.");
