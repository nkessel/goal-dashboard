/**
 * The owner's calendar convention: an item whose title is written in [square brackets]
 * is optional, a maybe (owner's feedback bdbcdd51; Nov 12: "calendar items in [brackets]
 * should show up on the calendar as tentative (no color + dashed outline, still editable)").
 * The day planner leaves them as free time; the calendar draws them as outlines.
 */
export function isTentativeTitle(title: string | null | undefined): boolean {
  return /^\s*\[[^\]]+\]\s*$/.test(title ?? "");
}
