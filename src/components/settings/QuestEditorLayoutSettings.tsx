"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_EDITOR_LAYOUT, EDITOR_PARTS, readEditorLayout, saveEditorLayout, serverEditorLayout, subscribeEditorLayout, type EditorPart } from "@/lib/quest-editor-layout";

const labelOf = (k: EditorPart) => EDITOR_PARTS.find((p) => p.key === k)?.label ?? k;

/**
 * The quest editor's parts, in order: move them up and down, and choose
 * which show straight away and which wait under "Advanced settings".
 */
export function QuestEditorLayoutSettings() {
  const layout = useSyncExternalStore(subscribeEditorLayout, readEditorLayout, serverEditorLayout);
  const isDefault = JSON.stringify(layout) === JSON.stringify(DEFAULT_EDITOR_LAYOUT);
  function move(i: number, dir: -1 | 1) {
    const order = [...layout.order];
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveEditorLayout({ ...layout, order });
  }
  function toggle(k: EditorPart) {
    const folded = layout.folded.includes(k) ? layout.folded.filter((x) => x !== k) : [...layout.folded, k];
    saveEditorLayout({ ...layout, folded });
  }
  const btn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] hover:bg-black/5 disabled:opacity-25";
  return (
    <div className="flex flex-col gap-1.5" style={{ color: "var(--t-ink)" }}>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {layout.order.map((k, i) => {
          const folded = layout.folded.includes(k);
          return (
            <li key={k} className="flex min-h-10 items-center gap-1 rounded-lg pl-2.5" style={{ border: "1px solid rgba(139,112,64,.3)", background: folded ? "transparent" : "rgba(217,180,95,.14)" }}>
              <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: folded ? "var(--t-ink-soft)" : "var(--t-ink)" }}>
                {labelOf(k)}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!folded}
                onClick={() => toggle(k)}
                title={folded ? "Under Advanced settings — tap to show it straight away" : "Shown straight away — tap to fold it under Advanced settings"}
                className="h-7 shrink-0 rounded-full px-2.5 text-[12px] font-semibold"
                style={folded ? { border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink-soft)" } : { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}
              >
                {folded ? "Advanced" : "Shown"}
              </button>
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
