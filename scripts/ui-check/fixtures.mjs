// Test data for the UI check: one account that looks like a real, busy one
// (long quest titles, several boards, habits, due dates, import cards), with
// dates relative to now so "due soon" and "today" always mean something.
// Nothing here is the owner's real data.
import { newId as randomUUID } from "./ids.mjs";

export const OWNER_ID = "00000000-0000-4000-8000-0000000000a1";
export const FRIEND_ID = "00000000-0000-4000-8000-0000000000b2";
/** The Listening list board (fixed, so the listen flow can open it). */
export const LISTEN_BOARD_ID = "00000000-0000-4000-8000-00000000115e";

const iso = (d) => d.toISOString();
const inHours = (h) => iso(new Date(Date.now() + h * 3600e3));
const day = (offset = 0) => new Date(Date.now() + offset * 86400e3).toISOString().slice(0, 10);

const dec22 = () => {
  // About a month out, so the band always counts down.
  const d = new Date(Date.now() + 31 * 86400e3);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23)).toISOString();
};
const li = (title, extra = {}) => ({ id: Math.abs([...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36), title, ...extra });

/** The Listening list's rows, and the course board's weeks. */
function listenRows(boardId, mfsId, task) {
  const due = dec22();
  const weeks = ["Setting the Stage", "Core Concepts", "Inner Work", "The Steps of Facilitation", "Holding the Group", "Creating Clear Containers"];
  return [
    ...weeks.map((w, i) => task(`Week ${String(i + 1).padStart(2, "0")} · ${w}`, { board_id: mfsId, in_additional: false, xp_value: 15, ...(i === 5 ? { status: "completed", completed_at: new Date(Date.now() - 5 * 86400e3).toISOString() } : {}) })),
    task("Mastering Facilitation Skills", { board_id: boardId, due_at: due, in_additional: false, listen: { kind: "course", source: "Authentic Revolution", lessonsBoard: mfsId } }),
    task("Podcasts", { board_id: boardId, in_additional: false, listen: { kind: "app", app: "podcasts", source: "Apple Podcasts", items: [li("Planetary Roar", { url: "https://podcasts.apple.com/us/podcast/planetary-roar/id1" }), li("Building Love That Lasts: Study Group (1-100)")] } }),
    task("The Authentic Life Course", { board_id: boardId, due_at: due, in_additional: false, listen: { kind: "course", source: "Authentic Revolution", items: [li("Week 01 · The Authentic You", { done: true }), li("Week 02 · Personal Values"), li("Week 03 · Get Feedback")] } }),
    task("Stop Being So Nice (webinar replay)", { board_id: boardId, due_at: due, in_additional: false, xp_value: 20, listen: { kind: "item", source: "Authentic Revolution" } }),
    task("YouTube", { board_id: boardId, in_additional: false, listen: { kind: "app", app: "youtube", source: "YouTube", items: [li("My learning playlist"), li("RLA: The Role of Conflict in Community", { url: "https://www.youtube.com/watch?v=yRQ8zJ-uo2Y" }), li("RLA: How to Build Community", { url: "https://www.youtube.com/watch?v=GIP_5bHaVEE" })] } }),
    task("Community storytelling nights", { board_id: boardId, in_additional: false, listen: { kind: "set", items: [li("Story night, October"), li("Story night, September")] } }),
    task("School of the Great Turning course", { board_id: boardId, in_additional: false, listen: { kind: "course", items: [li("Module 2"), li("Module 3"), li("Module 6")] } }),
    task("Watch: Facing Fragility", { board_id: boardId, in_additional: false, description: "https://spiraljourneyworkthatreconnects.org/facing-fragility/", listen: { kind: "item", url: "https://spiraljourneyworkthatreconnects.org/facing-fragility/" } }),
    task("Saar course", { board_id: boardId, in_additional: false, is_aspiration: true, listen: { kind: "course" } }),
    task("Kobi videos", { board_id: boardId, in_additional: false, is_aspiration: true, listen: { kind: "set" } }),
    task("Shalini course videos", { board_id: boardId, in_additional: false, is_aspiration: true, listen: { kind: "course" } }),
    task("Some People Just Can't (webinar replay)", { board_id: boardId, due_at: due, in_additional: false, status: "completed", completed_at: new Date(Date.now() - 2 * 86400e3).toISOString(), listen: { kind: "item", source: "Authentic Revolution" } }),
  ];
}

export function makeFixtures() {
  const board = (title, sort, extra = {}) => ({ id: randomUUID(), owner_id: OWNER_ID, title, sort_order: sort, ...extra });
  const boards = [
    board("Relational Leadership Academy", 0, { description: "Course work and readings" }),
    board("Errands", 1),
    board("Home & garden", 2),
    board("Listening list", 3, { id: LISTEN_BOARD_ID }),
  ];
  const [course, errands, home, videos] = boards;
  // Boards inside Home & garden (one with its own board inside), so a board card's sub-boards open like folders (Nov 6).
  const beds = board("Garden beds", 0, { parent_board_id: home.id });
  const seeds = board("Seeds to order", 0, { parent_board_id: beds.id });
  boards.push(beds, seeds, board("Kitchen", 1, { parent_board_id: home.id }));
  // A course whose lessons are its own board's quests (Mastering Facilitation Skills on the Listening list, Nov 21).
  const mfs = board("Mastering Facilitation Skills Course", 4, { parent_board_id: course.id });
  boards.push(mfs);

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
    // The Listening list (owner, Nov 20-21): ranked rows; courses, apps and sets fold open to their own lists.
    ...listenRows(videos.id, mfs.id, task),
    task("Supercalifragilisticexpialidocious-unbroken-long-word-to-test-wrapping", { board_id: home.id }),
    task("Sort the garage shelves", { board_id: home.id, in_additional: true }),
    task("Turn the compost and top up the raised beds", { board_id: beds.id }),
    task("Tomatoes, basil and marigolds", { board_id: seeds.id }),
    task("Plan the weekend trip", { in_additional: true, due_at: inHours(170) }),
    // On the list to schedule (the auto-scheduler groups them by how soon).
    task("Week 7 assignment: facilitation journal", { board_id: course.id, due_at: inHours(24 * 40), schedule_rank: 0 }),
    task("Book the dentist cleaning", { plan_by: inHours(48), schedule_rank: 1 }),
    task("See Grandma for tea", { plan_by: inHours(24 * 9), schedule_rank: 2, estimate_minutes: 90 }),
    task("Clear out the shed someday", { schedule_rank: 3 }),
    task("Finished: return library books", { status: "completed", completed_at: inHours(-3), xp_awarded: 20, felt: 2 }),
    // Failed yesterday, and how it felt (owner, Nov 19): a fail on the Insights chart.
    // Quests done earlier in the month (owner, Nov 19: XP under each day on the Insights chart, and the squished month view).
    ...[1, 2, 3, 4, 6, 8, 9, 11, 13, 15, 16, 19, 22, 24, 27].map((d, k) =>
      task(`Done ${d} days ago`, { status: "completed", completed_at: inHours(-24 * d + [1.5, 4, 6.5, 9, 12][k % 5]), xp_value: [15, 20, 30, 25, 40][k % 5], felt: [1, 2, 0, -1, 2][k % 5] }),
    ),
    task("Morning run", { status: "completed", completed_at: inHours(-20), failed_at: inHours(-20), felt: -1 }),
  ];
  // The calendar: quests placed on it today and this week, one done, and a mini-quest with a time (Nov 3).
  const at = (h, mins = 60) => ({ is_on_calendar: true, scheduled_start: inHours(h), scheduled_end: inHours(h + mins / 60), estimate_minutes: mins });
  tasks.push(
    task("Goblin paperwork: renew the car registration", at(1.5)),
    task("Draft the facilitation workshop outline", { board_id: course.id, ...at(3.5, 90) }),
    task("Herb gathering at the farmers market", { status: "completed", completed_at: inHours(-1), xp_awarded: 20, felt: 1, ...at(-1.5, 45) }),
    task("Scout the old trail with Chester", at(25, 60)),
    // Written in [brackets]: a maybe, drawn as a dashed outline with no fill (owner, Nov 12).
    task("[Stretch and tea on the porch]", at(5.5, 45)),
    task("Rune puzzle: fix the printer", at(-19, 30)),
    // A quest marked failed (owner, Nov 17: "failed quest shouldn't show as green").
    task("Call the venue about the deposit", { status: "completed", completed_at: inHours(-20), failed_at: inHours(-20), ...at(-21, 60) }),
    task("Take out the trash", { is_tiny: true, is_manual_priority: true, due_at: inHours(8), estimate_minutes: 15 }),
  );
  // A repeating calendar event made into quests: two weekly gym sessions in one series (owner, Nov 18).
  const gym1 = task("Gym with Sam", { ...at(2.5, 60), google_calendar_event_id: "ev-gym-1" });
  const gym2 = task("Gym with Sam", { ...at(2.5 + 24 * 7, 60), google_calendar_event_id: "ev-gym-2" });
  tasks.push(gym1, gym2);
  // One quest in two calendar spots (owner, Nov 5): the registration continues tomorrow.
  const goblin = tasks.find((t) => t.title.startsWith("Goblin paperwork"));
  const task_sessions = [{ id: randomUUID(), owner_id: OWNER_ID, task_id: goblin.id, starts_at: inHours(26.5), ends_at: inHours(27.5), google_calendar_event_id: null }];
  const [reading] = tasks;
  const pickup = tasks.find((t) => t.title === "Pick up medication");
  // A quest waiting behind another (a sequence): hidden until the reading is done.
  tasks.push(task("Post the reflection link in the course chat", { board_id: course.id, locked_by_task_id: reading.id }));
  const steps = ["Skim the chapter", "Highlight three ideas", "Write one page", "Post it in the forum"].map((title, i) => ({
    id: randomUUID(), owner_id: OWNER_ID, task_id: reading.id, title, sort_order: i, done: i === 0, done_at: i === 0 ? inHours(-2) : null,
  }));

  const rite = (title, slot, extra = {}) => ({ id: randomUUID(), owner_id: OWNER_ID, title, slot, sort_order: sort++, xp_value: 5, ...extra });
  const rites = [
    rite("Gym 🏋️", "day", { kind: "habit", estimate_minutes: 60, due_time: "07:00", window_to: "10:00" }),
    rite("Read a chapter 📘", "day", { kind: "habit", estimate_minutes: 30, window_to: "14:00" }),
    rite("20 mins of house cleaning", "day", { kind: "habit" }),
    rite("Walk Chester 🐶", "day", { kind: "habit" }),
    rite("Learn a language 🗣", "day", { kind: "habit" }),
    rite("Morning routine ☀️", "day", { kind: "habit", steps: [{ id: "m1", title: "Read the book with Tiffany" }, { id: "m2", title: "Walk Chester" }, { id: "m3", title: "Make breakfast for Tiffany and me" }] }),
    // Not up today (three weekdays away, so the app's own day never lands on it): Additional habits (Nov 18).
    rite("Water the garden beds", "day", { kind: "habit", days: [(new Date().getDay() + 3) % 7] }),
    rite("Vitamins before 12pm", "day", { kind: "habit", steps: [{ id: "s1", title: "Vitamins" }, { id: "s2", title: "B12" }, { id: "s3", title: "D3", optional: true, xp: 2 }] }),
    rite("Brush and floss", "evening"),
    rite("Lay out tomorrow's clothes", "evening"),
    rite("Calendar check-in with Tiffany", "evening", { is_core: true, steps: [{ id: "e1", title: "Check if Tiffany has any morning meetings the bedroom door needs to be closed for (so I can sleep)" }] }),
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
    // Today's check-in, for the log under the check-in (owner, Nov 10 and 18).
    { owner_id: OWNER_ID, metric: "Mood", level: 6.5, created_at: inHours(-1) },
    { owner_id: OWNER_ID, metric: "Sleep quality", level: 7, created_at: inHours(-1) },
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
        // A month-old account: the walkthrough keeps the feedback button above it for accounts older than a day.
        created_at: inHours(-24 * 30),
        life_wheel: {
          // The walkthrough is finished for the test account (its own flow, "tour", starts it again).
          tour: { step: "end", done: true, at: 1 },
          cleaning: {
            spaces: [
              { id: "kitchen", name: "Kitchen", mess: 7 },
              { id: "living", name: "Living room", mess: 4 },
              { id: "bath", name: "Bathroom", mess: 2 },
            ],
          },
          rituals: [{ id: "r1", name: "Couples covenant", done: [day(-12), day(-40)] }],
          questSeries: { [gym1.id]: "g:ev-gym", [gym2.id]: "g:ev-gym" },
          eventQuests: { on: false, made: { "ev-gym-1": gym1.id, "ev-gym-2": gym2.id } },
          // Per-quest extras kept in the catch-all until they move to columns (split plan, S2): a place, a driving time,
          // a calendar card colour and a "12 of 32 pages" count, on quests that Today, a board and the calendar show.
          questPlaces: { [reading.id]: "Natick library", [pickup.id]: "CVS on Main Street", [goblin.id]: "Registry of Motor Vehicles" },
          questDrives: { [goblin.id]: 25, [pickup.id]: 10 },
          calCardLooks: { [goblin.id]: { color: "#6b8f71" }, [reading.id]: { color: "#b5651d" } },
          progressUnits: { [reading.id]: { total: 32, unit: "pages", done: 12 }, [pickup.id]: { total: 4, unit: "pills", done: 1 } },
        },
      },
      { id: FRIEND_ID, google_sub: "ui-check-friend", email: "friend@example.com", name: "Sam Friend", theme: "calm" },
    ],
    friendships: [{ id: randomUUID(), requester_id: OWNER_ID, addressee_id: FRIEND_ID, status: "accepted" }],
    boards,
    tasks,
    task_sessions,
    quest_steps: steps,
    rites,
    rewards,
    import_cards,
    check_ins,
    xp_events,
    app_defaults: [],
  };
}
