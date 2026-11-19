/**
 * XP for a quest made from a calendar event, in proportion to its length (owner, Nov 19): 15 XP per half
 * hour (so an hour pays 30 XP, which brings 1 coin at the app's usual 1 coin per 30 XP), rounded to the
 * nearest 5, at least 5 and at most 240 (an 8-hour day).
 */
export const EVENT_XP_PER_HOUR = 30;

export function eventQuestXp(minutes: number): number {
  const raw = (Math.max(0, minutes) / 60) * EVENT_XP_PER_HOUR;
  return Math.min(240, Math.max(5, Math.round(raw / 5) * 5));
}
