// Test data for the UI check: one account that looks like a real, busy one
// (long quest titles, several boards, habits, due dates, import cards), with
// dates relative to now so "due soon" and "today" always mean something.
// Nothing here is the owner's real data.
import { randomUUID } from "node:crypto";

export const OWNER_ID = "00000000-0000-4000-8000-0000000000a1";
export const FRIEND_ID = "00000000-0000-4000-8000-0000000000b2";

const iso = (d) => d.toISOString();
const inHours = (h) => iso(new Date(Date.now() + h * 3600e3));
const day = (offset = 0) => new Date(Date.now() + offset * 86400e3).toISOString().slice(0, 10);

export function makeFixtures() {
  const board = (title, sort, extra = {}) => ({ id: randomUUID(), owner_id: OWNER_ID, title, sort_order: sort, ...extra });
  const boards = [
    board("Relational Leadership Academy", 0, { description: "Course work and readings" }),
    board("Errands", 1),
    board("Home & garden", 2),
    board("Online learning videos", 3),
  ];
  const [course, errands, home, videos] = boards;

  let sort = 0;
  const task = (title, extra = {}) => ({
    id: randomUUID(),
    owner_id: OWNER_ID,
    title,
    board_id: errands.id,
    xp_value: 20,
    importance: 3,
    urgency: 3,
    status: "open",
    sort_order: sort++,
    created_at: inHours(-48 - sort),
    ...extra,
  });
  const tasks = [
    task("Relational Leadership Academy: Level 2 — read chapter four and write the reflection", { board_id: course.id, due_at: inHours(30), is_manual_priority: true, importance: 5, estimate_minutes: 90, description: "Notes at https://example.com/reading" }),
    task("Pick up medication", { due_at: inHours(5), is_manual_priority: true, estimate_minutes: 20 }),
    task("Refill vitamin pill containers", { board_id: home.id, is_manual_priority: true, is_tiny: true }),
    task("AR class homework", { board_id: course.id, due_at: inHours(60), is_manual_priority: true }),
    task("Call the insurance company about the claim that has been waiting since September", { due_at: inHours(-20), importance: 4 }),
    task("Repot the fiddle-leaf fig", { board_id: home.id, due_at: inHours(100) }),
    task("Watch: Facing Fragility", { board_id: videos.id, description: "https://spiraljourneyworkthatreconnects.org/facing-fragility/" }),
    task("Supercalifragilisticexpialidocious-unbroken-long-word-to-test-wrapping", { board_id: home.id }),
    task("Sort the garage shelves", { board_id: home.id, in_additional: true }),
    task("Plan the weekend trip", { in_additional: true, due_at: inHours(170) }),
    task("Finished: return library books", { status: "completed", completed_at: inHours(-3), xp_awarded: 20 }),
  ];
  const [reading] = tasks;
  // A quest waiting behind another (a sequence): hidden until the reading is done.
  tasks.push(task("Post the reflection link in the course chat", { board_id: course.id, locked_by_task_id: reading.id }));
  const steps = ["Skim the chapter", "Highlight three ideas", "Write one page", "Post it in the forum"].map((title, i) => ({
    id: randomUUID(), owner_id: OWNER_ID, task_id: reading.id, title, sort_order: i, done: i === 0, done_at: i === 0 ? inHours(-2) : null,
  }));

  const rite = (title, slot, extra = {}) => ({ id: randomUUID(), owner_id: OWNER_ID, title, slot, sort_order: sort++, xp_value: 5, ...extra });
  const rites = [
    rite("Gym 🏋️", "day", { kind: "habit", estimate_minutes: 60, due_time: "07:00", window_to: "10:00" }),
    rite("20 mins of house cleaning", "day", { kind: "habit" }),
    rite("Walk Chester 🐶", "day", { kind: "habit" }),
    rite("Learn a language 🗣", "day", { kind: "habit" }),
    rite("Vitamins before 12pm", "day", { kind: "habit", steps: [{ id: "s1", title: "Vitamins" }, { id: "s2", title: "B12" }, { id: "s3", title: "D3" }] }),
    rite("Brush and floss", "evening"),
    rite("Lay out tomorrow's clothes", "evening"),
  ];

  const rewards = [
    { id: randomUUID(), owner_id: OWNER_ID, title: "A slow morning at the café", cost_coins: 3, sort_order: 0 },
    { id: randomUUID(), owner_id: OWNER_ID, title: "New sketchbook", cost_coins: 8, sort_order: 1 },
  ];

  const card = (title, kind, extra = {}) => ({ id: randomUUID(), owner_id: OWNER_ID, title, kind, status: "new", sort: sort++, source_label: "Notes", ...extra });
  const import_cards = [
    card("Claim unclaimed money from the state treasurer", "quest", { description: "Form is in the files.", steps: ["Find the claim number", "Fill in the form", "Mail it"], board_hint: "Errands" }),
    card("Apply for subway performer permit", "schedule", { plan_within_days: 14 }),
    card("Stretch every morning", "habit", { repeat: "daily", minutes: 10 }),
    card("Groceries: oat milk, lentils, lemons, rice, tea", "shopping", { steps: ["Oat milk", "Lentils", "Lemons", "Rice", "Tea"] }),
    card("Couples covenant", "ritual"),
    card("A long weekend away somewhere with a lake and no phone signal at all", "reward"),
  ];

  const check_ins = [
    { owner_id: OWNER_ID, metric: "Energy", level: 6, created_at: inHours(-26) },
    { owner_id: OWNER_ID, metric: "Mood", level: 7, created_at: inHours(-26) },
    { owner_id: OWNER_ID, metric: "Sleep quality", level: 6, created_at: inHours(-30) },
    { owner_id: OWNER_ID, metric: "Energy", level: 5, created_at: inHours(-50) },
  ].map((r) => ({ id: randomUUID(), ...r }));

  const xp_events = [
    { owner_id: OWNER_ID, kind: "task", amount: 20, created_at: inHours(-3) },
    { owner_id: OWNER_ID, kind: "check_in", amount: 5, created_at: inHours(-27) },
  ].map((r) => ({ id: randomUUID(), ...r }));

  return {
    profiles: [
      {
        id: OWNER_ID,
        google_sub: "ui-check-owner",
        email: "ui-check@example.com",
        name: "Robin Tester",
        theme: "adventure",
        total_xp: 1371,
        coins: 12,
        streak_count: 4,
        is_admin: true,
        last_check_in_at: inHours(-26),
        life_wheel: {
          cleaning: {
            spaces: [
              { id: "kitchen", name: "Kitchen", mess: 7 },
              { id: "living", name: "Living room", mess: 4 },
              { id: "bath", name: "Bathroom", mess: 2 },
            ],
          },
          rituals: [{ id: "r1", name: "Couples covenant", done: [day(-12), day(-40)] }],
        },
      },
      { id: FRIEND_ID, google_sub: "ui-check-friend", email: "friend@example.com", name: "Sam Friend", theme: "calm" },
    ],
    friendships: [{ id: randomUUID(), requester_id: OWNER_ID, addressee_id: FRIEND_ID, status: "accepted" }],
    boards,
    tasks,
    quest_steps: steps,
    rites,
    rewards,
    import_cards,
    check_ins,
    xp_events,
    app_defaults: [],
  };
}
