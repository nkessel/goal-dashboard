"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { boardFolderAction } from "@/app/actions";

const INK = "#2a1c10";
const SOFT = "#6b5631";

/**
 * A quest card's board tag, opened (owner, Nov 12): the board's name, what's on it (this quest marked,
 * its sub-boards counted) and "See quest in board ›", which opens the board with this quest glowing.
 * Floats under the tag; a tap outside or Escape closes it.
 */
export function BoardCard({ boardId, label, taskId, anchor, onClose }: { boardId: string; label: string; taskId: string; anchor: DOMRect; onClose: () => void }) {
  const router = useRouter();
  const [info, setInfo] = useState<{ quests: { id: string; title: string }[]; boards: number } | null>(null);
  const [growing, setGrowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    let live = true;
    boardFolderAction(boardId).then(
      (f) => live && setInfo({ quests: f.quests.map((t) => ({ id: t.id, title: t.title })), boards: f.subBoards.length }),
      () => live && setInfo({ quests: [], boards: 0 })
    );
    return () => {
      live = false;
    };
  }, [boardId]);

  // Under the tag, kept on the screen (above it when there's no room below).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, anchor.left));
    const below = anchor.bottom + 8;
    const top = below + h > window.innerHeight - 8 && anchor.top - h - 8 > 8 ? anchor.top - h - 8 : Math.min(below, Math.max(8, window.innerHeight - h - 8));
    setAt({ left, top });
  }, [anchor, info]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const scroll = () => onClose();
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll);
    };
  }, [onClose]);

  const name = label.split(" › ").pop() ?? label;
  const n = info?.quests.length ?? 0;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Board: ${name}`}
      data-board-card
      onClick={(e) => e.stopPropagation()}
      className={`board-card card-pop-in fixed z-[70] w-[270px] max-w-[calc(100vw-16px)] rounded-xl p-2.5 ${growing ? "board-card-grow" : ""}`}
      style={{ left: at?.left ?? anchor.left, top: at?.top ?? anchor.bottom + 8, visibility: at ? "visible" : "hidden", background: "#fff8e6", border: "1px solid #a88a3f", color: INK, boxShadow: "0 10px 28px rgba(0,0,0,.35)", transformOrigin: "20% 0" }}
    >
      <div className="font-display text-[15px] leading-tight">{name}</div>
      <div className="mb-1.5 mt-0.5 min-h-[17px] text-[12.5px]" style={{ color: SOFT }}>
        {info === null ? "…" : [n === 1 ? "1 quest" : `${n} quests`, info.boards ? (info.boards === 1 ? "1 board" : `${info.boards} boards`) : null].filter(Boolean).join(" · ")}
      </div>
      {info && n > 0 && (
        <ul className="m-0 mb-2 flex max-h-[168px] list-none flex-col overflow-y-auto p-0">
          {info.quests.map((t) => (
            <li key={t.id} className="flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-[13.5px] leading-tight" style={t.id === taskId ? { background: "rgba(242,213,138,.55)", fontWeight: 600 } : undefined}>
              <span aria-hidden className="text-[9px]" style={{ color: t.id === taskId ? "#8a6116" : "rgba(107,86,49,.6)" }}>
                ◆
              </span>
              <span className="truncate py-1">{t.title}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => {
          setGrowing(true);
          setTimeout(() => {
            onClose();
            router.push(`/boards/${boardId}?q=${taskId}`);
          }, 200);
        }}
        className="font-display flex h-10 w-full items-center justify-center rounded-full text-[14.5px]"
        style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: INK }}
      >
        See quest in board ›
      </button>
    </div>,
    document.body
  );
}
