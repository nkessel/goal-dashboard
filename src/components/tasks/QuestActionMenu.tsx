"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "@/lib/use-escape";

export type QuestAction = "edit" | "complete" | "battle" | "calendar" | "delete";

/**
 * The quest card's action list — opened from the card's icon (the blank
 * checkbox / portrait) or its ⋯ button. Closes on outside click or Escape.
 */
export function QuestActionMenu({
  isAdventure,
  inBattle,
  onCalendar,
  align,
  anchor,
  onPick,
  onClose,
}: {
  isAdventure: boolean;
  inBattle: boolean;
  onCalendar: boolean;
  /** Which edge of the anchor the menu lines up with. */
  align: "left" | "right";
  /** Element the menu opens from; the menu is portaled to <body> so nothing can cover it. */
  anchor: HTMLElement | null;
  onPick: (action: QuestAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = 240;
      const h = ref.current?.offsetHeight ?? 260;
      let left = align === "right" ? r.right - w : r.left;
      left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
      setPos({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, align, confirmDelete]);

  useEscape(onClose);

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    // Defer so the click that opened the menu doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("pointerdown", onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  const items: { key: QuestAction; icon: string; label: string }[] = [
    { key: "edit", icon: "✎", label: isAdventure ? "Edit quest" : "Edit task" },
    { key: "complete", icon: "✓", label: isAdventure ? "Complete this quest" : "Complete this task" },
    {
      key: "battle",
      icon: inBattle ? "✕" : "⚔",
      label: isAdventure
        ? inBattle
          ? "Remove from Today's Quests"
          : "Add to Today's Quests"
        : inBattle
          ? "Remove from Today's Focus"
          : "Add to Today's Focus",
    },
    { key: "calendar", icon: "📅", label: onCalendar ? "Reschedule on calendar" : "Add to calendar" },
    { key: "delete", icon: "🗑", label: isAdventure ? "Delete quest" : "Delete task" },
  ];

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="qa-menu fixed z-[70] flex w-60 flex-col overflow-hidden rounded-xl py-1 parchment shadow-2xl"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
        border: `1.5px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
        color: "var(--t-ink)",
      }}
    >
      {confirmDelete ? (
        <div className="flex flex-col gap-2 p-3 text-sm">
          <p className="font-semibold">{isAdventure ? "Delete this quest for good?" : "Delete this task for good?"}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="h-9 rounded-full px-3" style={{ color: "var(--t-ink-soft)" }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onPick("delete")}
              className="h-9 rounded-full px-4 font-semibold"
              style={{ background: "var(--t-warn)", color: "#fff" }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            onClick={() => (it.key === "delete" ? setConfirmDelete(true) : onPick(it.key))}
            className={`flex min-h-11 items-center gap-3 px-3.5 text-left text-[15px] hover:bg-black/5 ${it.key === "delete" ? "border-t" : ""}`}
            style={{
              color: it.key === "delete" ? "var(--t-warn)" : undefined,
              borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
            }}
          >
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
              style={{
                background: it.key === "complete" ? (isAdventure ? "var(--t-xp)" : "var(--t-good)") : "rgba(0,0,0,.06)",
                color: it.key === "complete" ? "#fff" : "var(--t-ink)",
              }}
            >
              {it.icon}
            </span>
            {it.label}
          </button>
        ))
      )}
    </div>,
    document.body
  );
}
