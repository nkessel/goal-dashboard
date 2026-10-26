/**
 * How you like to be checked in: what the toucan learns from the check-in
 * quiz, and the words it chooses because of it. Pure, shared by Settings,
 * the quiz, the guide on screen and the server (which tells the chat model).
 */

export type Tone = "gentle" | "direct" | "playful";
export type Often = "rare" | "some" | "often";
export type Window = "morning" | "afternoon" | "evening";
export type Stuck = "tiny" | "timer" | "company" | "why" | "break";
export type Avoid = "popups" | "waiting" | "counts" | "exclaim" | "long";
export type GymHelp = "pack" | "before" | "after" | "cheer";

export type ToucanStyle = {
  /** The quiz was finished (or skipped through to the end). */
  done: boolean;
  tone: Tone;
  often: Often;
  times: Window[];
  /** Name one thing at a time, or a short list. */
  amount: "one" | "list";
  /** Ask a question, or offer a suggestion. */
  form: "question" | "suggestion";
  stuck: Stuck[];
  avoid: Avoid[];
  /** The check-in comes back every few hours after the day's first visit (how many: Settings › The welcome screen). */
  returnCheckIn: boolean;
  /** Gym days (0 = Sunday) and the usual time ("18:00"), and how to help. */
  gym: { days: number[]; time: string | null; help: GymHelp[] };
  /** Anything else, in your words. */
  notes: string;
};

export const DEFAULT_STYLE: ToucanStyle = {
  done: false,
  tone: "gentle",
  often: "some",
  times: ["morning", "afternoon", "evening"],
  amount: "one",
  form: "question",
  stuck: ["tiny", "timer"],
  avoid: ["waiting"],
  returnCheckIn: true,
  gym: { days: [], time: null, help: ["before", "after", "cheer"] },
  notes: "",
};

const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const someOf = <T extends string>(v: unknown, list: readonly T[], d: T[]): T[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => list.includes(x as T)))] : d);

export function cleanStyle(raw: unknown): ToucanStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const g = (r.gym && typeof r.gym === "object" ? r.gym : {}) as Record<string, unknown>;
  const d = DEFAULT_STYLE;
  return {
    done: r.done === true,
    tone: oneOf(r.tone, ["gentle", "direct", "playful"] as const, d.tone),
    often: oneOf(r.often, ["rare", "some", "often"] as const, d.often),
    times: someOf(r.times, ["morning", "afternoon", "evening"] as const, d.times),
    amount: oneOf(r.amount, ["one", "list"] as const, d.amount),
    form: oneOf(r.form, ["question", "suggestion"] as const, d.form),
    stuck: someOf(r.stuck, ["tiny", "timer", "company", "why", "break"] as const, d.stuck),
    avoid: someOf(r.avoid, ["popups", "waiting", "counts", "exclaim", "long"] as const, d.avoid),
    returnCheckIn: typeof r.returnCheckIn === "boolean" ? r.returnCheckIn : d.returnCheckIn,
    gym: {
      days: Array.isArray(g.days) ? [...new Set(g.days.filter((x): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6))].sort() : [],
      time: typeof g.time === "string" && /^\d{2}:\d{2}$/.test(g.time) ? g.time : null,
      help: someOf(g.help, ["pack", "before", "after", "cheer"] as const, d.gym.help),
    },
    notes: typeof r.notes === "string" ? r.notes.replace(/\s+/g, " ").trim().slice(0, 600) : "",
  };
}

/** The check-in quiz, one question at a time. Each choice carries a line the toucan might say, so you can hear it before choosing. */
export type Question =
  | { key: "tone" | "often" | "amount" | "form" | "returnCheckIn"; ask: string; multi?: false; choices: { value: string; label: string; example: string }[] }
  | { key: "times" | "stuck" | "avoid" | "gymHelp"; ask: string; hint?: string; multi: true; choices: { value: string; label: string; example: string }[] }
  | { key: "gym"; ask: string; hint?: string; multi: true; choices: { value: string; label: string; example: string }[] }
  | { key: "notes"; ask: string; hint?: string; multi?: false; choices: [] };

