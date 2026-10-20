/**
 * The first-visit-of-the-day line: a different encouragement each day about
 * coming back to the work. Any line can be retired for good.
 */
export const DAILY_LINES = [
  "You came back. That's the whole secret, repeated.",
  "Every return is a vote for the person you're becoming.",
  "The path remembers every footstep. Here's another.",
  "Small steps, taken again and again, move mountains.",
  "Consistency is quiet magic. You just cast it.",
  "You don't have to be ready. You just have to begin.",
  "Today counts because you're here for it.",
  "The streak isn't the goal. You are.",
  "Heroes aren't made in a day. They're made daily.",
  "One more day of choosing your own adventure.",
  "Momentum loves company. Welcome back to it.",
  "The door was open. You walked through. Well done.",
  "Doing it imperfectly beats waiting to do it perfectly.",
  "Return, and the road rises to meet you.",
  "A little today is worth more than a lot someday.",
  "You kept a promise to yourself just by opening this.",
  "Progress is just presence, added up.",
  "Every master was once a beginner who kept coming back.",
  "The quest continues because you continue.",
  "Even the longest journey is made of todays.",
  "You are building something no one else can.",
  "Arriving is half the battle. The other half is yours to enjoy.",
  "Keep the fire lit: one small log at a time.",
  "This is what dedication looks like on an ordinary day.",
  "Your future self is cheering you on right now.",
  "Be gentle with the pace and faithful to the path.",
  "Another sunrise, another chance to move the story forward.",
  "Steady beats speedy. You're steady.",
];

const KEY = "retired-greetings";

export function retiredLines(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function retireLine(line: string, retire = true) {
  try {
    const s = retiredLines();
    if (retire) s.add(line);
    else s.delete(line);
    window.localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* storage unavailable */
  }
}

/** Today's line (the same all day), skipping retired ones. */
export function lineForDay(dayKey: string): string {
  const retired = retiredLines();
  const pool = DAILY_LINES.filter((l) => !retired.has(l));
  const list = pool.length ? pool : DAILY_LINES;
  let h = 0;
  for (const c of dayKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // Walk through the list a day at a time rather than jumping at random.
  const day = Math.floor(Date.parse(`${dayKey.slice(0, 10)}T12:00:00Z`) / 86_400_000) || h;
  return list[day % list.length];
}
