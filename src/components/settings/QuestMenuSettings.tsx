"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_MENU_LAYOUT, MENU_ITEMS, readMenuLayout, saveMenuLayout, serverMenuLayout, subscribeMenuLayout } from "@/lib/quest-menu-layout";
import type { QuestAction } from "@/components/tasks/QuestActionMenu";
import { DragList, ShownSwitch } from "./DragList";

const labelOf = (k: QuestAction) => MENU_ITEMS.find((m) => m.key === k)?.label ?? k;

/** The quest card's ⋯ menu: drag its items into order, and hide the ones you don't use. */
export function QuestMenuSettings() {
  const layout = useSyncExternalStore(subscribeMenuLayout, readMenuLayout, serverMenuLayout);
  const isDefault = JSON.stringify(layout) === JSON.stringify(DEFAULT_MENU_LAYOUT);
  function toggle(k: QuestAction) {
    const hidden = layout.hidden.includes(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k];
    saveMenuLayout({ ...layout, hidden });
  }
  return (
    <div className="flex flex-col gap-1.5" style={{ color: "var(--t-ink)" }}>
      <DragList
        id="menu-quest"
        ids={layout.order}
        onReorder={(order) => saveMenuLayout({ ...layout, order: order as QuestAction[] })}
        row={(key) => {
          const k = key as QuestAction;
          const hidden = layout.hidden.includes(k);
          return (
            <>
              <span className={`min-w-0 flex-1 truncate text-[13.5px] ${hidden ? "line-through opacity-60" : ""}`}>{labelOf(k)}</span>
              {k !== "edit" && <ShownSwitch hidden={hidden} onToggle={() => toggle(k)} />}
            </>
          );
        }}
      />
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