export const QUESTIONS: Question[] = [
  {
    key: "tone",
    ask: "How would you like me to sound?",
    choices: [
      { value: "gentle", label: "Gentle", example: "No rush. When you're ready, shall we look at today together?" },
      { value: "direct", label: "Straight to the point", example: "Two things are due today. Start with the first?" },
      { value: "playful", label: "Playful", example: "Adventurer! The homework dragon wakes at 6 pm. Shall we face it early?" },
    ],
  },
  {
    key: "often",
    ask: "How often should I speak up on my own?",
    choices: [
      { value: "rare", label: "Once a day at most", example: "One check-in a day, at the time you pick next." },
      { value: "some", label: "A few times a day", example: "Up to one check-in in each part of the day you pick." },
      { value: "often", label: "Whenever it helps", example: "Every time something's worth a word, like a deadline getting close." },
    ],
  },
  {
    key: "times",
    ask: "When are check-ins welcome?",
    hint: "Pick any.",
    multi: true,
    choices: [
      { value: "morning", label: "Morning", example: "Good morning. What's one thing that would make today feel good?" },
      { value: "afternoon", label: "Afternoon", example: "“AR class homework” is due at 6. Fifteen minutes on it now?" },
      { value: "evening", label: "Evening", example: "Good evening. Is there anything you need to prepare for tomorrow?" },
    ],
  },
  {
    key: "amount",
    ask: "When there's a lot going on…",
    choices: [
      { value: "one", label: "Tell me one thing", example: "“AR class homework” is due today. Shall we plan around it?" },
      { value: "list", label: "Give me a short list", example: "Due soon: “AR class homework” today, “Pay rent” and “Call the clinic” tomorrow." },
    ],
  },
  {
    key: "form",
    ask: "What works better for you?",
    choices: [
      { value: "question", label: "Ask me a question", example: "What feels like the right first step?" },
      { value: "suggestion", label: "Give me a suggestion", example: "Let's start with “AR class homework” for 15 minutes." },
    ],
  },
  {
    key: "stuck",
    ask: "When you're stuck, what helps?",
    hint: "Pick any.",
    multi: true,
    choices: [
      { value: "tiny", label: "A tiny first step", example: "Just open the assignment. That's the whole step." },
      { value: "timer", label: "A short timer together", example: "Ten minutes, then you can stop. I'll keep time." },
      { value: "company", label: "Company while I do it", example: "I'll stay right here while you work. Tell me when you start." },
      { value: "why", label: "Remembering why it matters", example: "This is the class you chose for yourself. Future you will be glad." },
      { value: "break", label: "A break first", example: "Stretch, water, three breaths. Then we'll look again." },
    ],
  },
  {
    key: "avoid",
    ask: "What doesn't work for you?",
    hint: "I'll steer clear of these.",
    multi: true,
    choices: [
      { value: "popups", label: "Surprise pop-ups", example: "I'll leave a small note instead of popping up." },
      { value: "waiting", label: "Hearing how long something has waited", example: "I won't say things like “untouched for 12 days”." },
      { value: "counts", label: "Streaks and missed counts", example: "I won't count what you missed." },
      { value: "exclaim", label: "Exclamation marks and emoji", example: "Calm punctuation only." },
      { value: "long", label: "Long messages", example: "Short and sweet." },
    ],
  },
  {
    key: "returnCheckIn",
    ask: "After the day's first visit, should the check-in come back every few hours? (You choose how many in Settings.)",
    choices: [
      { value: "yes", label: "Yes, check in with me", example: "Welcome back. How are you arriving?" },
      { value: "no", label: "No, I'll check in myself", example: "The check-in stays where it is, under your stats." },
    ],
  },
  {
    key: "gym",
    ask: "Which days do you want to go to the gym?",
    hint: "Pick your days and a usual time. Skip if none.",
    multi: true,
    choices: [
      { value: "1", label: "Mon", example: "" },
      { value: "2", label: "Tue", example: "" },
      { value: "3", label: "Wed", example: "" },
      { value: "4", label: "Thu", example: "" },
      { value: "5", label: "Fri", example: "" },
      { value: "6", label: "Sat", example: "" },
      { value: "0", label: "Sun", example: "" },
    ],
  },
  {
    key: "gymHelp",
    ask: "How should I help with the gym?",
    hint: "Pick any.",
    multi: true,
    choices: [
      { value: "pack", label: "The night before: pack your bag", example: "Gym tomorrow at 6. Want to pack your bag now so it's easy?" },
      { value: "before", label: "An hour before: time to go", example: "Gym in an hour. Shoes on, water bottle filled?" },
      { value: "after", label: "Afterwards: did you make it?", example: "Did you make it to the gym?" },
      { value: "cheer", label: "Celebrate when I go", example: "You went. That's what showing up looks like." },
    ],
  },
  { key: "notes", ask: "Anything else I should know about how you like to be checked in?", hint: "In your own words. Optional.", choices: [] },
];

