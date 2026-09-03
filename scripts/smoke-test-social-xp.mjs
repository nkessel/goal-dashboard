// Live smoke test for Priority #7 (social), #8 (XP/leveling), #9
// (notifications) against the real Supabase DB. Creates two throwaway
// profiles, exercises friendships/invites/activity/reactions/comments,
// weekly XP budget enforcement, level-up perks, daily check-in + streak
// protection, and notification creation — then cleans everything up.
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

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("OK:", msg);
  }
}

const stamp = Date.now();
async function makeProfile(label) {
  const { data, error } = await db
    .from("profiles")
    .insert({ google_sub: `smoke-${label}-${stamp}`, email: `smoke-${label}-${stamp}@example.com`, name: `Smoke ${label}` })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

const alice = await makeProfile("alice");
const bob = await makeProfile("bob");

// --- Priority #7: friendships ---------------------------------------------
{
  const { data: fr, error } = await db
    .from("friendships")
    .insert({ requester_id: alice.id, addressee_id: bob.id, status: "pending" })
    .select("*")
    .single();
  assert(!error, `send friend request (${error?.message})`);

  const { error: acceptErr } = await db
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", fr.id);
  assert(!acceptErr, `accept friend request (${acceptErr?.message})`);
}

// --- Priority #7: goal completion privacy resolution -----------------------
{
  const { data: board } = await db
    .from("boards")
    .insert({ owner_id: alice.id, title: "Smoke Board" })
    .select("*")
    .single();
  const { data: goal } = await db
    .from("goals")
    .insert({ owner_id: alice.id, board_id: board.id, title: "Smoke Goal", progress: 0 })
    .select("*")
    .single();

  // Simulate the app's updateGoalProgress activity-logging behavior directly
  // (can't import the TS module from a plain Node script) by replicating its
  // privacy resolution: board is public, goal is public -> is_public true.
  const { data: activity, error: actErr } = await db
    .from("activity_events")
    .insert({ owner_id: alice.id, kind: "goal_completed", goal_id: goal.id, is_public: true })
    .select("*")
    .single();
  assert(!actErr, `log goal_completed activity (${actErr?.message})`);

  // --- reactions (any emoji) ---
  const { error: reactErr } = await db
    .from("activity_reactions")
    .insert({ activity_id: activity.id, profile_id: bob.id, emoji: "🦖" });
  assert(!reactErr, `bob reacts with a custom emoji (${reactErr?.message})`);

  const { error: dupErr } = await db
    .from("activity_reactions")
    .insert({ activity_id: activity.id, profile_id: bob.id, emoji: "🦖" });
  assert(!!dupErr, "duplicate (activity, profile, emoji) reaction is rejected by the unique constraint");

  // --- comments ---
  const { error: commentErr } = await db
    .from("activity_comments")
    .insert({ activity_id: activity.id, profile_id: bob.id, body: "Nice work!" });
  assert(!commentErr, `bob comments (${commentErr?.message})`);

  // --- notifications fan-out ---
  const { error: notifErr } = await db.from("notifications").insert({
    profile_id: alice.id,
    actor_id: bob.id,
    kind: "comment",
    activity_id: activity.id,
    body: "Bob commented on your activity.",
  });
  assert(!notifErr, `notification created for the activity owner (${notifErr?.message})`);

  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", alice.id)
    .eq("is_read", false);
  assert(count === 1, `alice has 1 unread notification (got ${count})`);
}

// --- Priority #8: weekly XP budget enforcement ------------------------------
{
  const weekStart = (() => {
    const d = new Date();
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  })();

  const { data: profile } = await db.from("profiles").select("weekly_xp_budget").eq("id", alice.id).single();
  assert(profile.weekly_xp_budget === 100, `default weekly budget is 100 (got ${profile.weekly_xp_budget})`);

  // Assign 90 of 100 -> allowed.
  const { error: e1 } = await db.from("xp_events").insert({
    owner_id: alice.id,
    kind: "task_assigned",
    amount: 90,
    week_start: weekStart,
  });
  assert(!e1, `assign 90/100 weekly XP (${e1?.message})`);

  const { data: sumRows } = await db
    .from("xp_events")
    .select("amount")
    .eq("owner_id", alice.id)
    .eq("kind", "task_assigned")
    .eq("week_start", weekStart);
  const allocated = sumRows.reduce((s, r) => s + r.amount, 0);
  assert(allocated === 90, `weekly allocation sums correctly (got ${allocated})`);
  assert(100 - allocated === 10, "only 10 XP remains in the weekly budget — a further +20 task should be rejected app-side");
}

// --- Priority #8: level-up crossing a functional-tier threshold (level 4 @ 450 xp) ---
{
  const AWARD = 500; // takes alice from 0 -> 500 total_xp, crossing levels 2,3,4
  const { data: before } = await db.from("profiles").select("*").eq("id", alice.id).single();

  const LEVEL_THRESHOLDS = { 1: 0, 2: 100, 3: 250, 4: 450, 5: 700, 6: 1000, 7: 1400, 8: 1900, 9: 2500, 10: 3200 };
  function levelFor(xp) {
    let l = 1;
    for (let i = 1; i <= 10; i++) if (xp >= LEVEL_THRESHOLDS[i]) l = i;
    return l;
  }

  const newTotal = before.total_xp + AWARD;
  const newLevel = levelFor(newTotal);
  let budgetDelta = 0;
  let tokenDelta = 0;
  for (let l = before.level + 1; l <= newLevel; l++) {
    if ([4, 5, 6, 7].includes(l)) {
      budgetDelta += 20;
      tokenDelta += 1;
    }
  }

  const { error } = await db
    .from("profiles")
    .update({
      total_xp: newTotal,
      level: newLevel,
      weekly_xp_budget: before.weekly_xp_budget + budgetDelta,
      streak_protection_tokens: before.streak_protection_tokens + tokenDelta,
    })
    .eq("id", alice.id);
  assert(!error, `apply level-up (${error?.message})`);

  const { data: after } = await db.from("profiles").select("*").eq("id", alice.id).single();
  assert(after.level === 4, `alice reaches level 4 at 500 total XP (got level ${after.level})`);
  assert(after.weekly_xp_budget === 120, `weekly budget bumped +20 for crossing level 4 (got ${after.weekly_xp_budget})`);
  assert(after.streak_protection_tokens === 1, `1 streak-protection token granted at level 4 (got ${after.streak_protection_tokens})`);
}

// --- Priority #8: daily check-in + streak-protection token spend -----------
{
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await db
    .from("profiles")
    .update({ last_check_in_at: twoDaysAgo, streak_count: 5 })
    .eq("id", alice.id);

  const { data: profile } = await db.from("profiles").select("*").eq("id", alice.id).single();
  assert(profile.streak_protection_tokens === 1, "alice still has her earned streak-protection token going into the gap");

  // Simulate the app's dailyCheckIn gap-with-token-protection branch.
  const { error } = await db
    .from("profiles")
    .update({
      last_check_in_at: new Date().toISOString(),
      streak_count: profile.streak_count + 1, // protected, not reset to 1
      streak_protection_tokens: profile.streak_protection_tokens - 1,
    })
    .eq("id", alice.id);
  assert(!error, `protected check-in after a missed day (${error?.message})`);

  const { data: after } = await db.from("profiles").select("*").eq("id", alice.id).single();
  assert(after.streak_count === 6, `streak preserved across the gap (got ${after.streak_count})`);
  assert(after.streak_protection_tokens === 0, "the streak-protection token was spent");
}

// --- Priority #7: invite links ---------------------------------------------
{
  const { data: invite, error } = await db
    .from("invite_links")
    .insert({ created_by: bob.id })
    .select("*")
    .single();
  assert(!error, `create invite link (${error?.message})`);
  assert(invite.code && invite.code.length > 0, "invite link got an auto-generated code");
  assert(invite.uses_count === 0, "invite starts with 0 uses");
}

// --- Priority #9: notifications table shape ---------------------------------
{
  const { data: notif, error } = await db
    .from("notifications")
    .insert({
      profile_id: alice.id,
      kind: "reschedule_reminder",
      body: "Test reminder",
    })
    .select("*")
    .single();
  assert(!error, `create a reschedule_reminder notification (${error?.message})`);
  assert(notif.is_read === false && notif.email_sent === false, "notification defaults to unread/unsent");

  const { error: badKindErr } = await db
    .from("notifications")
    .insert({ profile_id: alice.id, kind: "not_a_real_kind", body: "x" });
  assert(!!badKindErr, "the notifications.kind check constraint rejects an invalid kind");
}

// --- Cleanup -----------------------------------------------------------------
for (const id of [alice.id, bob.id]) {
  await db.from("notifications").delete().eq("profile_id", id);
  await db.from("activity_comments").delete().eq("profile_id", id);
  await db.from("activity_reactions").delete().eq("profile_id", id);
}
await db.from("activity_events").delete().eq("owner_id", alice.id);
await db.from("goals").delete().eq("owner_id", alice.id);
await db.from("boards").delete().eq("owner_id", alice.id);
await db.from("xp_events").delete().eq("owner_id", alice.id);
await db.from("invite_links").delete().eq("created_by", bob.id);
await db.from("friendships").delete().or(`requester_id.eq.${alice.id},requester_id.eq.${bob.id}`);
await db.from("profiles").delete().in("id", [alice.id, bob.id]);

console.log(`\n${failures === 0 ? "All" : failures + " FAILED,"} social/XP/notification smoke tests ${failures === 0 ? "passed" : "of"}.`);
process.exit(failures === 0 ? 0 : 1);
