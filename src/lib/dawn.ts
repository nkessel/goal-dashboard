/**
 * Dawn & dusk: the owner's morning routine (Nov 9), planned the night before and walked in the
 * morning. "Nourishing habits, even when tired or strapped for time": a steady core of stones you
 * pick at dusk to fit the room before your first commitment, a 2-minute version of each for short
 * mornings, one offering card for variety, a habit of the week, and logging it all afterwards.
 * Every part can be switched on or off (`DawnOn`), all kept with the account in `life_wheel.dawn`.
 */

/** One thing you might do in the morning. `ref` ties it to a habit ("rite:<id>") or a sub-habit ("step:<riteId>:<stepId>"). */
export type Stone = { id: string; title: string; emoji: string; min: number; short?: string; ref?: string; area?: Area; xp?: number };
export type Area = "health" | "spirit" | "connection" | "confidence" | "planning" | "learning";
export type Card = { id: string; text: string; on: "am" | "pm" };
export type Prompt = { id: string; q: string; on: boolean };
export type Chapter = { title: string; practice: string; emoji: string };

/** Which parts you use (owner: "choose in the settings which ones you do"). */
export type DawnOn = {
  /** Choose tomorrow's stones in the evening (Prepare for tomorrow's day). */
  plan: boolean;
  /** Earliest wake time and tomorrow's first commitment, with the room between them. */
  wake: boolean;
  /** The Dawn path on the welcome screen. */
  path: boolean;
  /** "Short on time": every stone turns into its 2-minute version, and still counts. */
  short: boolean;
  /** One offering card in the morning, hung on a stone you already do. */
  offerAm: boolean;
  /** One offering card in the evening. */
  offerPm: boolean;
  /** Deal three face-down cards to choose from instead of one. */
  hand: boolean;
  /** Only the first stone shows big until it's done; then the rest unfold. */
  first: boolean;
  /** Log afterwards: swipe a finger across what you did. */
  trace: boolean;
  /** One face for how the morning felt. */
  feel: boolean;
  /** A habit of the week, up front on the path. */
  week: boolean;
  /** Your evening planner prompts (what went right, magical moments…). */
  pmPrompts: boolean;
};

export type DawnDay = {
  /** Stones chosen (the night before, or this morning). */
  stones?: string[];
  /** Earliest wake time, "06:30". */
  wake?: string;
  /** Leave time, "08:15" (optional). */
  leave?: string;
  sealed?: boolean;
  cue?: string;
  /** Stones done (custom ones; habit-tied ones are also ticked on the habit). */
  done?: string[];
  short?: boolean;
  /** The offering drawn (card id) and whether it was taken / done. */
  card?: string;
  draw?: number;
  took?: boolean;
  cardDone?: boolean;
  weekDone?: boolean;
  feel?: number;
  /** Evening prompt answers, by prompt id. */
  answers?: Record<string, string>;
  /** Evening offering. */
  pmCard?: string;
  pmDraw?: number;
  pmTook?: boolean;
  pmDone?: boolean;
};

export type Dawn = {
  on: DawnOn;
  stones: Stone[];
  cards: Card[];
  prompts: Prompt[];
  chapters: Chapter[];
  /** A chapter you set for this week (else they take turns by week). */
  chapterPinned?: { week: string; i: number } | null;
  days: Record<string, DawnDay>;
  /** True once the library was seeded from your habits. */
  seeded?: boolean;
};

export const DEFAULT_ON: DawnOn = { plan: true, wake: true, path: true, short: true, offerAm: true, offerPm: true, hand: false, first: false, trace: true, feel: true, week: true, pmPrompts: true };