/** Which part of the day it is (the app's day turns over at 5:30am). */
export function windowOf(d = new Date()): Window | null {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m >= 5 * 60 + 30 && m < 11 * 60 + 30) return "morning";
  if (m >= 11 * 60 + 30 && m < 17 * 60) return "afternoon";
  if (m >= 17 * 60 && m < 23 * 60) return "evening";
  return null;
}

/** How many check-ins of its own the toucan may start in a day. */
export const dailyBudget = (s: ToucanStyle) => (s.often === "rare" ? 1 : s.often === "some" ? 3 : 8);

const GREET: Record<Window, string> = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" };

/** Applies what you said doesn't work: no exclamation marks or emoji, shorter. */
export function polish(s: ToucanStyle, text: string) {
  let t = text;
  if (s.avoid.includes("exclaim")) t = t.replace(/!/g, ".").replace(/\p{Extended_Pictographic}️?/gu, "").replace(/\s{2,}/g, " ").trim();
  return t;
}

/** "18:00" as "6 pm" / "6:30 pm". */
export function clockWord(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const hr = h % 12 || 12;
  return `${hr}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

/** The words for each kind of check-in, in your tone. */
export const voice = {
  greet(s: ToucanStyle, w: Window) {
    return polish(s, s.tone === "playful" ? `${GREET[w]}, adventurer!` : s.tone === "direct" ? `${GREET[w]}.` : `${GREET[w]}!`);
  },
  dueSoon(s: ToucanStyle, w: Window, items: { title: string; when: string }[]) {
    const named = (s.amount === "one" ? items.slice(0, 1) : items.slice(0, 3)).map((d) => `“${d.title}” ${d.when}`);
    const more = items.length - named.length;
    const list = `${named.join(s.amount === "one" ? "" : ", ")}${more > 0 ? ` (and ${more} more)` : ""}`;
    const ask = s.form === "question" ? (s.tone === "direct" ? "Plan the day around it?" : "Shall we plan your day so nothing slips?") : "Let's plan your day so nothing slips.";
    return polish(s, `${this.greet(s, w)} ${s.tone === "playful" ? "On the horizon" : "Coming up"}: ${list}. ${ask}`);
  },
  openDay(s: ToucanStyle, w: Window) {
    const q = s.form === "question" ? "What's one thing that would make today feel good?" : "Pick one thing to make today feel good, and I'll help you start.";
    return polish(s, `${this.greet(s, w)} ${q}`);
  },
  important(s: ToucanStyle, title: string) {
    if (s.tone === "direct") return polish(s, `“${title}” matters to you. ${s.form === "question" ? "Give it a time?" : "Let's give it a time."}`);
    if (s.tone === "playful") return polish(s, `A quest worth taking: “${title}”. ${s.form === "question" ? "Shall we find it a time?" : "Let's find it a time!"}`);
    return polish(s, `“${title}” is one that matters to you. ${s.form === "question" ? "Would a small first step help?" : "Let's find a small first step."}`);
  },
  dueToday(s: ToucanStyle, title: string, time: string) {
    const q = s.form === "question" ? "Fifteen minutes on it now?" : "Let's do fifteen minutes on it now.";
    if (s.tone === "playful") return polish(s, `“${title}” is due at ${time}. ${q}`);
    return polish(s, `“${title}” is due today at ${time}. ${q}`);
  },
  eveningPrep(s: ToucanStyle) {
    const w = this.greet(s, "evening");
    if (s.form === "suggestion") return polish(s, `${w} Let's take a minute to get ready for tomorrow.`);
    return polish(s, `${w} Is there anything you need to prepare for tomorrow?`);
  },
  deadlineGuess(s: ToucanStyle, title: string, event: string, when: string) {
    return polish(s, `Is “${title}” due before ${event} (${when})?`);
  },
  gymPack(s: ToucanStyle, time: string | null) {
    const at = time ? ` at ${clockWord(time)}` : "";
    return polish(s, s.tone === "playful" ? `Gym tomorrow${at}! Pack your bag tonight and future you just has to walk out the door.` : `Gym tomorrow${at}. ${s.form === "question" ? "Want to pack your bag now so it's easy?" : "Pack your bag now so it's easy."}`);
  },
  gymBefore(s: ToucanStyle, time: string | null) {
    const at = time ? ` at ${clockWord(time)}` : " today";
    return polish(s, s.tone === "playful" ? `Gym${at}! Shoes on, water bottle filled, adventure awaits.` : s.tone === "direct" ? `Gym${at}. Time to get ready.` : `Gym${at}. ${s.form === "question" ? "How are you feeling about it?" : "Let's get you out the door gently."}`);
  },
  gymAfter(s: ToucanStyle) {
    return polish(s, s.tone === "playful" ? "Did you conquer the gym today?" : "Did you make it to the gym?");
  },
  gymCheer(s: ToucanStyle) {
    return polish(s, s.tone === "playful" ? "You went! Another stone set in the path. 💪" : s.tone === "direct" ? "Nice work. You showed up." : "You showed up for yourself. That counts for a lot.");
  },
  gymMissed(s: ToucanStyle) {
    return polish(s, s.tone === "direct" ? "Okay. Next one counts just as much." : "That's okay. Want to look at what got in the way, or just pick the next day?");
  },
  welcomeBack(s: ToucanStyle) {
    return polish(s, s.tone === "playful" ? "Welcome back, adventurer! How are you arriving?" : s.tone === "direct" ? "Welcome back. Quick check-in?" : "Welcome back. How are you arriving?");
  },
};

