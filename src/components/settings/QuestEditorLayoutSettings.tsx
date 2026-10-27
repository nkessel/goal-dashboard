"use client";

import { useSyncExternalStore } from "react";
import { DragList, ShownSwitch } from "./DragList";
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
          const folded = layout.folded.includes(k);
          return (
            <>
              <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: folded ? "var(--t-ink-soft)" : "var(--t-ink)" }}>
                {labelOf(k)}
              </span>
              <ShownSwitch hidden={folded} offLabel="Advanced" onToggle={() => toggle(k)} title={folded ? "Under Advanced settings — tap to show it straight away" : "Shown straight away — tap to fold it under Advanced settings"} />
            </>
          );
        }}
      />
      <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        The Advanced settings header sits where the first folded part is. A shown part placed after it stays in view just under the header, like Tags.
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