export const ON_LABELS: { key: keyof DawnOn; label: string; hint: string; group: "Evening" | "Morning" | "Both" }[] = [
  { key: "plan", group: "Evening", label: "Plan tomorrow's morning", hint: "Pick tomorrow morning's stones in Prepare for tomorrow's day." },
  { key: "wake", group: "Evening", label: "Earliest wake time", hint: "Set when you'll rise; see tomorrow's first commitment and the room before it." },
  { key: "pmPrompts", group: "Evening", label: "Evening reflections", hint: "Your planner's prompts: what went right, magical moments…" },
  { key: "offerPm", group: "Evening", label: "An evening offering card", hint: "One small nourishing idea for tonight." },
  { key: "path", group: "Morning", label: "Morning routine on the welcome screen", hint: "Your stones on the welcome screen; one done is a gentle start." },
  { key: "short", group: "Morning", label: "Short on time", hint: "One tap turns every stone into its 2-minute version." },
  { key: "offerAm", group: "Morning", label: "A morning offering card", hint: "One idea hung on a stone you already do." },
  { key: "hand", group: "Both", label: "Deal three cards", hint: "Three face-down cards to pick from, instead of one." },
  { key: "first", group: "Morning", label: "One stone first", hint: "Only the first stone shows until it's done." },
  { key: "trace", group: "Morning", label: "Log afterwards", hint: "Swipe a finger across what you did." },
  { key: "feel", group: "Morning", label: "How did it feel?", hint: "One face for the morning." },
  { key: "week", group: "Both", label: "Habit of the week", hint: "A new practice up front each week." },
];

/** Nourishing habits to add with one tap (owner, Nov 9: "for planning or spirit or connection, confidence, health…"). */
export const SUGGESTIONS: Omit<Stone, "id">[] = [
  { title: "Water before coffee", emoji: "💧", min: 1, area: "health" },
  { title: "Stretch", emoji: "🧘", min: 5, short: "Three big stretches", area: "health" },
  { title: "Morning light outside", emoji: "☀️", min: 5, short: "Two minutes at the window", area: "health" },
  { title: "A protein breakfast", emoji: "🍳", min: 10, area: "health" },
  { title: "A short walk", emoji: "🚶", min: 10, short: "Once round the block", area: "health" },
  { title: "Exercise", emoji: "🏋️", min: 30, short: "20 push-ups or squats", area: "health" },
  { title: "Meditation", emoji: "🪷", min: 10, short: "Three slow breaths", area: "spirit" },
  { title: "Affirmations", emoji: "✨", min: 2, area: "spirit" },
  { title: "Visualization", emoji: "🔭", min: 3, short: "See today going well, for one breath", area: "spirit" },
  { title: "A gratitude line", emoji: "🙏", min: 2, area: "spirit" },
  { title: "Read something that lifts you", emoji: "📜", min: 10, short: "One page or one poem", area: "spirit" },
  { title: "A minute of silence", emoji: "🕯️", min: 1, area: "spirit" },
  { title: "Good-morning text to a friend", emoji: "💌", min: 2, area: "connection" },
  { title: "One real question at breakfast", emoji: "💬", min: 2, area: "connection" },
  { title: "A hug that lasts 20 seconds", emoji: "🤗", min: 1, area: "connection" },
  { title: "Say today's win-to-be aloud", emoji: "🏆", min: 1, area: "confidence" },
  { title: "Stand tall for two breaths", emoji: "🦁", min: 1, area: "confidence" },
  { title: "Remember yesterday's victory", emoji: "🎖️", min: 1, area: "confidence" },
  { title: "Glance at today's top priority", emoji: "🎯", min: 2, area: "planning" },
  { title: "Pick today's 3 quests", emoji: "🗺️", min: 3, area: "planning" },
  { title: "Check the calendar once", emoji: "📅", min: 2, area: "planning" },
  { title: "Journal", emoji: "✍️", min: 10, short: "One sentence", area: "planning" },
  { title: "A phrase in a new language", emoji: "🗣", min: 5, short: "Say one phrase", area: "learning" },
  { title: "A learning video or podcast", emoji: "🎧", min: 15, short: "Five minutes of it", area: "learning" },
];

export const AREA_NAMES: Record<Area, string> = { health: "Health", spirit: "Spirit", connection: "Connection", confidence: "Confidence", planning: "Planning", learning: "Learning" };

const AM_CARDS = [
  "Notice three sounds on Chester's walk",
  "Stretch for two minutes while the kettle boils",
  "Ask Tiffany a question you've never asked",
  "Read one line aloud twice and let it sink in",
  "Two minutes of light on your face",
  "Drink a full glass of water before anything else",
  "Write one sentence of gratitude",
  "Three slow breaths before breakfast",
  "Listen to a learning video on the walk",
  "Text a friend good morning",
  "Tidy one surface",
  "Say one phrase in your new language",
  "Smile at yourself in the mirror, on purpose",
  "Name the one thing today is for",
];
const PM_CARDS = [
  "Write one thing that went well today",
  "Stretch for five minutes",
  "Lay out tomorrow's clothes",
  "Read ten pages of something kind",
  "Thank someone for today",
  "Ten minutes with no screens before bed",
  "Write tomorrow's one top priority",
  "Tidy one surface",
  "A cup of tea with Tiffany",
  "Slow breaths in bed: in for 4, out for 6",
  "Pick tomorrow's early morning excitement",
  "Plan tomorrow's breakfast and lunch",
];

