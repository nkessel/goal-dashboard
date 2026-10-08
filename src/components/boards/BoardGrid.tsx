"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardWithStats } from "@/lib/data/boards";
import type { Task } from "@/lib/data/types";
import { reorderBoardsAction } from "@/app/actions";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { useFlip } from "@/lib/use-flip";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { EditBoardModal } from "./EditBoardModal";
import { BoardSeal } from "./BoardSeal";

/** How many open quests each card previews before "N more". */
const PREVIEW_COUNT = 3;

function OpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

function DoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="var(--t-good)" />
      <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Two rolled scrolls, one behind the other: boards inside this board. */
function SubBoardsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="7" y="3" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.8" opacity=".55" />
      <rect x="3" y="8" width="13" height="13" rx="1.5" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.9" />
      <path d="M6.5 13h6M6.5 16.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M13.5 7l3 3" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

/**
 * Quest boards as rolled scrolls. Each card shows the board's progress, how
 * many quests are open and done, how many boards sit inside it, and its next
 * few open quests — each opens in the quest editor with one tap. Cards drag to
 * reorder (live reflow via useFlip; order saved when the drag ends).
 */
export function BoardGrid({
  boards: initialBoards,
  theme,
  parentBoardId,
}: {
  boards: BoardWithStats[];
  theme: "calm" | "adventure";
  /** Set when this grid is a board's sub-boards, so the reorder also revalidates that board's page. */
  parentBoardId?: string;
}) {
  const router = useRouter();
  const { items: boards, draggingId, start, moveOver, finish } = useDragReorder({
    items: initialBoards,
    getId: (b) => b.id,
    onCommit: (orderedIds) => reorderBoardsAction(orderedIds, parentBoardId),
  });
  const register = useFlip(boards, (b) => b.id);
  const [editingBoard, setEditingBoard] = useState<BoardWithStats | null>(null);
  const [openQuest, setOpenQuest] = useState<Task | null>(null);
  const isAdventure = theme === "adventure";
  const soft = isAdventure ? "#5a4a30" : "var(--t-ink-soft)";

  function card(board: BoardWithStats) {
    const pct = board.questTotal > 0 ? Math.round((board.questDone / board.questTotal) * 100) : 0;
    const open = board.questTotal - board.questDone;
    const previews = board.openQuests.slice(0, PREVIEW_COUNT);
    const more = board.openQuests.length - previews.length;
    const href = `/boards/${board.id}`;

    const body = (
      <div className="flex h-full flex-col gap-2.5 px-3.5 pb-3 pt-3">
        {/* Header: seal, title, progress and counts — opens the board */}
        <ViewTransitionLink href={href} draggable={false} className="flex flex-col gap-2 rounded-md pr-8">
          <span className="flex items-start gap-2">
            <span className="mt-[3px]">
              <BoardSeal color={board.color} size={20} />
            </span>
            <span
              className={`min-w-0 break-words leading-tight ${isAdventure ? "font-display text-[19px] font-semibold" : "text-[15px] font-bold"}`}
              style={{ color: "var(--t-ink)" }}
            >
              {board.title}
              {board.is_private && (
                <span className="ml-1 text-[11px] font-normal" title="Private board">
                  🔒
                </span>
              )}
            </span>
          </span>

          <span className="flex items-center gap-2" title={`${board.questDone} of ${board.questTotal} quests complete`}>
            <span
              className="h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ background: isAdventure ? "rgba(70,50,20,.18)" : "var(--t-card-border)" }}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: board.isComplete ? "var(--t-good)" : isAdventure ? "linear-gradient(90deg, #b8913f, #e2bf63)" : "var(--t-accent)",
                }}
              />
            </span>
            <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: soft }}>
              {board.questDone}/{board.questTotal}
            </span>
          </span>

          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: soft }}>
            <span className="flex items-center gap-1" title={`${open} quests to go`}>
              <OpenIcon />
              {open} open
            </span>
            <span className="flex items-center gap-1" title={`${board.questDone} quests complete`}>
              <DoneIcon />
              {board.questDone} done
            </span>
            {board.subBoardCount > 0 && (
              <span className="flex items-center gap-1" title={`${board.subBoardCount} quest boards inside this one`}>
                <SubBoardsIcon />
                {board.subBoardCount} {board.subBoardCount === 1 ? "sub-board" : "sub-boards"}
              </span>
            )}
          </span>
        </ViewTransitionLink>

        {/* Quest previews — each opens that quest */}
        {previews.length > 0 ? (
          <ul className="-mx-1.5 flex flex-col border-t pt-1.5" style={{ borderColor: isAdventure ? "rgba(120,90,40,.28)" : "var(--t-card-border)" }}>
            {previews.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  draggable={false}
                  onClick={() => setOpenQuest(q)}
                  className="board-quest flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[14px]"
                  style={{ color: "var(--t-ink)" }}
                  title={q.title}
                >
                  <span className="shrink-0" style={{ color: soft }}>
                    <OpenIcon />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{q.title}</span>
                  {q.estimate_minutes ? (
                    <span className="shrink-0 text-[12px] tabular-nums" style={{ color: soft }}>
                      {q.estimate_minutes}m
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
            {more > 0 && (
              <li>
                <ViewTransitionLink href={href} draggable={false} className="board-quest block rounded-md px-1.5 py-1 text-[13px]" >
                  <span style={{ color: soft }}>+{more} more on this board</span>
                </ViewTransitionLink>
              </li>
            )}
          </ul>
        ) : (
          <p className="m-0 border-t pt-2 text-[13.5px]" style={{ borderColor: isAdventure ? "rgba(120,90,40,.28)" : "var(--t-card-border)", color: soft }}>
            {board.isComplete ? "Every quest here is complete." : board.subBoardCount > 0 ? "Quests live on the boards inside." : "No quests yet — open the board to add one."}
          </p>
        )}
      </div>
    );

    return (
      <div className={`board-card relative h-full ${isAdventure ? `board-scroll ${board.isComplete ? "is-complete" : ""}` : ""}`}>
        {isAdventure && <span aria-hidden className="scroll-rod top" />}
        <div
          className={isAdventure ? "scroll-sheet" : "h-full rounded-2xl"}
          style={
            isAdventure
              ? undefined
              : {
                  background: board.color ?? "var(--t-card)",
                  border: `${board.isComplete ? 2 : 1}px solid ${board.isComplete ? "var(--t-good)" : "var(--t-card-border)"}`,
                }
          }
        >
          {body}
          <button
            type="button"
            onClick={() => setEditingBoard(board)}
            title="Edit board"
            aria-label={`Edit ${board.title}`}
            className="board-edit-btn absolute right-2 top-2 z-[3] flex h-8 w-8 items-center justify-center rounded-full"
            style={{
              background: isAdventure ? "rgba(255,248,230,.9)" : "var(--t-card)",
              border: `1px solid ${isAdventure ? "#b39a6a" : "var(--t-card-border)"}`,
              color: "var(--t-ink)",
              boxShadow: "0 1px 3px rgba(0,0,0,.18)",
            }}
          >
            <PencilIcon />
          </button>
        </div>
        {isAdventure && <span aria-hidden className="scroll-rod bottom" />}
      </div>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <li
            key={board.id}
            ref={register(board.id)}
            draggable
            onDragStart={(e) => {
              start(board.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              moveOver(board.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              finish();
            }}
            onDragEnd={(e) => finish(e.dataTransfer.dropEffect !== "none")}
            className="cursor-grab active:cursor-grabbing"
            style={{ opacity: draggingId === board.id ? 0.4 : 1, transition: "opacity 120ms" }}
          >
            {card(board)}
          </li>
        ))}
      </ul>

      {editingBoard && <EditBoardModal board={editingBoard} theme={theme} onClose={() => setEditingBoard(null)} />}
      {openQuest && (
        <EditTaskModal
          task={openQuest}
          theme={theme}
          onClose={() => {
            setOpenQuest(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
