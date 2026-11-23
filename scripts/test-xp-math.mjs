// Checks for the XP and coin math: what completing, progressing, ticking sub-quests, editing XP, deleting and
// undoing pay, and that undo gives back exactly what was paid. Runs the real server code (src/lib/data/quest-ops.ts,
// xp.ts, stats.ts) against the UI check's in-memory fake database, so nothing real is touched. Run with:
//   node scripts/test-xp-math.mjs
process.env.TZ = "UTC";
import { register } from "node:module";

// The offline queue (src/lib/offline.ts) calls server actions; here they are fakes the checks drive.
const fakeActions = `
const f = (name) => (...a) => globalThis.__actions[name](...a);
export const addJournalEntryAction = f("other"), completeRiteAction = f("other"), createQuestAction = f("other"),
  logEventAction = f("other"), makeRefillQuestAction = f("other"), saveCheckInAction = f("other"), saveInventoryAction = f("other"),
  saveNightAction = f("other"), savePackingListsAction = f("other"), saveQuestStepsAction = f("other"), setTaskPlacementAction = f("other"),
  setTaskTagsAction = f("other"), tickRiteStepAction = f("other"), uncompleteRiteAction = f("other"), updateTaskAction = f("other"),
  completeTaskAction = f("completeTaskAction"), reopenTaskAction = f("reopenTaskAction");`;
const dataUrl = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
register("./ts-hooks.mjs", import.meta.url, {
  data: {
    stubs: {
      "@/app/actions": dataUrl(fakeActions),
      "@/lib/optimistic-quests": dataUrl("export function resolveOptimisticQuest() {}"),
      "@/components/xp/save-night": dataUrl("export function saveNightToo() {}"),
    },
  },
});

const { startFakeDb } = await import("./ui-check/fake-db.mjs");
const PORT = 54393;
const fake = await startFakeDb({ port: PORT, fixtures: {} });
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${PORT}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";

const ops = await import("../src/lib/data/quest-ops.ts");
const tasksData = await import("../src/lib/data/tasks.ts");
const { coinsForXp, XP_PER_COIN } = await import("../src/lib/coins.ts");
const { eventQuestXp } = await import("../src/lib/event-quest-xp.ts");
const { normalizeSplit, setShare, statShare } = await import("../src/lib/stats.ts");
const { earlyBirdBonus, earlyBirdCoins } = await import("../src/lib/next-action.ts");
const { stepWeights, stepsShare } = await import("../src/lib/quest-steps.ts");
const { computeLevelForXp } = await import("../src/lib/levels.ts");

