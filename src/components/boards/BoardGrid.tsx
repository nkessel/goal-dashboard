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
                className={`hover-glow relative flex h-full flex-col items-center gap-2 overflow-hidden rounded-2xl px-3 pb-3.5 pt-4 text-center ${isAdventure ? "parchment parchment-framed" : ""}`}
                style={
                  isAdventure
                    ? board.isComplete
                      ? { borderColor: "var(--t-good)" }
                      : undefined
                    : {
                        background: board.color ?? "var(--t-card)",
                        border: `${board.isComplete ? 2 : 1}px solid ${board.isComplete ? "var(--t-good)" : "var(--t-card-border)"}`,
                      }
                }
              >
                {isAdventure && board.color && (
                  <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: board.color, opacity: 0.35, mixBlendMode: "multiply" }} />
                )}
                <div className="absolute right-2.5 top-2.5 z-[1] flex items-center gap-1">
                  {board.isComplete && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="var(--t-good)" />
                      <path d="M7 12.5l3 3 7-7" stroke="#fff" strokeWidth="2.2" fill="none" />
                    </svg>
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
                  className="board-edit absolute left-2.5 top-2.5 z-[1] flex h-8 w-8 items-center justify-center rounded-full text-[14px]"
                  style={{
                    background: isAdventure ? "rgba(255,250,238,.75)" : "var(--t-card)",
                    border: `1px solid ${isAdventure ? "#b39a6a" : "var(--t-card-border)"}`,
                    color: "var(--t-ink)",
                  }}
                >
                  ✎
                </button>
                <div
                  className="relative z-[1] flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-full text-2xl"
                  style={{
                    border: isAdventure ? "2px solid #8a6c2c" : undefined,
                    background: isAdventure ? "#f3e6c8" : "var(--t-accent-soft)",
                    boxShadow: isAdventure ? "0 0 0 3px rgba(217,180,95,.35), 0 3px 8px rgba(0,0,0,.3)" : undefined,
                  }}
                >
                  {isAdventure ? (
                    // eslint-disable-next-line @next/next/no-img-element -- static asset from /public
                    <img src={`/design/${creaturePortraitFor(board.id)}`} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span style={{ color: "var(--t-accent)" }}>&#10022;</span>
                  )}
                </div>
                <div className={`relative z-[1] leading-tight ${isAdventure ? "text-[20px] font-semibold" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
                  {board.title}
                  {board.is_private && (
                    <span className="ml-1 text-[12px] font-normal" style={{ color: "var(--t-ink-soft)" }}>
                      🔒
                    </span>
                  )}
                </div>
                <div
                  className="relative z-[1] h-2.5 w-full overflow-hidden rounded-full"
                  style={{
                    background: isAdventure ? "#2a2416" : "var(--t-card-border)",
                    border: isAdventure ? "1px solid #8a6c2c" : undefined,
                    boxShadow: isAdventure ? "inset 0 1px 3px rgba(0,0,0,.5)" : undefined,
                  }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: board.isComplete
                        ? "var(--t-good)"
                        : isAdventure
                          ? "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)"
                          : "var(--t-accent)",
                    }}
                  />
                </div>
                <div className="relative z-[1] flex w-full items-center justify-between text-[14px]" style={{ color: "var(--t-ink)" }}>
                  <span>
                    {board.questDone} / {board.questTotal} quests
                  </span>
                  <span className="font-semibold" style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}>
                    {board.xpEarned} {isAdventure ? "XP" : "pts"}
                  </span>
                </div>
                <div className="relative z-[1] text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
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
