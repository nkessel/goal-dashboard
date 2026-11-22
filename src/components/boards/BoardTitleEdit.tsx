"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { renameBoardAction } from "@/app/actions";

/**
 * The open board's title at its top, editable where it sits (owner, Nov 20:
 * "Why can't I edit the board title"). Tap it to type; Enter or tapping away
 * saves, Escape puts it back. Same look while typing: no box, a thin gold line.
 */
export function BoardTitleEdit({ boardId, title }: { boardId: string; title: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [shown, setShown] = useState(title);
  const [, start] = useTransition();
  const cancelled = useRef(false);

  function save() {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      setValue(shown);
      return;
    }
    const t = value.trim();
    if (!t || t === shown) {
      setValue(shown);
      return;
    }
    const before = shown;
    setShown(t);
    start(async () => {
      try {
        await renameBoardAction(boardId, t);
        router.refresh();
      } catch {
        setShown(before);
        setValue(before);
      }
    });
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        aria-label="Board title"
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        className="bare-input m-0 w-full min-w-0 bg-transparent p-0 outline-none"
        style={{ font: "inherit", color: "inherit", letterSpacing: "inherit", borderBottom: "1px solid rgba(217,180,95,.7)" }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setValue(shown);
        setEditing(true);
      }}
      title="Tap to rename"
      data-board-rename
      className="m-0 cursor-text p-0 text-left"
      style={{ font: "inherit", color: "inherit", letterSpacing: "inherit", background: "none", border: 0 }}
    >
      {shown}
    </button>
  );
}
