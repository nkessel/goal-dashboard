import Link from "next/link";
import { notFound } from "next/navigation";
import { getBoard, getBoardAncestors, listBoardsWithStatsForOwner } from "@/lib/data/boards";
import { listTasksForBoard, listUnboardedTasks } from "@/lib/data/tasks";
import { UNCATEGORIZED_ID } from "@/lib/board-ids";
import { BoardGrid } from "./BoardGrid";
import { BoardQuestList } from "./BoardQuestList";
import { BoardSeal } from "./BoardSeal";

export type BoardHead = { title: string; ancestors: { id: string; title: string }[] };

/** Loads what a board shows: the board, its trail of parents, sub-boards and quests. */
export async function loadBoard(boardId: string, ownerId: string) {
  if (boardId === UNCATEGORIZED_ID) {
    const tasks = await listUnboardedTasks(ownerId);
    return { kind: "uncategorized" as const, tasks, head: { title: "Uncategorized", ancestors: [] } satisfies BoardHead };
  }
  const board = await getBoard(boardId, ownerId);
  if (!board) notFound();
  const [allTasks, ancestors, subBoards] = await Promise.all([
    listTasksForBoard(boardId, ownerId),
    getBoardAncestors(boardId, ownerId),
    listBoardsWithStatsForOwner(ownerId, boardId),
  ]);
  return {
    kind: "board" as const,
    board,
    allTasks,
    subBoards,
    head: { title: board.title, ancestors: ancestors.map((a) => ({ id: a.id, title: a.title })) } satisfies BoardHead,
  };
}

/**
 * A board's contents — its title and progress, the boards inside it (first,
 * as compact cards), then its quests. Shared by the full page and the peek.
 */
export function BoardBody({
  data,
  theme,
  onDark = true,
}: {
  data: Awaited<ReturnType<typeof loadBoard>>;
  theme: "calm" | "adventure";
  onDark?: boolean;
}) {
  const isAdventure = theme === "adventure";
  const text = onDark && isAdventure ? "var(--t-cream)" : "var(--t-ink)";
  const soft = onDark && isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)";

  if (data.kind === "uncategorized") {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[14px]" style={{ color: soft, opacity: 0.8 }}>
          Quests on no board yet — open one to give it a home.
        </p>
        <BoardQuestList tasks={data.tasks} theme={theme} />
      </div>
    );
  }

  const { board, allTasks, subBoards } = data;
  const quests = allTasks.filter((t) => !(t.is_aspiration && t.status === "open"));
  const doneCount = quests.filter((t) => t.status === "completed").length;
  const xpEarned = allTasks.filter((t) => t.status === "completed").reduce((sum, t) => sum + t.xp_value, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <BoardSeal color={board.color} size={30} />
        <div className="min-w-0 flex-1">
          <h1 dir="auto" className={`user-text m-0 ${isAdventure ? "font-display text-[22px] leading-tight" : "text-xl font-extrabold"}`} style={{ color: text }}>
            {board.title}
            {board.is_private && <span className="ml-1.5 text-xs font-normal">🔒</span>}
          </h1>
          <div className="text-[12.5px]" style={{ color: soft, opacity: 0.75 }}>
            {doneCount} of {quests.length} quests done · {xpEarned} {isAdventure ? "XP" : "pts"} earned
          </div>
        </div>
        <Link
          href={`/boards/${board.id}/map`}
          className="hover-glow flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-bold"
          style={isAdventure ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { background: "var(--t-accent)", color: "#fff" }}
          title="See this board as a quest map"
        >
          <span aria-hidden>🗺</span> Map
        </Link>
      </div>

      {board.description && (
        <p className="-mt-3 m-0 text-sm" style={{ color: soft, opacity: 0.8 }}>
          {board.description}
        </p>
      )}

      {subBoards.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={`m-0 ${isAdventure ? "font-display text-[15px]" : "text-sm font-bold"}`} style={{ color: text, opacity: 0.9 }}>
            {isAdventure ? "Boards inside" : "Sub-boards"} <span className="font-normal opacity-70">({subBoards.length})</span>
          </h2>
          <BoardGrid boards={subBoards} theme={theme} parentBoardId={board.id} />
        </section>
      )}

      <BoardQuestList tasks={allTasks} boardId={board.id} nextTaskId={board.next_task_id ?? null} theme={theme} />
    </div>
  );
}
