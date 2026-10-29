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
  "Rest is part of the road, not a detour from it.",
  "The smallest lantern still pushes back the dark.",
  "You don't need a perfect map to take the next step.",
  "Water carves canyons by showing up. So do you.",
  "Today's quest: do the next kind thing, then the next.",
  "Courage is often just a quiet 'I'll try again.'",
  "Every seed you planted is still growing underground.",
  "Begin where you are. Use what you have. Do what you can.",
  "The dragon is smaller once you walk toward it.",
  "Your pace is the right pace for your path.",
  "Gentle and persistent wins more battles than fierce and fleeting.",
  "A tidy mind starts with one cleared corner.",
  "What you tend, grows. What you return to, deepens.",
  "Let the first step be small enough to be easy.",
  "You've survived every hard day so far. That's a perfect record.",
  "Finish one thing, and the rest will feel lighter.",
  "The hero rests at the inn and still reaches the castle.",
  "Choose the quest that makes tomorrow kinder.",
  "Breathe. Then the next small thing.",
  "Done is a spell more powerful than perfect.",
  "Your attention is treasure. Spend it on what matters.",
  "Showing up tired still counts as showing up.",
  "The map unfolds as you walk it.",
  "Light a single candle and the whole room changes.",
  "You're allowed to go slowly. Just keep the thread.",
  "Each small win is a coin in the chest of who you're becoming.",
  "The mountain doesn't move. You do, step by step.",
  "Trust the practice. It's carrying you further than you can see.",
  "Today, aim for progress you can feel, not perfection you can't.",
  "The bravest thing is often the simplest: start.",
  "A clear priority is a compass in a crowded forest.",
];

const KEY = "retired-greetings";
const LIKED = "liked-greetings";

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, line: string, on: boolean) {
  try {
    const s = readSet(key);
    if (on) s.add(line);
    else s.delete(line);
    window.localStorage.setItem(key, JSON.stringify([...s]));
  } catch {
    /* storage unavailable */
  }
}

/** Lines you disliked or deleted: never shown again. */
export const retiredLines = () => readSet(KEY);
/** Lines you liked: they come back often. */
export const likedLines = () => readSet(LIKED);

export function retireLine(line: string, retire = true) {
  writeSet(KEY, line, retire);
  if (retire) writeSet(LIKED, line, false);
}

export function likeLine(line: string, like = true) {
  writeSet(LIKED, line, like);
  if (like) writeSet(KEY, line, false);
}

/** How many lines are in rotation at once (besides the ones you liked). */
export const ROTATION = 12;
/** How many fresh lines join the rotation each week. */
const FRESH_PER_WEEK = 4;

const dayNumber = (dayKey: string) => {
  const d = Math.floor(Date.parse(`${dayKey.slice(0, 10)}T12:00:00Z`) / 86_400_000);
  if (Number.isFinite(d)) return d;
  let h = 0;
  for (const c of dayKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

/**
 * The wise lines in rotation: the ones you liked, plus a window of the rest
 * that moves on a few lines each week, so new ones keep arriving. A line you
 * delete or dislike leaves for good and the next one waiting takes its place.
 */
export function rotationFor(dayKey: string, own: string[] = []): { liked: string[]; fresh: string[] } {
  const retired = retiredLines();
  const liked = likedLines();
  const all = [...new Set([...own, ...DAILY_LINES])].filter((l) => !retired.has(l));
  const likedNow = all.filter((l) => liked.has(l));
  const rest = all.filter((l) => !liked.has(l));
  if (!rest.length) return { liked: likedNow, fresh: likedNow.length ? [] : DAILY_LINES.slice(0, ROTATION) };
  const start = (Math.floor(dayNumber(dayKey) / 7) * FRESH_PER_WEEK) % rest.length;
  const fresh = Array.from({ length: Math.min(ROTATION, rest.length) }, (_, i) => rest[(start + i) % rest.length]);
  return { liked: likedNow, fresh };
}

/** Today's line (the same all day): liked lines return every few days, fresh ones fill the rest. */
export function lineForDay(dayKey: string, own: string[] = []): string {
  const { liked, fresh } = rotationFor(dayKey, own);
  const day = dayNumber(dayKey);
  if (liked.length && (day % 3 === 0 || !fresh.length)) return liked[Math.floor(day / 3) % liked.length];
  return fresh[day % fresh.length];
}
