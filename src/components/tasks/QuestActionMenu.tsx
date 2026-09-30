"use client";

import { useEffect, useRef } from "react";

export type QuestAction = "complete" | "battle" | "calendar" | "edit";

/**
 * The quest card's action list — opened from the card's icon (the blank
 * checkbox / portrait) or its ⋯ button. Closes on outside click or Escape.
 */
export function QuestActionMenu({
  isAdventure,
  inBattle,
  onCalendar,
  align,
  onPick,
  onClose,
}: {
  isAdventure: boolean;
  inBattle: boolean;
  onCalendar: boolean;
  /** Which edge of the anchor the menu lines up with. */
  align: "left" | "right";
  onPick: (action: QuestAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Defer so the click that opened the menu doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("pointerdown", onDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const items: { key: QuestAction; icon: string; label: string }[] = [
    { key: "complete", icon: "✓", label: isAdventure ? "Complete this quest" : "Complete this task" },
    {
      key: "battle",
      icon: inBattle ? "✕" : "⚔",
      label: isAdventure
        ? inBattle
          ? "Remove from Today's Battle"
          : "Add to Today's Battle"
        : inBattle
          ? "Remove from Today's Focus"
          : "Add to Today's Focus",
    },
    { key: "calendar", icon: "📅", label: onCalendar ? "Reschedule on calendar" : "Add to calendar" },
    { key: "edit", icon: "✎", label: isAdventure ? "Edit quest" : "Edit task" },
  ];

  return (
    <div
      ref={ref}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      className={`qa-menu absolute top-full z-40 mt-1.5 flex w-60 flex-col overflow-hidden rounded-xl py-1 shadow-2xl ${
        align === "right" ? "right-0" : "left-0"
      }`}
      style={{
        background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
        border: `1.5px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
        color: "var(--t-ink)",
      }}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="menuitem"
          onClick={() => onPick(it.key)}
          className="flex min-h-11 items-center gap-3 px-3.5 text-left text-[15px] hover:bg-black/5"
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
      ))}
    </div>
  );
}