let bad = 0;
let good = 0;
function eq(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? good++ : bad++;
  console.log(ok ? "OK:" : "FAIL:", msg, ok ? "" : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`);
}

// ---------------------------------------------------------------- pure rules
eq(XP_PER_COIN, 30, "a coin per 30 XP");
eq([0, 29, 30, 59, 60, 89, -40].map(coinsForXp), [0, 0, 1, 1, 2, 2, 0], "coinsForXp rounds down, never negative");
eq([0, 10, 30, 45, 60, 90, 120, 480, 900].map(eventQuestXp), [5, 5, 15, 25, 30, 45, 60, 240, 240], "event quest XP: 15 per half hour, to the nearest 5, at least 5, at most 240");
eq(normalizeSplit({ Strength: 70, Wisdom: 50, Bad: 0, Neg: -5 }), { Strength: 60, Wisdom: 40 }, "a stat split over 100% is trimmed evenly to 100");
eq(setShare({ Strength: 60, Wisdom: 40 }, "Charisma", 30, ["Strength", "Wisdom"]), { Strength: 60, Wisdom: 10, Charisma: 30 }, "a new share takes from the stat picked last");
eq([statShare(10, 33), statShare(-10, 33)], [3, -3], "a stat's share rounds toward zero, so a reversal mirrors it");
{
  const now = Date.parse("2026-11-18T12:00:00Z");
  const inDays = (d) => new Date(now + d * 86_400_000).toISOString();
  eq(earlyBirdBonus({ xp_value: 40, due_at: inDays(3) }, now), 20, "automatic early bird: half the XP, 2+ days early");
  eq(earlyBirdBonus({ xp_value: 4, due_at: inDays(3) }, now), 5, "automatic early bird is at least 5");
  eq(earlyBirdBonus({ xp_value: 40, due_at: inDays(1.5) }, now), 0, "no automatic early bird under 2 days early");
  eq(earlyBirdBonus({ xp_value: 40, due_at: inDays(3.5), early_bonus_xp: 10, early_bonus_per_day: 2 }, now), 16, "own early bonus: its XP plus per full day early");
  eq(earlyBirdBonus({ xp_value: 40, due_at: inDays(-1), early_bonus_xp: 10 }, now), 0, "own early bonus: none once it's due");
  eq(earlyBirdCoins({ xp_value: 40, due_at: inDays(2), early_bonus_xp: 10, early_bonus_coins: 3 }, now), 3, "own early bonus coins");
  eq(earlyBirdCoins({ xp_value: 40, due_at: inDays(5) }, now), 0, "no early coins with the automatic bonus");
}
{
  const steps = [{ key: "a", title: "a", done: true }, { key: "b", title: "b", done: false }, { key: "c", title: "c", done: false, weight: 50 }];
  eq(Math.round(stepWeights(steps).reduce((a, b) => a + b, 0) * 100), 100, "sub-quest shares add up to the whole quest");
  eq(stepsShare(steps), 25, "a free sub-quest takes an equal part of what the set shares leave");
  eq(stepsShare([...steps.slice(0, 2), { ...steps[2], state: "skipped" }]), 50, "a skipped sub-quest's share goes to the others");
  const nested = [{ key: "p", title: "p", done: false }, { key: "k1", title: "k1", done: true, parentKey: "p" }, { key: "k2", title: "k2", done: false, parentKey: "p" }];
  eq(stepsShare(nested), 50, "a sub-quest holding others counts through them");
}
eq([0, 749, 750, 1500, 3000, 20000, 999999].map(computeLevelForXp), [1, 1, 2, 3, 4, 10, 10], "levels from XP");

// ---------------------------------------------------------------- the fake database
let n = 0;
const uid = (p) => `${p}-${String(++n).padStart(4, "0")}-0000-0000-000000000000`.slice(0, 36);
const row = (table, id) => fake.tables[table].find((r) => r.id === id);
const rows = (table, f) => (fake.tables[table] ?? []).filter(f);
async function insert(table, r) {
  const res = await fetch(`http://127.0.0.1:${PORT}/rest/v1/${table}`, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation", apikey: "test", Authorization: "Bearer test" }, body: JSON.stringify(r) });
  if (!res.ok) throw new Error(`insert ${table}: ${res.status} ${await res.text()}`);
  return (await res.json())[0];
}
/** A fresh account with some coins in hand (so a wrong take-back shows, instead of stopping at 0). */
async function account(extra = {}) {
  const id = uid("aaaaaaaa");
  await insert("profiles", { id, google_sub: id, email: `${id}@example.com`, name: "Test", total_xp: 0, level: 1, coins: 10, streak_protection_tokens: 0, hp: null, ...extra });
  return id;
}
async function quest(owner, fields) {
  const id = uid("bbbbbbbb");
  await insert("tasks", { id, owner_id: owner, title: "Quest", status: "open", importance: 3, urgency: 3, xp_value: 30, xp_awarded: 0, progress: 0, ...fields });
  return id;
}
const wallet = (owner) => {
  const p = row("profiles", owner);
  const stats = p.stat_xp ?? {};
  return { xp: p.total_xp, coins: p.coins, stats: Object.fromEntries(Object.entries(stats).filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b))) };
};
const START = { xp: 0, coins: 10, stats: {} };

// 1. One quest, done and undone.
{
  const me = await account();
  const t = await quest(me, { xp_value: 60 });
  const r = await ops.finishTaskForOwner(me, t);
  eq([r.totalXp, r.coinsEarned, wallet(me)], [60, 2, { xp: 60, coins: 12, stats: {} }], "complete: the quest's XP, a coin per 30");
  eq(rows("xp_events", (e) => e.task_id === t).map((e) => e.amount), [60], "complete: one XP event");
  await ops.finishTaskForOwner(me, t);
  eq(wallet(me).xp, 60, "a second complete pays nothing");
  await ops.reopenTaskForOwner(me, t);
  eq([wallet(me), row("tasks", t).status], [START, "open"], "undo: exactly what it paid comes back out");
  await ops.reopenTaskForOwner(me, t);
  eq(wallet(me), START, "a second undo takes nothing more");
}

// 1b. A quest that crosses a level, undone: the level goes back too.
{
  const me = await account({ total_xp: 740 });
  const t = await quest(me, { xp_value: 30 });
  await ops.finishTaskForOwner(me, t);
  eq([row("profiles", me).total_xp, row("profiles", me).level], [770, 2], "a quest that crosses 750 XP reaches level 2");
  await ops.reopenTaskForOwner(me, t);
  eq([row("profiles", me).total_xp, row("profiles", me).level], [740, 1], "undo puts the level back");
}