export const DEFAULT_PROMPTS: Prompt[] = [
  { id: "right", q: "What did I do right today?", on: true },
  { id: "magic", q: "Magical moments today", on: true },
  { id: "forward", q: "What am I really looking forward to?", on: true },
  { id: "learned", q: "Reflections and learnings from today", on: false },
  { id: "grateful", q: "Also super grateful for…", on: false },
  { id: "ready", q: "What do I need to be ready for tomorrow?", on: false },
  { id: "excite", q: "Early morning excitement:", on: false },
  { id: "meals", q: "Meals planned (breakfast, lunch)", on: false },
  { id: "dream", q: "Tonight I would like to dream about…", on: false },
];

export const DEFAULT_CHAPTERS: Chapter[] = [
  { title: "The Week of Sun", emoji: "☀️", practice: "Two minutes of light on your face, first thing" },
  { title: "The Week of Breath", emoji: "🌬️", practice: "Three slow breaths before your feet touch the floor" },
  { title: "The Week of Letters", emoji: "💌", practice: "Write one line to someone you love" },
  { title: "The Week of Water", emoji: "💧", practice: "A full glass of water before coffee" },
  { title: "The Week of Stretch", emoji: "🧘", practice: "Three big stretches" },
  { title: "The Week of Poetry", emoji: "📜", practice: "Read one poem" },
  { title: "The Week of Gratitude", emoji: "🙏", practice: "Name three thanks out loud" },
  { title: "The Week of Quiet", emoji: "🕯️", practice: "Five minutes before the phone" },
];

const id = () => Math.random().toString(36).slice(2, 10);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const isTime = (t: unknown): t is string => typeof t === "string" && /^\d{2}:\d{2}$/.test(t);

export function defaultCards(): Card[] {
  return [...AM_CARDS.map((text, i) => ({ id: `a${i}`, text, on: "am" as const })), ...PM_CARDS.map((text, i) => ({ id: `p${i}`, text, on: "pm" as const }))];
}

export function cleanStone(s: Partial<Stone>): Stone | null {
  const title = str(s?.title, 80);
  if (!title) return null;
  const min = Math.max(1, Math.min(180, Math.round(Number(s?.min) || 5)));
  const ref = typeof s?.ref === "string" && /^(rite:[0-9a-f-]{36}|step:[0-9a-f-]{36}:[\w-]{1,40})$/i.test(s.ref) ? s.ref : undefined;
  const area = s?.area && s.area in AREA_NAMES ? s.area : undefined;
  const xp = s?.xp == null ? undefined : Math.max(0, Math.min(50, Math.round(Number(s.xp) || 0)));
  return { id: str(s?.id, 24) || id(), title, emoji: str(s?.emoji, 8) || "✦", min, ...(str(s?.short, 80) ? { short: str(s?.short, 80) } : {}), ...(ref ? { ref } : {}), ...(area ? { area } : {}), ...(xp != null ? { xp } : {}) };
}

function cleanDay(d: DawnDay): DawnDay {
  const out: DawnDay = {};
  if (Array.isArray(d.stones)) out.stones = d.stones.filter((x) => typeof x === "string").slice(0, 12);
  if (Array.isArray(d.done)) out.done = d.done.filter((x) => typeof x === "string").slice(0, 30);
  if (isTime(d.wake)) out.wake = d.wake;
  if (isTime(d.leave)) out.leave = d.leave;
  if (d.sealed) out.sealed = true;
  if (str(d.cue, 140)) out.cue = str(d.cue, 140);
  if (d.short) out.short = true;
  for (const k of ["card", "pmCard"] as const) if (typeof d[k] === "string") out[k] = String(d[k]).slice(0, 24);
  for (const k of ["draw", "pmDraw"] as const) if (Number.isFinite(d[k])) out[k] = Math.max(0, Math.min(999, Math.round(Number(d[k]))));
  for (const k of ["took", "cardDone", "weekDone", "pmTook", "pmDone"] as const) if (d[k]) out[k] = true;
  if (Number.isFinite(d.feel) && Number(d.feel) >= 1 && Number(d.feel) <= 5) out.feel = Math.round(Number(d.feel));
  if (d.answers && typeof d.answers === "object") {
    const a: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.answers).slice(0, 20)) if (typeof v === "string" && v.trim()) a[k.slice(0, 24)] = v.slice(0, 600);
    if (Object.keys(a).length) out.answers = a;
  }
  return out;
}

