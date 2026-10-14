"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardWithStats } from "@/lib/data/boards";
import { UNCATEGORIZED_ID } from "@/lib/board-ids";
import type { Task } from "@/lib/data/types";
import { moveTaskToBoardAction, reorderBoardsAction } from "@/app/actions";
import { QuestCardPopup } from "@/components/tasks/QuestCardPopup";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { CreateSheet } from "@/components/create/CreateSheet";
import { EditBoardModal } from "./EditBoardModal";
import { BoardSeal } from "./BoardSeal";

/** How many open quests each card previews before "N more". */
const PREVIEW_COUNT = 3;

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

/** A quest's tiny portrait: its art, or its monogram. */
function QuestDot({ q, size = 20 }: { q: Task; size?: number }) {
  const art = (q.icon_source === "ai" || q.icon_source === "library") && q.icon_key ? q.icon_key : null;
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ width: size, height: size, border: "1px solid #a58c66", background: "#f3e6c8" }}>
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element -- quest portrait
        <img src={art} alt="" className="h-full w-full object-cover" />
      ) : (
        <QuestMonogram id={q.id} title={q.title} size={size} />
      )}
    </span>
  );
}

const QUEST = "quest:";
const BOARD = "board:";

/**
 * Quest boards as rolled scrolls. Each card shows the board's progress, its
 * next few open quests (with their portraits — tap one to open it), the
 * boards inside it, and a + for adding to it. Press and drag a card to
 * reorder; drag a quest onto another board to move it there.
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
  const [order, setOrder] = useState<string[] | null>(null);
  const [seen, setSeen] = useState(initialBoards);
  if (seen !== initialBoards) {
    setSeen(initialBoards);
    setOrder(null);
  }
  const byId = new Map(initialBoards.map((b) => [b.id, b]));
  const boards = (order ?? initialBoards.map((b) => b.id)).map((id) => byId.get(id)).filter((b): b is BoardWithStats => !!b);
  const [moved, setMoved] = useState<Record<string, string | null>>({});
  const [active, setActive] = useState<{ kind: "board"; board: BoardWithStats } | { kind: "quest"; quest: Task } | null>(null);
  const [editingBoard, setEditingBoard] = useState<BoardWithStats | null>(null);
  const [openQuest, setOpenQuest] = useState<Task | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const isAdventure = theme === "adventure";
  const soft = isAdventure ? "#5a4a30" : "var(--t-ink-soft)";

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Quests land on whichever board the finger is over; boards sort by nearest centre.
  const collision: CollisionDetection = (args) => {
    if (String(args.active.id).startsWith(QUEST)) {
      const hits = pointerWithin(args).filter((c) => String(c.id).startsWith(BOARD));
      return hits;
    }
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(BOARD)) });
  };

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith(BOARD)) {
      const b = byId.get(id.slice(BOARD.length));
      if (b) setActive({ kind: "board", board: b });
    } else {
      const q = initialBoards.flatMap((b) => b.openQuests).find((x) => x.id === id.slice(QUEST.length));
      if (q) setActive({ kind: "quest", quest: q });
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const a = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    if (a.startsWith(BOARD)) {
      const ids = boards.map((b) => b.id);
      const from = ids.indexOf(a.slice(BOARD.length));
      const to = ids.indexOf(over.slice(BOARD.length));
      if (from < 0 || to < 0 || from === to || ids[to] === UNCATEGORIZED_ID || ids[from] === UNCATEGORIZED_ID) return;
      const next = arrayMove(ids, from, to);
      setOrder(next);
      startTransition(async () => {
        try {
          await reorderBoardsAction(next.filter((id) => id !== UNCATEGORIZED_ID), parentBoardId);
        } catch {
          setOrder(null);
        }
      });
      return;
    }
    const questId = a.slice(QUEST.length);
    const target = over.slice(BOARD.length);
    const from = initialBoards.find((b) => b.openQuests.some((q) => q.id === questId));
    if (!from || from.id === target) return;
    const dest = target === UNCATEGORIZED_ID ? null : target;
    setMoved((m) => ({ ...m, [questId]: target }));
    setError(null);
    startTransition(async () => {
      try {
        await moveTaskToBoardAction(questId, dest);
        router.refresh();
      } catch (err) {
        setMoved((m) => {
          const n = { ...m };
          delete n[questId];
          return n;
        });
        setError(err instanceof Error ? err.message : "Couldn't move that quest.");
      }
    });
  }

  /** Open quests shown on a board, counting quests just dragged on or off it. */
  function questsOn(board: BoardWithStats): Task[] {
    const own = board.openQuests.filter((q) => !(q.id in moved) || moved[q.id] === board.id);
    const incoming = initialBoards
      .flatMap((b) => (b.id === board.id ? [] : b.openQuests))
      .filter((q) => moved[q.id] === board.id);
    return [...incoming, ...own];
  }

  function card(board: BoardWithStats, dragging = false) {
    const open = questsOn(board);
    const previews = open.slice(0, PREVIEW_COUNT);
    const more = open.length - previews.length;
    const href = `/boards/${board.id}`;
    const rule = isAdventure ? "rgba(120,90,40,.28)" : "var(--t-card-border)";

    const body = (
      <div className="flex h-full flex-col gap-2 px-3 pb-2.5 pt-2.5">
        {/* Header: seal, title and completed count — opens the board */}
        <Link href={href} draggable={false} className="flex items-start gap-1.5 rounded-md pr-7">
          <span className="mt-[2px]">
            <BoardSeal color={board.color} size={18} />
          </span>
          <span className="min-w-0">
            <span
              className={`block leading-tight [overflow-wrap:break-word] [hyphens:auto] ${isAdventure ? "font-display text-[17px] font-semibold sm:text-[19px]" : "text-[15px] font-bold"}`}
              style={{ color: "var(--t-ink)" }}
            >
              {board.title}
              {board.is_private && (
                <span className="ml-1 text-[11px] font-normal" title="Private board">
                  🔒
                </span>
              )}
            </span>
            <span className="block text-[12px] tabular-nums" style={{ color: board.isComplete ? "var(--t-good)" : soft }}>
              ({board.questDone}/{board.questTotal} completed)
            </span>
          </span>
        </Link>

        {/* Sub-boards first, by name, each with its quest count */}
        {board.subBoards.length > 0 && (
          <ul className="-mx-1 flex flex-wrap gap-1 border-t pt-1.5" style={{ borderColor: rule }}>
            {board.subBoards.map((sb) => (
              <li key={sb.id} className="min-w-0 max-w-full">
                <Link
                  href={`/boards/${sb.id}`}
                  draggable={false}
                  className="board-quest flex min-h-[26px] min-w-0 items-center gap-1 rounded-md px-1 py-[2px] text-[12.5px]"
                  style={{ color: "var(--t-ink)" }}
                >
                  <span className="shrink-0" style={{ color: soft }}>
                    <SubBoardsIcon />
                  </span>
                  <span className="truncate">{sb.title}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: soft }}>
                    ({sb.questCount})
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Quest previews — tap to open, press and drag onto another board to move */}
        {previews.length > 0 && (
          <ul className="-mx-1 flex flex-col border-t pt-1" style={{ borderColor: rule }}>
            {previews.map((q) => (
              <QuestPreview key={q.id} q={q} disabled={dragging} onOpen={() => setOpenQuest(q)} />
            ))}
            {more > 0 && (
              <li>
                <Link href={href} draggable={false} className="board-quest block rounded-md px-1 py-[3px] text-[12.5px]">
                  <span style={{ color: soft }}>+{more} more</span>
                </Link>
              </li>
            )}
          </ul>
        )}

        {board.aspirationCount > 0 && (
          <Link href={href} draggable={false} className="flex items-center gap-1 text-[12px]" style={{ color: soft }}>
            <span aria-hidden style={{ color: "#a88a3f" }}>
              ✧
            </span>
            {board.aspirationCount} {board.aspirationCount === 1 ? "aspiration" : "aspirations"}
          </Link>
        )}

        {previews.length === 0 && board.subBoards.length === 0 && board.aspirationCount === 0 && (
          <p className="m-0 border-t pt-1.5 text-[12.5px]" style={{ borderColor: rule, color: soft }}>
            {board.isComplete ? "Every quest here is complete." : "No quests yet."}
          </p>
        )}

        {/* Add to this board */}
        {!board.isVirtual && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={() => setAddingTo(board.id)}
            aria-label={`Add a quest or sub-board to ${board.title}`}
            className="board-quest mt-auto flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-dashed text-[12.5px] font-semibold"
            style={{ borderColor: isAdventure ? "rgba(120,90,40,.45)" : "var(--t-card-border)", color: soft }}
          >
            <span className="text-[15px] leading-none" aria-hidden>
              +
            </span>
            Add
          </button>
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
          {!board.isVirtual && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
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
          )}
        </div>
        {isAdventure && <span aria-hidden className="scroll-rod bottom" />}
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="mb-2 rounded-lg px-3 py-2 text-[14px] font-semibold" style={{ background: "var(--t-warn-bg)", color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <SortableContext items={boards.map((b) => BOARD + b.id)} strategy={rectSortingStrategy}>
          <ul className={`grid gap-x-2 gap-y-3 sm:gap-x-3 ${boards.length === 1 ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3"}`}>
            {boards.map((board) => (
              <SortableBoard key={board.id} id={board.id} fixed={!!board.isVirtual} questTarget={active?.kind === "quest"}>
                {card(board)}
              </SortableBoard>
            ))}
          </ul>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }}>
          {active?.kind === "board" ? (
            <div className="rotate-[1.5deg] scale-[1.03]" style={{ filter: "drop-shadow(0 14px 22px rgba(0,0,0,.45))" }}>
              {card(active.board, true)}
            </div>
          ) : active?.kind === "quest" ? (
            <div className="flex max-w-[220px] items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-semibold parchment" style={{ borderRadius: 999, color: "var(--t-ink)", boxShadow: "0 10px 24px rgba(0,0,0,.45)" }}>
              <QuestDot q={active.quest} size={24} />
              <span className="truncate">{active.quest.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editingBoard && <EditBoardModal board={editingBoard} theme={theme} onClose={() => setEditingBoard(null)} />}
      {openQuest && (
        <QuestCardPopup
          task={openQuest}
          theme={theme}
          onClose={() => {
            setOpenQuest(null);
            router.refresh();
          }}
        />
      )}
      {addingTo && <CreateSheet kinds={["quest", "subboard"]} boardId={addingTo} theme={theme} onClose={() => setAddingTo(null)} />}
    </>
  );
}

/** A board card in the grid: press and drag to reorder; glows as a drop target while a quest is dragged. */
function SortableBoard({ id, fixed, questTarget, children }: { id: string; fixed: boolean; questTarget: boolean; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging, isOver } = useSortable({ id: BOARD + id, disabled: { draggable: fixed, droppable: false } });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="board-sortable cursor-grab touch-manipulation rounded-2xl active:cursor-grabbing"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        outline: questTarget && isOver ? "3px solid rgba(242,201,76,.9)" : undefined,
        outlineOffset: 2,
      }}
    >
      {children}
    </li>
  );
}

/** One quest preview row: tap to open it; press and drag to move it to another board. */
function QuestPreview({ q, disabled, onOpen }: { q: Task; disabled: boolean; onOpen: () => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: QUEST + q.id, disabled });
  return (
    <li ref={setNodeRef} style={{ opacity: isDragging ? 0.3 : 1 }}>
      <button
        type="button"
        draggable={false}
        {...attributes}
        {...listeners}
        onMouseDown={(e) => {
          listeners?.onMouseDown?.(e);
          e.stopPropagation();
        }}
        onTouchStart={(e) => {
          listeners?.onTouchStart?.(e);
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") return onOpen();
          listeners?.onKeyDown?.(e);
        }}
        onClick={onOpen}
        className="board-quest flex min-h-[28px] w-full touch-manipulation items-center gap-1.5 rounded-md px-1 py-[3px] text-left text-[13.5px]"
        style={{ color: "var(--t-ink)" }}
        title={q.title}
      >
        <QuestDot q={q} />
        <span className="min-w-0 flex-1 truncate">{q.title}</span>
      </button>
    </li>
  );
}
