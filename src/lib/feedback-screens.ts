/**
 * Feedback organized by screen (owner, Nov 12: "make sure feedback is
 * organized by screen (or universal) so we can look at them when updating
 * screens"). Each in-app feedback note carries `journal_entries.screens`
 * (text[]): one or more of these keys. A note is guessed from where it was
 * sent when it arrives; a session reading notes corrects the tag by hand.
 *
 * Before changing a screen, read its open notes:
 *   select id, created_at, coalesce(edited_body, body) from journal_entries
 *   where kind = 'feedback' and auto_shipped_at is null
 *     and (review_status is null or review_status <> 'skipped')
 *     and screens && array['<key>', 'universal']
 *   order by created_at;
 *
 * Keep keys stable (they are stored); add new ones at the end of their group.
 */
export const FEEDBACK_SCREENS = [
  { key: "universal", label: "App-wide", covers: "Design language, menus, popups, gears, checkboxes, keyboard, speed, anything on every screen" },
  { key: "welcome", label: "Welcome screen", covers: "Morning check-in card: greeting, wise line, sleep check-in, journal prompts, habits pills, Morning routine (Dawn), choose today's quests" },
  { key: "today", label: "Today", covers: "Today's page: Due soon, Today's Quests, Additional Quests, Victories Today, focusing questions, prioritize tool, Today's check-in button" },
  { key: "quest-card", label: "Quest cards", covers: "A quest's card anywhere: bars, due day, steps tray, sequence peek, ⋯ / right-click menu, snooze, move" },
  { key: "quest-editor", label: "Quest editor", covers: "New / Edit quest: pills, XP, due, time, sub-quests, sequence window, board chip, Save / Complete" },
  { key: "habits", label: "Habits", covers: "Daily Habits cards, sub-habits, the habit editor, mess check-in (cleaning), laundry" },
  { key: "evening", label: "Evening routine", covers: "Evening rites, Plan tomorrow's day, Choose tomorrow's quests, Celebrate today's wins, Tonight" },
  { key: "calendar", label: "Calendar", covers: "Calendar views, auto-scheduler window, Plan my day, daily essentials, Google calendars" },
  { key: "boards", label: "Boards", covers: "Boards list, a board, sub-boards, Dreams, All Quests list, board picker" },
  { key: "import", label: "Import", covers: "/import: sorting imported items, import cards, Schedule within" },
  { key: "insights", label: "Insights", covers: "Check-ins and chart, events and tracked events, streaks, Wheel of Time, rituals" },
  { key: "settings", label: "Settings", covers: "Settings menu and its pages, character card, loading looks" },
  { key: "inventory", label: "Inventory", covers: "Backpack, packing lists, Bring from home" },
  { key: "toucan", label: "Toucan Spirit", covers: "His bubble, notes, chat, perch and cage" },
  { key: "feedback-tool", label: "Feedback tool", covers: "The feedback button and box, screenshots, past notes" },
  { key: "celebration", label: "Celebration", covers: "Quest complete / victory screen, XP bursts, rewards claimed from it" },
  { key: "portrait", label: "Portrait painter", covers: "Choose a portrait, painting, uploads, portrait library" },
  { key: "party", label: "Party", covers: "Guild Hall (/feed), friends, invites, sharing" },
  { key: "rewards", label: "Treasure Chest", covers: "Rewards and coins" },
  { key: "create", label: "+ menu", covers: "The + button and its create sheet" },
  { key: "language", label: "Learn a language", covers: "The language window and phrases" },
  { key: "journal", label: "Journal", covers: "/journal" },
] as const;

export type FeedbackScreen = (typeof FEEDBACK_SCREENS)[number]["key"];

const KEYS = new Set<string>(FEEDBACK_SCREENS.map((s) => s.key));

/** Words in an open popup's title that name the screen it belongs to. */
const DIALOGS: [RegExp, FeedbackScreen][] = [
  [/^(new|edit) quest|completed quest|quest sequence|due date/i, "quest-editor"],
  [/edit (rite|habit)/i, "habits"],
  [/quest complete/i, "celebration"],
  [/choose a portrait/i, "portrait"],
  [/toucan/i, "toucan"],
  [/learn a language/i, "language"],
  [/packing|inventory/i, "inventory"],
  [/snooze/i, "quest-card"],
];

/** Pages by path. */
const PATHS: [RegExp, FeedbackScreen][] = [
  [/^\/import/, "import"],
  [/^\/calendar/, "calendar"],
  [/^\/(boards|quests|matrix)/, "boards"],
  [/^\/insights/, "insights"],
  [/^\/settings\/inventory/, "inventory"],
  [/^\/settings/, "settings"],
  [/^\/(feed|friends|invite)/, "party"],
  [/^\/rewards/, "rewards"],
  [/^\/journal/, "journal"],
  [/^\/$/, "today"],
];

/**
 * A first guess from where the note was sent: the welcome screen, then the
 * open popup, then the page. `context` is the feedback box's line
 * ("welcome screen · open: … · showing: …"). It's only a guess: a session
 * reading the notes corrects `screens` by hand.
 */
export function guessFeedbackScreens(page: string | null | undefined, context: string | null | undefined): FeedbackScreen[] {
  const out: FeedbackScreen[] = [];
  if (/(^|· )welcome screen( ·|$)/.test(context ?? "")) return ["welcome"];
  const open = /open: ([^·]+)/.exec(context ?? "")?.[1]?.trim() ?? "";
  if (open) for (const [re, key] of DIALOGS) if (re.test(open)) { out.push(key); break; }
  if (!out.length && typeof page === "string") {
    const path = page.split("?")[0];
    for (const [re, key] of PATHS) if (re.test(path)) { out.push(key); break; }
  }
  return out;
}

export function isFeedbackScreen(k: string): k is FeedbackScreen {
  return KEYS.has(k);
}