export function cleanDawn(raw: unknown): Dawn {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Dawn>;
  const on = { ...DEFAULT_ON };
  if (r.on && typeof r.on === "object") for (const k of Object.keys(DEFAULT_ON) as (keyof DawnOn)[]) if (typeof r.on[k] === "boolean") on[k] = r.on[k];
  const stones = (Array.isArray(r.stones) ? r.stones : []).map((s) => cleanStone(s)).filter((s): s is Stone => !!s).slice(0, 40);
  const cards = Array.isArray(r.cards)
    ? r.cards
        .filter((c): c is Card => !!c && typeof c.text === "string" && (c.on === "am" || c.on === "pm"))
        .map((c) => ({ id: str(c.id, 24) || id(), text: str(c.text, 140), on: c.on }))
        .filter((c) => c.text)
        .slice(0, 80)
    : defaultCards();
  const prompts = Array.isArray(r.prompts)
    ? r.prompts.filter((p): p is Prompt => !!p && typeof p.q === "string").map((p) => ({ id: str(p.id, 24) || id(), q: str(p.q, 140), on: !!p.on })).filter((p) => p.q).slice(0, 20)
    : DEFAULT_PROMPTS;
  const chapters = Array.isArray(r.chapters)
    ? r.chapters.filter((c): c is Chapter => !!c && typeof c.title === "string").map((c) => ({ title: str(c.title, 60), practice: str(c.practice, 120), emoji: str(c.emoji, 8) || "✦" })).filter((c) => c.title).slice(0, 30)
    : DEFAULT_CHAPTERS;
  const days: Record<string, DawnDay> = {};
  if (r.days && typeof r.days === "object") {
    const keys = Object.keys(r.days).filter(isDay).sort().slice(-30);
    for (const k of keys) days[k] = cleanDay((r.days as Record<string, DawnDay>)[k] ?? {});
  }
  const pin = r.chapterPinned && typeof r.chapterPinned === "object" && typeof r.chapterPinned.week === "string" && Number.isInteger(r.chapterPinned.i) ? { week: r.chapterPinned.week.slice(0, 10), i: r.chapterPinned.i } : null;
  return { on, stones, cards, prompts, chapters: chapters.length ? chapters : DEFAULT_CHAPTERS, chapterPinned: pin, days, seeded: !!r.seeded };
}

/** The Monday of a day's week, "2026-11-09". */
export function weekOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - wd * 86_400_000).toISOString().slice(0, 10);
}

/** This week's chapter: the one you pinned, else they take turns week by week. */
export function chapterFor(dawn: Dawn, day: string): { chapter: Chapter; i: number } | null {
  if (!dawn.chapters.length) return null;
  const wk = weekOf(day);
  if (dawn.chapterPinned && dawn.chapterPinned.week === wk && dawn.chapters[dawn.chapterPinned.i]) return { chapter: dawn.chapters[dawn.chapterPinned.i], i: dawn.chapterPinned.i };
  const n = Math.floor(Date.parse(`${wk}T12:00:00Z`) / (7 * 86_400_000));
  const i = ((n % dawn.chapters.length) + dawn.chapters.length) % dawn.chapters.length;
  return { chapter: dawn.chapters[i], i };
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** The cards dealt for a day (one, or three for a hand), changing with each "Another". */
export function dealt(dawn: Dawn, day: string, when: "am" | "pm", draw: number, count: number): Card[] {
  const deck = dawn.cards.filter((c) => c.on === when);
  if (!deck.length) return [];
  const start = (hash(`${day}${when}`) + draw * count) % deck.length;
  const out: Card[] = [];
  for (let k = 0; k < Math.min(count, deck.length); k++) out.push(deck[(start + k) % deck.length]);
  return out;
}

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** "6:30" → minutes after midnight. */
export const minsOf = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const clock12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
