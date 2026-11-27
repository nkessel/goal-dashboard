/**
 * XP shown on Today moves the moment a habit is ticked, not when the page's refresh lands a second or two later
 * (owner's note 2983ab5d: "the change in XP in habits is quite laggy"). Whoever awards XP calls `xpGained`; the
 * numbers on screen (`LiveXp`) add it until the server's own figure arrives, then show that.
 */
export const XP_GAINED = "xp-gained";

export type XpGained = {
  /** Added to "XP this week" (every XP event counts there, sub-habits included). */
  week: number;
  /** Added to Victories Today's "Today's XP" (habits kept and quests done; sub-habit XP isn't listed there). */
  today: number;
};

export function xpGained(week: number, today = week) {
  if (typeof window === "undefined" || (!week && !today)) return;
  window.dispatchEvent(new CustomEvent<XpGained>(XP_GAINED, { detail: { week, today } }));
}
