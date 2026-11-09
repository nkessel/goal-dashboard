"use client";

import { useEffect, useRef, useState } from "react";
import { boardFolderAction, listBoardOptionsAction } from "@/app/actions";

const INK = "#2a1c10";
const SOFT = "#6b5631";

/**
 * The quest editor's board card (owner, Nov 9: board button ideas A + D). Tapping the board label
 * on the portrait folds this open right under it: the board's name, how many quests it holds and
 * its next step, a big "See quest in board ›" (the card swells and the board opens over the screen
 * with this quest glowing), and the board's own choices: move it to another board, or also show
 * it on one.
 */
export function BoardCard({
  boardId,
  label,
  taskId,
  onSeeInBoard,
  onMove,
  onAlsoOn,
}: {
  boardId: string;
  label: string;
  /** The quest being edited (null while it's new: nothing to show on the board yet). */
  taskId: string | null;
  onSeeInBoard: () => void;
  onMove: (id: string, label: string) => void;
  onAlsoOn: () => void;
}) {
  const [info, setInfo] = useState<{ count: number; next: string | null } | null>(null);
  const [moving, setMoving] = useState(false);
  const [boards, setBoards] = useState<{ id: string; label: string }[] | null>(null);
  const [q, setQ] = useState("");
  const [growing, setGrowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    boardFolderAction(boardId).then(
      (f) => live && setInfo({ count: f.quests.length, next: f.quests.find((t) => t.id !== taskId)?.title ?? null }),
      () => live && setInfo({ count: 0, next: null })
    );
    return () => {
      live = false;
    };
  }, [boardId, taskId]);

  useEffect(() => {
    if (!moving || boards) return;
    let live = true;
    listBoardOptionsAction().then((b) => live && setBoards(b), () => live && setBoards([]));
    return () => {
      live = false;
    };
  }, [moving, boards]);

  const words = q.trim().toLowerCase();
  const shown = (boards ?? []).filter((b) => b.id !== boardId && (!words || b.label.toLowerCase().includes(words))).slice(0, 7);
  const name = label.split(" › ").pop() ?? label;

  return (
    <div ref={ref} className={`board-card relative mt-1 rounded-xl p-2.5 ${growing ? "board-card-grow" : ""}`} style={{ background: "#fff8e6", border: "1px solid #a88a3f", color: INK, transformOrigin: "50% 30%" }}>
      <span aria-hidden className="absolute -top-[7px] left-[30px] h-3 w-3 rotate-45" style={{ background: "#fff8e6", borderLeft: "1px solid #a88a3f", borderTop: "1px solid #a88a3f" }} />
      <div className="font-display text-[14.5px] leading-tight">{name}</div>
      <div className="mb-2 mt-0.5 min-h-[17px] text-[12.5px]" style={{ color: SOFT }}>
        {info === null ? "…" : `${info.count === 1 ? "1 quest" : `${info.count} quests`}${info.next ? ` · next: ${info.next}` : ""}`}
      </div>
      {taskId && (
        <button
          type="button"
          onClick={() => {
            setGrowing(true);
            setTimeout(onSeeInBoard, 200);
          }}
          className="font-display flex h-10 w-full items-center justify-center rounded-full text-[14.5px]"
          style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: INK }}
        >
          See quest in board ›
        </button>
      )}
      <div className="mt-1.5 flex items-center justify-between text-[13px]" style={{ color: SOFT }}>
        <button type="button" onClick={() => setMoving((m) => !m)} aria-expanded={moving} className="flex h-8 items-center gap-1 rounded-full px-1.5 hover:bg-black/5">
          ⇄ Move to another board
        </button>
        <button type="button" onClick={onAlsoOn} className="flex h-8 items-center gap-1 rounded-full px-1.5 hover:bg-black/5">
          ＋ Also on…
        </button>
      </div>
      {moving && (
        <div className="reveal mt-1 flex flex-col">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown[0]) {
                e.preventDefault();
                onMove(shown[0].id, shown[0].label);
                setMoving(false);
              }
            }}
            placeholder="Find a board"
            aria-label="Find a board to move it to"
            className="bare-input mb-1 h-9 border-b bg-transparent px-1 text-[16px] outline-none"
            style={{ borderColor: "rgba(168,138,63,.6)" }}
          />
          {!boards && <span className="px-1 py-1.5 text-[13px]" style={{ color: SOFT }}>Finding your boards…</span>}
          {boards && !shown.length && <span className="px-1 py-1.5 text-[13px]" style={{ color: SOFT }}>No board by that name.</span>}
          <div className="flex max-h-[220px] flex-col overflow-y-auto">
            {shown.map((b) => (
              <button key={b.id} type="button" onClick={() => (onMove(b.id, b.label), setMoving(false))} className="flex min-h-9 items-center rounded-lg px-1 text-left text-[14px] hover:bg-black/5">
                <span className="truncate">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
