"use client";

import { Fold } from "@/components/ui/Fold";
import { useContext, useState } from "react";
import { createBoardQuickAction } from "@/app/actions";
import type { ImportCard } from "@/lib/data/import-cards";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { Attrs, BoardOpt, BoardsCtx, findBoard, tinyAttrs } from "./types";
import { Question } from "./Ask";

/** The card's board for now: what was picked on it, else the note's suggestion. */
export const boardOf = (boards: BoardOpt[], card: ImportCard, attrs: Attrs) => {
  const id = attrs.board === undefined ? (findBoard(boards, card.board_hint)?.id ?? null) : attrs.board;
  return boards.find((b) => b.id === id) ?? null;
};

/** A blank portrait with the board's tag on it, as on a quest card and in the quest editor; the tag opens the board list. */
export function PortraitBoard({ card, attrs, small = false, open, onToggle, onAttrs }: { card: ImportCard; attrs: Attrs; small?: boolean; open: boolean; onToggle: () => void; onAttrs: (a: Attrs) => void }) {
  const { boards } = useContext(BoardsCtx);
  const board = boardOf(boards, card, attrs);
  const size = small ? 40 : 60;
  return (
    <div className="relative flex shrink-0 flex-col items-center" style={{ width: small ? 64 : size + 8, paddingTop: 9 }} data-import-portrait>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Board: ${board ? board.title : "none"}. Change it`}
        title={board ? `${board.title}: change the board` : "Pick a board"}
        className={`absolute left-1/2 top-0 z-[2] flex ${small ? "max-w-[64px] text-[10px]" : "max-w-[92px] text-[11px]"} -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-[1px] font-semibold`}
        style={{ background: "#f6ecd2", border: board ? "1px solid #a58c66" : "1px dashed #a58c66", color: "#3b2a14", boxShadow: open ? "0 0 0 2px #f3d98d, 0 1px 2px rgba(0,0,0,.25)" : "0 1px 2px rgba(0,0,0,.25)" }}
      >
        <span className="truncate">{board ? board.title : "+ board"}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}>
          <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="block" style={{ width: size, height: size }}>
        <QuestMonogram id={card.id} title={card.title} size={size} />
      </span>
      {/* Tiny under the portrait, exactly as in the quest editor (owner, Nov 14). */}
      <label className={`mt-1 flex cursor-pointer items-center gap-1 whitespace-nowrap ${small ? "text-[10.5px]" : "text-[11.5px]"}`} style={{ color: "var(--t-ink-soft, #6b5631)" }} title="Tiny tasks show half height on Today, with just a check box unless they have a portrait">
        <input type="checkbox" checked={!!attrs.tiny} onChange={(e) => onAttrs(tinyAttrs(attrs, e.target.checked))} className="h-3.5 w-3.5" style={{ accentColor: "#7a5f2a" }} />
        Tiny task
      </label>
    </div>
  );
}

/** The board list, folding open under the card's head. */
export function BoardFold({ card, attrs, open, onAttrs, onClose }: { card: ImportCard; attrs: Attrs; open: boolean; onAttrs: (a: Attrs) => void; onClose: () => void }) {
  const { boards, add } = useContext(BoardsCtx);
  const board = boardOf(boards, card, attrs);
  return (
    <Fold open={open}>
      <BoardTree boards={boards} value={board?.id ?? null} onPick={(id) => (onAttrs({ ...attrs, board: id }), onClose())} onCreate={(b) => (add(b), onAttrs({ ...attrs, board: b.id }), onClose())} />
    </Fold>
  );
}

/**
 * Every board to choose from (owner, Nov 12): boards with boards inside start folded, say how many they hold
 * and open on their caret; type to find one anywhere, or make a new one from what you typed.
 */
export function BoardTree({ boards, value, onPick, onCreate }: { boards: BoardOpt[]; value: string | null; onPick: (id: string | null) => void; onCreate: (b: BoardOpt) => void }) {
  const [q, setQ] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [making, setMaking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ids = new Set(boards.map((b) => b.id));
  const kids = (id: string | null) => boards.filter((b) => (b.parent && ids.has(b.parent) ? b.parent : null) === id);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? boards.filter((b) => words.every((w) => b.title.toLowerCase().includes(w))).slice(0, 12) : [];
  const exact = boards.some((b) => b.title.toLowerCase() === q.trim().toLowerCase());
  async function create() {
    if (making) return;
    setMaking(true);
    setErr(null);
    try {
      onCreate(await createBoardQuickAction(q));
      setQ("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't make that board.");
    } finally {
      setMaking(false);
    }
  }
  const row = (b: BoardOpt, depth: number): React.ReactNode => {
    const inside = words.length ? [] : kids(b.id);
    const isOpen = openIds.includes(b.id);
    return (
      <li key={b.id} className="flex list-none flex-col">
        <div className="flex items-center" style={{ paddingLeft: depth * 16 }}>
          <button type="button" onClick={() => onPick(b.id)} aria-pressed={value === b.id} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-[14px] hover:bg-black/[.05]" style={{ background: value === b.id ? "rgba(217,180,95,.35)" : undefined, color: "#2a1c10", fontWeight: value === b.id ? 600 : 400 }}>
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color || "#b8a788" }} />
            <span className="truncate">{b.title}</span>
          </button>
          {inside.length > 0 && (
            <button type="button" onClick={() => setOpenIds((o) => (isOpen ? o.filter((x) => x !== b.id) : [...o, b.id]))} aria-expanded={isOpen} aria-label={`${b.title}: ${inside.length} ${inside.length === 1 ? "board" : "boards"} inside`} className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] hover:bg-black/[.05]" style={{ color: "#7a6440" }}>
              {inside.length} {inside.length === 1 ? "board" : "boards"}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}>
                <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
        {inside.length > 0 && (
          <Fold open={isOpen}>
            <ul className="m-0 flex list-none flex-col p-0">{inside.map((k) => row(k, depth + 1))}</ul>
          </Fold>
        )}
      </li>
    );
  };
  return (
    <div className="qe-fact-panel flex flex-col gap-1 rounded-2xl p-2" data-import-boards>
      <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && hits[0] && onPick(hits[0].id)} placeholder="Find a board…" aria-label="Find a board" className="h-9 rounded-lg border px-2.5 text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.85)", color: "#2a1c10" }} />
      <ul className="m-0 flex max-h-[264px] list-none flex-col overflow-y-auto p-0">
        {(words.length ? hits : kids(null)).map((b) => row(b, 0))}
        {!words.length && (
          <li className="list-none">
            <button type="button" onClick={() => onPick(null)} aria-pressed={value === null} className="flex h-9 w-full items-center rounded-lg px-2 text-left text-[14px] italic hover:bg-black/[.05]" style={{ color: "#6b5631", background: value === null ? "rgba(217,180,95,.35)" : undefined }}>
              No board
            </button>
          </li>
        )}
        {words.length > 0 && !exact && (
          <li className="list-none">
            <button type="button" onClick={create} disabled={making} className="flex h-9 w-full items-center rounded-lg px-2 text-left text-[14px] font-semibold hover:bg-black/[.05]" style={{ color: "#8a6116" }}>
              + New board “{q.trim()}”
            </button>
          </li>
        )}
      </ul>
      {err && (
        <span className="text-[12.5px]" style={{ color: "#8b2c1a" }}>
          {err}
        </span>
      )}
    </div>
  );
}

export function BoardStep({ boards, hint, value, onPick, onCreate, bare = false }: { boards: BoardOpt[]; hint: string | null; value: string | null | undefined; onPick: (id: string | null) => void; onCreate?: (b: BoardOpt) => void; /** Inside another form: no question, no autofocus, and the chosen board stays listed. */ bare?: boolean }) {
  const suggested = findBoard(boards, hint);
  const [q, setQ] = useState(hint && !suggested ? hint : "");
  const [making, setMaking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? boards.filter((b) => words.every((w) => b.title.toLowerCase().includes(w))) : [];
  // Typing: the matches. Not typing: the suggested one and a few others, one per line.
  const chosen = boards.find((b) => b.id === value);
  const shown = words.length ? hits.slice(0, 8) : [...new Map([...(chosen ? [chosen] : []), ...(suggested ? [suggested] : []), ...boards].map((b) => [b.id, b])).values()].slice(0, 5);
  const exact = boards.some((b) => b.title.toLowerCase() === q.trim().toLowerCase());
  async function create() {
    if (making) return;
    setMaking(true);
    setErr(null);
    try {
      onCreate?.(await createBoardQuickAction(q));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't make that board.");
      setMaking(false);
    }
  }
  const row = "flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-[15px]";
  return (
    <>
      {!bare && <Question>Which board does it belong on?</Question>}
      <input
        autoFocus={!bare}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (hits[0]) onPick(hits[0].id);
          else if (q.trim()) create();
        }}
        placeholder={`Type a board (${boards.length} boards)…`}
        aria-label="Find a board"
        className="h-11 rounded-xl px-3 text-[16px] outline-none"
        style={{ background: "rgba(255,250,238,.85)", border: "1px solid #b39a6a", color: "#2a1c10" }}
      />
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {shown.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => onPick(b.id)} className={row} style={{ background: value === b.id ? "rgba(217,180,95,.25)" : "transparent", color: "#2a1c10" }}>
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color ?? "#c8b38a" }} />
              <span className="min-w-0 flex-1 truncate">{b.title}</span>
              {b.id === suggested?.id && (
                <span className="text-[12px] italic" style={{ color: "#7a6440" }}>
                  suggested
                </span>
              )}
            </button>
          </li>
        ))}
        {onCreate && q.trim() && !exact && (
          <li>
            <button type="button" onClick={create} disabled={making} className={row} style={{ color: "#6b4c12" }}>
              <span aria-hidden className="w-2.5 text-center">+</span>
              <span className="min-w-0 flex-1 truncate">{making ? "Making it…" : <>New board “{q.trim()}”</>}</span>
            </button>
          </li>
        )}
        <li>
          <button type="button" onClick={() => onPick(null)} className={row} style={{ color: "#7a6440", background: value === null ? "rgba(217,180,95,.25)" : "transparent" }}>
            <span aria-hidden className="w-2.5 text-center">–</span>
            No board
          </button>
        </li>
      </ul>
      {err && (
        <p className="m-0 text-[12.5px]" style={{ color: "#8b2c1a" }}>
          {err}
        </p>
      )}
    </>
  );
}
