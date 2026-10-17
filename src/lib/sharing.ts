/** Screens a person can share with their party, and what each shows. */
export const SHARE_SCREENS = [
  { key: "today", label: "Today", hint: "Today's and Additional Quests, and today's victories" },
  { key: "boards", label: "Boards", hint: "Your quest boards and what's on them" },
  { key: "calendar", label: "Calendar", hint: "Quests you've scheduled this week (never your Google appointments)" },
  { key: "insights", label: "Insights", hint: "Your check-ins, XP per day and character stats" },
] as const;
export type ShareKey = (typeof SHARE_SCREENS)[number]["key"];
export type ShareSettings = Partial<Record<ShareKey, boolean>>;
/** Only Today is shared until you choose otherwise. */
export const SHARE_DEFAULTS: Record<ShareKey, boolean> = { today: true, boards: false, calendar: false, insights: false };
export function shares(s: ShareSettings | null | undefined, k: ShareKey): boolean {
  return s?.[k] ?? SHARE_DEFAULTS[k];
}
