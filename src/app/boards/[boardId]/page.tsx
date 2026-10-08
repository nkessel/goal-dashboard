import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { getBoard, getBoardAncestors, listBoardsWithStatsForOwner } from "@/lib/data/boards";
import { getProfileById } from "@/lib/data/profiles";
import { listTasksForBoard } from "@/lib/data/tasks";
import { BoardFabMenu } from "@/components/boards/BoardFabMenu";
import { BoardGrid } from "@/components/boards/BoardGrid";
import { BoardQuestList } from "@/components/boards/BoardQuestList";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";
import { BoardSeal } from "@/components/boards/BoardSeal";

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  const session = await requireSession();

  const [board, profile] = await Promise.all([
    getBoard(boardId, session.user.id),
    getProfileById(session.user.id),
  ]);
  if (!board) notFound();

  const [allTasks, ancestors, subBoards] = await Promise.all([
    listTasksForBoard(boardId, session.user.id),
    getBoardAncestors(boardId, session.user.id),
    listBoardsWithStatsForOwner(session.user.id, boardId),
  ]);

  const theme = profile?.theme ?? "calm";
  const isAdventure = theme === "adventure";
  const quests = allTasks.filter((t) => !(t.is_aspiration && t.status === "open"));
  const doneCount = quests.filter((t) => t.status === "completed").length;
  const xpEarned = allTasks
    .filter((t) => t.status === "completed")
    .reduce((sum, t) => sum + t.xp_value, 0);
  // Nested one level up: back goes to the immediate parent board instead of
  // always the top-level Boards list, so drilling down and backing out
  // retraces the same path.
  const backHref = board.parent_board_id ? `/boards/${board.parent_board_id}` : "/boards";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-5">
        {ancestors.length > 0 && (
          <div className="-mb-2 flex flex-wrap items-center gap-1 text-xs" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.7 : 1 }}>
            <Link href="/boards" className="hover-glow underline-offset-2 hover:underline">
              {isAdventure ? "Quest Boards" : "Boards"}
            </Link>
            {ancestors.map((a) => (
              <span key={a.id} className="flex items-center gap-1">
                <span>/</span>
                <Link href={`/boards/${a.id}`} className="hover-glow underline-offset-2 hover:underline">
                  {a.title}
                </Link>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <ViewTransitionLink href={backHref} ariaLabel="Back" className="hover-glow rounded-full p-1">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 5l-7 7 7 7"
                stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)"}
                strokeWidth="2"
                fill="none"
              />
            </svg>
          </ViewTransitionLink>
          <BoardSeal color={board.color} size={28} />
          <div className="min-w-0 flex-1">
            <h1
              className={isAdventure ? "font-display truncate text-lg" : "truncate text-lg font-extrabold"}
              style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
            >
              {board.title}
              {board.is_private && <span className="ml-1.5 text-xs font-normal">🔒</span>}
            </h1>
            <div
              className="text-[11.5px]"
              style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.65 : 1 }}
            >
              {doneCount} of {quests.length} quests · {xpEarned} {isAdventure ? "XP" : "pts"} earned
            </div>
          </div>
        </div>

        {board.description && (
          <p
            className="-mt-3 text-sm"
            style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.75 : 1 }}
          >
            {board.description}
          </p>
        )}

        {subBoards.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2
              className={isAdventure ? "font-display text-sm" : "text-sm font-bold"}
              style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)", opacity: isAdventure ? 0.85 : 1 }}
            >
              {isAdventure ? "Sub quest-boards" : "Sub-boards"}
            </h2>
            <BoardGrid boards={subBoards} theme={theme} parentBoardId={board.id} />
          </div>
        )}

        <BoardQuestList tasks={allTasks} boardId={board.id} theme={theme} />

        <BoardFabMenu boardId={board.id} theme={theme} />
      </div>
    </AppShell>
  );
}
