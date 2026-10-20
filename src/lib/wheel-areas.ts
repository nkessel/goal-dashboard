/**
 * The life wheel's areas are your top-level boards (in their order), so the
 * wheel and the boards describe the same parts of life. Helper boards made by
 * the app (Waiting For, Someday / Maybe) aren't areas.
 */
const HELPERS = new Set(["waiting for", "someday / maybe"]);

export function wheelAreasFrom(boards: { title: string; parent_board_id: string | null; is_private?: boolean | null }[]): string[] {
  return boards
    .filter((b) => !b.parent_board_id && !HELPERS.has(b.title.trim().toLowerCase()))
    .map((b) => b.title.replace(/\s+/g, " ").trim().slice(0, 20))
    .filter((t, i, all) => t && all.indexOf(t) === i)
    .slice(0, 12);
}