// 2. Two saves at once (a tap and a queued save, or two undo taps): it pays once and is taken back once.
{
  const me = await account();
  const t = await quest(me, { xp_value: 60 });
  await Promise.all([ops.finishTaskForOwner(me, t), ops.finishTaskForOwner(me, t)]);
  eq(wallet(me), { xp: 60, coins: 12, stats: {} }, "two completes at once pay once");
  await Promise.all([ops.reopenTaskForOwner(me, t), ops.reopenTaskForOwner(me, t)]);
  eq(wallet(me), START, "two undos at once take it back once");
}

// 3. Paid in parts (progress, then the rest): the same coins as at once, and undo gives back exactly that.
{
  const me = await account();
  const t = await quest(me, { xp_value: 50 });
  const p = await ops.setTaskProgressForOwner(me, t, 50);
  eq([p.xpEarned, p.coinsEarned], [25, 0], "progress 50% pays half the XP");
  await ops.finishTaskForOwner(me, t);
  eq(wallet(me), { xp: 50, coins: 11, stats: {} }, "finishing pays the rest, coins on the whole (50 XP = 1 coin)");
  await ops.reopenTaskForOwner(me, t);
  eq([wallet(me), row("tasks", t).xp_awarded, row("tasks", t).progress], [START, 0, 0], "undo after progress: XP and coins back exactly, progress starts over");
}
{
  const me = await account();
  const t = await quest(me, { xp_value: 90 });
  for (const pct of [20, 40, 70, 30, 100]) await ops.setTaskProgressForOwner(me, t, pct);
  eq(wallet(me), { xp: 90, coins: 13, stats: {} }, "progress up and down in steps ends at the quest's own XP and coins");
  await ops.setTaskProgressForOwner(me, t, 0);
  eq(wallet(me), START, "progress back to 0 takes it all back");
}

// 4. Stat splits: the stats and the level meter together hold the quest's XP, in parts or at once, and undo clears both.
{
  const me = await account();
  const t = await quest(me, { xp_value: 10, stat_split: { Strength: 33 } });
  await ops.setTaskProgressForOwner(me, t, 50);
  await ops.finishTaskForOwner(me, t);
  eq(wallet(me), { xp: 7, coins: 10, stats: { Strength: 3 } }, "a 33% split of 10 XP: 3 to Strength, 7 to the level meter (same as at once)");
  await ops.reopenTaskForOwner(me, t);
  eq(wallet(me), START, "undo takes back each stat's part and the meter's exactly");
}

// 5. Early bird: paid on completion and taken back on undo, automatic or the quest's own.
{
  const me = await account();
  const t = await quest(me, { xp_value: 40, due_at: new Date(Date.now() + 5 * 86_400_000).toISOString() });
  const r = await ops.finishTaskForOwner(me, t);
  eq([r.earlyBird, wallet(me)], [20, { xp: 60, coins: 11, stats: {} }], "done 5 days early: +20 XP early bird");
  await ops.reopenTaskForOwner(me, t);
  eq(wallet(me), START, "undo takes the early bird back too");
  await ops.finishTaskForOwner(me, t);
  await ops.reopenTaskForOwner(me, t);
  eq(wallet(me), START, "complete and undo again: nothing gained (no farming)");
}
{
  const me = await account();
  const t = await quest(me, { xp_value: 30, due_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), early_bonus_xp: 10, early_bonus_coins: 3, early_bonus_per_day: 0 });
  await ops.finishTaskForOwner(me, t);
  eq(wallet(me), { xp: 40, coins: 14, stats: {} }, "own early bonus: +10 XP and +3 coins");
  await ops.reopenTaskForOwner(me, t);
  eq(wallet(me), START, "undo takes the own early bonus's XP and coins back");
}

// 6. A custom coin value, a reward's bonus coins.
{
  const me = await account();
  const t = await quest(me, { xp_value: 60, coin_value: 5 });
  await ops.finishTaskForOwner(me, t);
  eq(wallet(me).coins, 15, "a quest with its own coin value pays exactly that");
  await ops.reopenTaskForOwner(me, t);
  eq(wallet(me), START, "undo takes the custom coins back");
}
{
  const me = await account();
  const rw = uid("cccccccc");
  await insert("rewards", { id: rw, owner_id: me, title: "Treat", status: "claimed", bonus_coins: 4 });
  const t = await quest(me, { xp_value: 30, reward_id: rw });
  const r = await ops.finishTaskForOwner(me, t);
  eq([r.rewardCompleted, wallet(me).coins, row("rewards", rw).status], [true, 15, "completed"], "a reward's quest completes the reward and pays its bonus coins");
  await ops.reopenTaskForOwner(me, t);
  eq([wallet(me), row("rewards", rw).status], [START, "claimed"], "undo puts the reward back and takes its bonus coins");
}