/** Your check-in style in a few lines, for the toucan's chat. */
export function styleLines(s: ToucanStyle): string[] {
  if (!s.done) return [];
  const out = [
    `Tone: ${s.tone === "gentle" ? "gentle and unhurried" : s.tone === "direct" ? "straight to the point" : "playful, adventure-flavoured"}.`,
    s.amount === "one" ? "Name one thing at a time, not lists." : "Short lists are welcome.",
    s.form === "question" ? "Prefers being asked a question over being told." : "Prefers a concrete suggestion over open questions.",
  ];
  const stuck: Record<Stuck, string> = { tiny: "a tiny first step", timer: "a short timer together", company: "company while they work (body doubling)", why: "remembering why it matters", break: "a break first" };
  if (s.stuck.length) out.push(`When stuck, what helps: ${s.stuck.map((k) => stuck[k]).join(", ")}.`);
  const avoid: Record<Avoid, string> = { popups: "surprise pop-ups", waiting: "mentioning how long something has waited", counts: "streaks or counts of what was missed", exclaim: "exclamation marks and emoji", long: "long messages (keep it very short)" };
  if (s.avoid.length) out.push(`Avoid: ${s.avoid.map((k) => avoid[k]).join(", ")}.`);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (s.gym.days.length) out.push(`Wants gym accountability: ${s.gym.days.map((d) => days[d]).join(", ")}${s.gym.time ? ` around ${clockWord(s.gym.time)}` : ""}.`);
  if (s.notes) out.push(`In their words: ${s.notes}`);
  return out;
}
