"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "@/lib/use-escape";
import { GearIcon } from "@/components/ui/Icons";
import { SettingsPopup } from "@/components/ui/SettingsPopup";
import { arrangeMenu, readMenuLayout, serverMenuLayout, subscribeMenuLayout } from "@/lib/quest-menu-layout";

export type QuestAction = "edit" | "complete" | "focus" | "battle" | "snooze" | "offtoday" | "calendar" | "board" | "earlier" | "nextstep" | "sequence" | "delete";

/**
 * The quest card's action list — opened from the card's icon (the blank
 * checkbox / portrait) or its ⋯ button. Closes on outside click or Escape.
 */
export function QuestActionMenu({
  isAdventure,
  inBattle,
  isReward = false,
  onToday = true,
  onCalendar,
  canSnooze = false,
  onBoard = false,
  inSequence = false,
  align,
  anchor,
  onPick,
  onClose,
}: {
  /** Offer "Snooze until tomorrow" (quests on the Today screen). */
  canSnooze?: boolean;
  /** On a board: offer making it that project's next step. */
  onBoard?: boolean;
  /** Already part of a sequence (quests waiting behind it). */
  inSequence?: boolean;
  isAdventure: boolean;
  inBattle: boolean;
  /** The quest is a reward being claimed: "Complete this reward". */
  isReward?: boolean;
  /** Shown on the Today screen (Today's or Additional Quests) — offers taking it off. */
  onToday?: boolean;
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
  // The menu's own gear: its order and which items show, in a popup over it.
  const [layoutOpen, setLayoutOpen] = useState(false);
  // Order and hidden items, as chosen in Settings.
  const layout = useSyncExternalStore(subscribeMenuLayout, readMenuLayout, serverMenuLayout);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = 240;
      const h = ref.current?.offsetHeight ?? 260;
      let left = align === "right" ? r.right - w : r.left;
      left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
      // Just below the card when it fits; otherwise as low as it can sit without being cut off
      // (it may cover the navigation bar).
      const top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - h - 8));
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

  useEscape(() => !layoutOpen && onClose());

  useEffect(() => {
    function onDown(e: PointerEvent) {
      const el = e.target as Element | null;
      if (!ref.current || ref.current.contains(el as Node)) return;
      // Its settings popup is open over it: leave the menu be.
      if (layoutOpen) return;
      // Writing feedback about the menu keeps it open.
      if (el instanceof Element && el.closest("[data-feedback-root]")) return;
      onClose();
    }
    // Defer so the click that opened the menu doesn't immediately close it; capture, so
    // a card that stops the event (drag handles) still closes it.
    const t = setTimeout(() => document.addEventListener("pointerdown", onDown, true), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose, layoutOpen]);

  const allItems: { key: QuestAction; icon: React.ReactNode; label: string }[] = [
    { key: "edit", icon: <Glyph d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />, label: isReward ? "Edit reward" : isAdventure ? "Edit quest" : "Edit task" },
    { key: "complete", icon: "✓", label: isReward ? "Complete this reward" : isAdventure ? "Complete this quest" : "Complete this task" },
    { key: "focus", icon: <Glyph d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />, label: "Focus mode" },
    {
      key: "battle",
      icon: inBattle ? <Glyph d="M6 6l12 12M18 6L6 18" /> : <Glyph d="M5 19l9-9M14 5l5 0 0 5-9 9-5 0 0-5zM15 15l4 4" />,
      label: isAdventure
        ? inBattle
          ? "Remove from Today's Quests"
          : "Add to Today's Quests"
        : inBattle
          ? "Remove from Today's Focus"
          : "Add to Today's Focus",
    },
    ...(canSnooze ? [{ key: "snooze" as const, icon: <SnoozeGlyph />, label: "Snooze until tomorrow" }] : []),
    // In Additional Quests, taking it out of that list takes it off the Today screen.
    ...(onToday && !inBattle ? [{ key: "offtoday" as const, icon: <Glyph d="M4 13.5h4.2l1.8 2.6h4l1.8-2.6H20M4 13.5L6.3 6h11.4l2.3 7.5V19H4z" />, label: isAdventure ? "Remove from Additional Quests" : "Remove from More tasks" }] : []),
    { key: "calendar", icon: <Glyph d="M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4" />, label: onCalendar ? "Reschedule on calendar" : "Schedule on calendar" },
    ...(onBoard && !isReward ? [{ key: "board" as const, icon: <Glyph d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" />, label: "See quest in its board" }] : []),
    ...(!isReward
      ? [
          { key: "sequence" as const, icon: <StackGlyph />, label: inSequence ? "Edit the sequence…" : "Create a sequence…" },
        ]
      : []),
    ...(onBoard && !isReward ? [{ key: "nextstep" as const, icon: <Glyph d="M5 12h12M13 7l5 5-5 5" />, label: "Make it the board's next step" }] : []),
    ...(!isReward ? [{ key: "earlier" as const, icon: <Glyph d="M12 7v5l3 2M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3h3" />, label: "Already completed…" }] : []),
    { key: "delete", icon: <Glyph d="M5 7h14M10 4h4M7 7l1 13h8l1-13M10.5 11v5.5M13.5 11v5.5" />, label: isReward ? "Delete reward" : isAdventure ? "Delete quest" : "Delete task" },
  ];

  const items = arrangeMenu(allItems, layout);

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
        <>
        <button
          type="button"
          onClick={() => setLayoutOpen(true)}
          aria-label="Arrange this menu: order and which items show"
          title="Arrange this menu"
          className="absolute right-1.5 top-1.5 z-[1] flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5"
          style={{ color: "var(--t-ink-soft)" }}
        >
          <GearIcon size={15} />
        </button>
        {items.map((it, i) => (
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
                background: it.key === "complete" ? (isAdventure ? "var(--t-xp)" : "var(--t-good)") : "transparent",
                color: it.key === "complete" ? "#fff" : "var(--t-ink-soft)",
              }}
            >
              {it.icon}
            </span>
            <span className={i === 0 ? "pr-7" : undefined}>{it.label}</span>
          </button>
        ))}
        </>
      )}
      {layoutOpen && <SettingsPopup spot="menus.quest-card" onClose={() => setLayoutOpen(false)} />}
    </div>,
    document.body
  );
}

/** A flat line icon in the menu's ink colour. */
function Glyph({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Cards stacked one behind another. */
export function StackGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="9" width="16" height="11" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 6h11M9 3h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Snooze: a little clock with "z"s. */
export function SnoozeGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="13" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 9.5V13l2.2 1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 3h4l-4 4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