// 7. A failed quest pays nothing; finished after all, it pays, and undo takes that back.
{
  const me = await account();
  const t = await quest(me, { xp_value: 30 });
  await tasksData.failTask(t, me, "no");
  await ops.reopenTaskForOwner(me, t);
  eq([wallet(me), row("tasks", t).status], [START, "open"], "undoing a failure changes no XP");
  await tasksData.failTask(t, me, "no");
  await ops.finishTaskForOwner(me, t);
  eq([wallet(me).xp, row("tasks", t).failed_at], [30, null], "a failed quest finished after all pays and is no longer failed");
  await ops.reopenTaskForOwner(me, t);
  eq(wallet(me), START, "and undoing that takes its XP back");
}

// 8. Editing a finished quest's XP, then undo.
{
  const me = await account();
  const t = await quest(me, { xp_value: 20 });
  await ops.finishTaskForOwner(me, t);
  await tasksData.setTaskPayout(t, me, {});
  await ops.adjustXpForEditForOwner(me, t, 40);
  await fetch(`http://127.0.0.1:${PORT}/rest/v1/tasks?id=eq.${t}`, { method: "PATCH", headers: { "Content-Type": "application/json", apikey: "test" }, body: JSON.stringify({ xp_value: 40 }) });
  eq(wallet(me), { xp: 40, coins: 11, stats: {} }, "raising a finished quest's XP pays the difference (40 XP = 1 coin)");
  await ops.reopenTaskForOwner(me, t);
  eq(wallet(me), START, "undo after the edit takes back exactly what was paid");
}

// 9. Sub-quests with their own XP and coins.
{
  const me = await account();
  const t = await quest(me, { xp_value: 30 });
  const mk = (done, extra = {}) => [{ key: "a", title: "A", done: done[0], xp: 20, ...extra }, { key: "b", title: "B", done: done[1], xp: 20, coins: 1 }];
  let res = await ops.saveQuestStepsForOwner(me, t, mk([false, false]));
  const ids = res.steps.map((s) => s.id);
  const withIds = (done) => mk(done).map((s, i) => ({ ...s, id: ids[i] }));
  await ops.saveQuestStepsForOwner(me, t, withIds([true, false]));
  res = await ops.saveQuestStepsForOwner(me, t, withIds([true, true]));
  eq(wallet(me), { xp: 40, coins: 12, stats: {} }, "two 20-XP sub-quests ticked one by one: 40 XP, 1 coin for it, plus B's own coin");
  await ops.saveQuestStepsForOwner(me, t, withIds([false, false]));
  eq(wallet(me), START, "unticking both at once gives back exactly that");
  await ops.saveQuestStepsForOwner(me, t, withIds([true, true]));
  await ops.saveQuestStepsForOwner(me, t, [withIds([true, true])[1]]);
  eq(wallet(me), { xp: 20, coins: 11, stats: {} }, "removing a ticked sub-quest takes back what it paid");
  await ops.saveQuestStepsForOwner(me, t, []);
  eq(wallet(me), START, "removing the rest takes back the rest");
}
{
  const me = await account();
  const t = await quest(me, { xp_value: 30, stat_split: { Wisdom: 50 } });
  const res = await ops.saveQuestStepsForOwner(me, t, [{ key: "a", title: "A", done: true, xp: 15, statSplit: { Strength: 100 } }, { key: "b", title: "B", done: true, xp: 15 }]);
  eq(wallet(me), { xp: 8, coins: 11, stats: { Strength: 15, Wisdom: 7 } }, "a sub-quest's own split sends its XP there; the others follow the quest's split");
  await ops.saveQuestStepsForOwner(me, t, res.steps.map((s) => ({ key: s.id, id: s.id, title: s.title, done: false, xp: s.xp })));
  eq(wallet(me), START, "unticking them takes each stat's part back");
}

// 10. Deleting a finished quest takes back everything it paid.
{
  const me = await account();
  const t = await quest(me, { xp_value: 40, coin_value: 3, due_at: new Date(Date.now() + 5 * 86_400_000).toISOString() });
  await ops.finishTaskForOwner(me, t);
  await ops.deleteTaskForOwner(me, t);
  eq([wallet(me), row("tasks", t)], [START, undefined], "delete a finished quest: XP, early bird and custom coins back out");
}

