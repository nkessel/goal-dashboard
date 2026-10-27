"use client";

import { useSyncExternalStore } from "react";
import { DragList } from "./DragList";
import { DEFAULT_EDITOR_LAYOUT, EDITOR_PARTS, readEditorLayout, saveEditorLayout, serverEditorLayout, subscribeEditorLayout, type EditorPart } from "@/lib/quest-editor-layout";

const labelOf = (k: EditorPart) => EDITOR_PARTS.find((p) => p.key === k)?.label ?? k;

/**
 * The quest editor's parts, in order: drag them into order, and choose
 * which show straight away and which wait under "Advanced settings".
 */
export function QuestEditorLayoutSettings() {
  const layout = useSyncExternalStore(subscribeEditorLayout, readEditorLayout, serverEditorLayout);
  const isDefault = JSON.stringify(layout) === JSON.stringify(DEFAULT_EDITOR_LAYOUT);
  function toggle(k: EditorPart) {
    const folded = layout.folded.includes(k) ? layout.folded.filter((x) => x !== k) : [...layout.folded, k];
    saveEditorLayout({ ...layout, folded });
  }
  return (
    <div className="flex flex-col gap-1.5" style={{ color: "var(--t-ink)" }}>
      <DragList
        id="quest-editor"
        ids={layout.order}
        onReorder={(order) => saveEditorLayout({ ...layout, order: order as EditorPart[] })}
        row={(key) => {
          const k = key as EditorPart;
          return { label: labelOf(k), toggle: { hidden: layout.folded.includes(k), offLabel: "Advanced", onToggle: () => toggle(k) } };
        }}
      />
      <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        Shown parts come first, in this order; the Advanced parts wait under their fold below them.
        {!isDefault && (
          <>
            {" "}
            <button type="button" onClick={() => saveEditorLayout(null)} className="underline">
              Back to the usual layout
            </button>
          </>
        )}
      </p>
    </div>
  );
}
