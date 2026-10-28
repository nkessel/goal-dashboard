/**
 * Dream boards: top-level boards that live in the cloud under the scrolls on
 * the Boards page. Which boards are dreams is kept in the profile extras as
 * `dreamBoards` (a list of board ids). Until that list is first saved, boards
 * whose title mentions "dream" (e.g. "Dream house") start in the cloud.
 */
export function dreamBoardIds(extras: Record<string, unknown> | null | undefined, boards: { id: string; title: string }[]): Set<string> {
  const saved = extras?.dreamBoards;
  if (Array.isArray(saved)) return new Set(saved.filter((x): x is string => typeof x === "string"));
  return new Set(boards.filter((b) => /dream/i.test(b.title)).map((b) => b.id));
}