// 11. A stand-in quest: its check finishes the board's assignment; undo on the stand-in reopens that assignment.
{
  const me = await account();
  const board = uid("dddddddd");
  await insert("boards", { id: board, owner_id: me, title: "Class" });
  const hw = await quest(me, { xp_value: 30, board_id: board, due_at: new Date(Date.now() + 86_400_000).toISOString() });
  const stand = await quest(me, { xp_value: 10, stands_for: board });
  await ops.finishTaskForOwner(me, stand);
  eq([row("tasks", hw).status, row("tasks", stand).status, wallet(me).xp], ["completed", "open", 30], "checking a stand-in finishes its assignment");
  await ops.reopenTaskForOwner(me, stand);
  eq([row("tasks", hw).status, wallet(me)], ["open", START], "undo on the stand-in reopens the assignment and takes its XP back");
}

// 12. Habits: done and undone, and done in part.
{
  const me = await account();
  const rite = uid("eeeeeeee");
  await insert("rites", { id: rite, owner_id: me, title: "Walk", xp_value: 45, coin_value: 4 });
  const r = await ops.completeRiteForOwner(me, rite, "2026-11-18");
  eq([r.xp, wallet(me)], [45, { xp: 45, coins: 14, stats: {} }], "a habit pays its XP and its own coin value");
  await ops.uncompleteRiteForOwner(me, rite, "2026-11-18");
  eq(wallet(me), START, "undoing a habit takes both back");
  await ops.completeRiteForOwner(me, rite, "2026-11-18", 50);
  eq(wallet(me), { xp: 23, coins: 10, stats: {} }, "a habit done in part pays its share, automatic coins only");
  await ops.uncompleteRiteForOwner(me, rite, "2026-11-18");
  eq(wallet(me), START, "and undoing that takes it back");
}

fake.close();

// ---------------------------------------------------------------- the offline queue and Undo
{
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, dispatchEvent() {}, location: { reload() {} } };
  globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  let online = true;
  Object.defineProperty(globalThis.navigator, "onLine", { get: () => online, configurable: true });
  const calls = [];
  const later = (ms, fn) => new Promise((res, rej) => setTimeout(() => { try { res(fn()); } catch (e) { rej(e); } }, ms));
  let completeBehaviour = () => ({ totalXp: 30, coinsEarned: 1 });
  globalThis.__actions = {
    other: async () => null,
    completeTaskAction: (fd) => (calls.push(["complete", fd.get("taskId")]), later(30, completeBehaviour)),
    reopenTaskAction: (id) => (calls.push(["reopen", id]), later(5, () => undefined)),
  };
  const off = await import("../src/lib/offline.ts");
  off.setOfflineOwner("me");
  const waiting = () => JSON.parse(globalThis.window.localStorage.getItem("offline-queue-v1") ?? "[]").map((o) => `${o.kind}:${o.args.id}`);

  // a. The completion's save loses the connection while Undo is pressed: Undo drops it, so it never lands later.
  completeBehaviour = () => {
    throw new TypeError("Failed to fetch");
  };
  const req = off.saveOrQueue("completeQuest", { id: "q1", at: new Date().toISOString() });
  const onlyHere = await off.settleCompletion("q1");
  await req;
  eq([onlyHere, waiting()], [true, []], "Undo while the completion's connection drops: the waiting completion is dropped");

  // b. A queued completion is being sent when Undo is pressed: Undo waits for it, then the reopen goes to the server.
  online = false;
  await off.saveOrQueue("completeQuest", { id: "q2", at: new Date().toISOString() });
  eq(waiting(), ["completeQuest:q2"], "offline: the completion waits in the queue");
  online = true;
  completeBehaviour = () => ({ totalXp: 30, coinsEarned: 1 });
  calls.length = 0;
  const flushing = off.flushOffline();
  await new Promise((r) => setTimeout(r, 5));
  const onlyHere2 = await off.settleCompletion("q2");
  await flushing;
  eq([onlyHere2, calls], [false, [["complete", "q2"]]], "Undo during the send waits for it to land (so the server is told to reopen it)");

  // c. Undo offline, for a completion the server already has: it waits in the queue and is sent once back online.
  online = false;
  const u = await off.saveOrQueue("reopenQuest", { id: "q3" });
  eq([u.queued, waiting()], [true, ["reopenQuest:q3"]], "Undo offline waits in the queue");
  online = true;
  calls.length = 0;
  await off.flushOffline();
  eq([calls, waiting()], [[["reopen", "q3"]], []], "and is sent once back online");
}

console.log(`\n${good} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
