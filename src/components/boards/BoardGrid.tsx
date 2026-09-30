"use client";

import { useState } from "react";
import type { BoardWithStats } from "@/lib/data/boards";
import { reorderBoardsAction } from "@/app/actions";
import { formatRelativeTime } from "@/lib/format-time";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { useFlip } from "@/lib/use-flip";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";
import { EditBoardModal } from "./EditBoardModal";

/**
 * The boards grid, extracted into its own client component so cards can be
 * dragged to reorder. Dragging one board over another live-reflows the rest
 * (a real reorder, not just a drop-target highlight, and animated via
 * useFlip so cards visibly slide rather than teleport); the final order is
 * persisted once the drag ends, via reorderBoardsAction (writes sort_order).
 */
/** Adventure board-tile icon: one of the seven creature portraits, assigned
 * deterministically per board id (HANDOFF.md §4 "Board tile"). Calm uses a
 * plain accent-coloured circle instead (§ "Theme switching" — no painted
 * art in Calm). These are the same AI-generated placeholder portraits used
 * for task avatars — fine to reuse per the handoff's own note that they're
 * prototyping placeholders. */
const CREATURE_PORTRAITS = [
  "icon-dragon.jpg",
  "icon-goblin.jpg",
  "icon-sorcerer.jpg",
  "icon-boar.jpg",
  "icon-golem.jpg",
  "icon-venomroot.jpg",
  "icon-bat.jpg",
];

function creaturePortraitFor(boardId: string) {
  let hash = 0;
  for (let i = 0; i < boardId.length; i++) hash = (hash * 31 + boardId.charCodeAt(i)) >>> 0;
  return CREATURE_PORTRAITS[hash % CREATURE_PORTRAITS.length];
}

export function BoardGrid({
  boards: initialBoards,
  theme,
  parentBoardId,
}: {
  boards: BoardWithStats[];
  theme: "calm" | "adventure";
  /** Set when this grid is a board's sub-boards (not the top-level Boards
   * list) — threaded through to reorderBoardsAction so it also revalidates
   * this board's own page, not just /boards. */
  parentBoardId?: string;
}) {
  const { items: boards, draggingId, start, moveOver, finish } = useDragReorder({
    items: initialBoards,
    getId: (b) => b.id,
    onCommit: (orderedIds) => reorderBoardsAction(orderedIds, parentBoardId),
  });
  const register = useFlip(boards, (b) => b.id);
  const [editingBoard, setEditingBoard] = useState<BoardWithStats | null>(null);
  const isAdventure = theme === "adventure";

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {boards.map((board) => {
          const pct = board.questTotal > 0 ? Math.round((board.questDone / board.questTotal) * 100) : 0;
          const isDragging = draggingId === board.id;

          return (
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
              className="cursor-grab touch-none active:cursor-grabbing"
              style={{ opacity: isDragging ? 0.4 : 1, transition: "opacity 120ms" }}
            >
              <ViewTransitionLink
                href={`/boards/${board.id}`}
                draggable={false}
                className="hover-glow relative flex h-full flex-col gap-1.5 rounded-2xl p-2.5"
                style={{
                  background: board.color ?? (isAdventure ? "var(--t-panel)" : "var(--t-card)"),
                  border: `2px solid ${
                    board.isComplete ? "var(--t-good)" : isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"
                  }`,
                  borderWidth: board.isComplete ? 2 : isAdventure ? 1.5 : 1,
                  borderRadius: isAdventure ? 18 : 16,
                }}
              >
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  {board.isComplete ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="var(--t-good)" />
                      <path d="M7 12.5l3 3 7-7" stroke="#fff" strokeWidth="2" fill="none" />
                    </svg>
                  ) : (
                    isAdventure && (
                      <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--t-gold)" }} />
                    )
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingBoard(board);
                  }}
                  title="Edit board"
                  aria-label="Edit board"
                  className="hover-glow absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs"
                  style={{
                    background: isAdventure ? "rgba(0,0,0,.28)" : "var(--t-card)",
                    border: `1px solid ${isAdventure ? "rgba(209,161,60,.4)" : "var(--t-card-border)"}`,
                  }}
                >
                  ✎
                </button>
                <div
                  className="mt-6 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm"
                  style={{
                    border: isAdventure ? "1.5px solid var(--t-panel-border)" : undefined,
                    background: isAdventure ? "var(--t-panel-2)" : "var(--t-accent-soft)",
                  }}
                >
                  {isAdventure ? (
                    // eslint-disable-next-line @next/next/no-img-element -- static asset from /public
                    <img
                      src={`/design/${creaturePortraitFor(board.id)}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span style={{ color: "var(--t-accent)" }}>&#10022;</span>
                  )}
                </div>
                <div className="text-[13.5px] font-bold leading-tight" style={{ color: "var(--t-ink)" }}>
                  {board.title}
                  {board.is_private && (
                    <span className="ml-1 text-[10px] font-normal" style={{ color: "var(--t-ink-soft)" }}>
                      🔒
                    </span>
                  )}
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ background: isAdventure ? "rgba(59,42,24,.15)" : "var(--t-card-border)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: board.isComplete
                        ? "var(--t-good)"
                        : isAdventure
                          ? "linear-gradient(90deg, var(--t-gold-deep), var(--t-gold))"
                          : "var(--t-accent)",
                    }}
                  />
                </div>
                <div className="text-[10px]" style={{ color: "var(--t-ink)" }}>
                  {board.questDone} / {board.questTotal} quests
                </div>
                <div className="text-[10px] font-bold" style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}>
                  {board.xpEarned} {isAdventure ? "XP" : "pts"}
                </div>
                <div className="text-[9px]" style={{ color: "var(--t-ink-soft)" }}>
                  Updated {formatRelativeTime(board.lastUpdatedAt)}
                </div>
              </ViewTransitionLink>
            </li>
          );
        })}
      </ul>

      {editingBoard && (
        <EditBoardModal board={editingBoard} theme={theme} onClose={() => setEditingBoard(null)} />
      )}
    </>
  );
}
