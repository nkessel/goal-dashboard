"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_MENU_LAYOUT, MENU_ITEMS, readMenuLayout, saveMenuLayout, serverMenuLayout, subscribeMenuLayout } from "@/lib/quest-menu-layout";
import type { QuestAction } from "@/components/tasks/QuestActionMenu";

const labelOf = (k: QuestAction) => MENU_ITEMS.find((m) => m.key === k)?.label ?? k;

/** The quest card's ⋯ menu: move its items up and down, and hide the ones you don't use. */
export function QuestMenuSettings() {
  const layout = useSyncExternalStore(subscribeMenuLayout, readMenuLayout, serverMenuLayout);
  const isDefault = JSON.stringify(layout) === JSON.stringify(DEFAULT_MENU_LAYOUT);
  function move(i: number, dir: -1 | 1) {
    const order = [...layout.order];
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveMenuLayout({ ...layout, order });
  }
  function toggle(k: QuestAction) {
    const hidden = layout.hidden.includes(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k];
    saveMenuLayout({ ...layout, hidden });
  }
  const btn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] hover:bg-black/5 disabled:opacity-25";
  return (
    <div className="flex flex-col gap-1.5" style={{ color: "var(--t-ink)" }}>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {layout.order.map((k, i) => {
          const hidden = layout.hidden.includes(k);
          return (
            <li key={k} className="flex min-h-10 items-center gap-1 rounded-lg pl-2.5" style={{ border: "1px solid rgba(139,112,64,.3)", opacity: hidden ? 0.6 : 1 }}>
              <span className={`min-w-0 flex-1 truncate text-[13.5px] ${hidden ? "line-through" : ""}`}>{labelOf(k)}</span>
              {k !== "edit" && (
                <button type="button" role="switch" aria-checked={!hidden} onClick={() => toggle(k)} className="h-7 shrink-0 rounded-full px-2.5 text-[12px] font-semibold" style={hidden ? { border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink-soft)" } : { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}>
                  {hidden ? "Hidden" : "Shown"}
                </button>
              )}
              <button type="button" aria-label={`Move ${labelOf(k)} up`} disabled={i === 0} onClick={() => move(i, -1)} className={btn}>
                ↑
              </button>
              <button type="button" aria-label={`Move ${labelOf(k)} down`} disabled={i === layout.order.length - 1} onClick={() => move(i, 1)} className={btn}>
                ↓
              </button>
            </li>
          );
        })}
      </ol>
      <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        Some only show where they apply (Snooze on Today, Next step on a board).
        {!isDefault && (
          <>
            {" "}
            <button type="button" onClick={() => saveMenuLayout(null)} className="underline">
              Back to the usual menu
            </button>
          </>
        )}
      </p>
    </div>
  );
}
