"use client";

import { deleteQuestTemplateAction, saveQuestTemplateAction } from "@/app/actions";
import { CloseIcon } from "@/components/ui/Icons";
import type { QuestTemplate } from "@/lib/quest-templates";
import { useState } from "react";

/** The ready-made quests in the templates tray (new quests). The list itself loads in the dialog, which also applies a template. */
export function TemplateList({ templates, setTemplates, onApply, boardOptions }: { templates: QuestTemplate[]; setTemplates: React.Dispatch<React.SetStateAction<QuestTemplate[] | null>>; onApply: (t: QuestTemplate) => void; boardOptions: { id: string; label: string }[] | null }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {templates.map((t) => (
        <li key={t.id} className="flex items-center gap-1">
          <button type="button" onClick={() => onApply(t)} className="flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-lg px-2.5 py-1.5 text-left hover:bg-black/[.05]">
            <span className="truncate text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
              {t.name}
            </span>
            <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
              {[t.steps.length ? `${t.steps.length} steps` : null, t.estimateMinutes ? `${t.estimateMinutes} min` : null, t.boardId ? boardOptions?.find((o) => o.id === t.boardId)?.label : null].filter(Boolean).join(" · ")}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTemplates((l) => (l ?? []).filter((x) => x.id !== t.id));
              void deleteQuestTemplateAction(t.id).catch(() => {});
            }}
            aria-label={`Delete the ${t.name} template`}
            title="Delete this template"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[17px] leading-none hover:bg-black/[.06]"
            style={{ color: "var(--t-ink-soft)" }}
          >
            <CloseIcon size={10} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "Save as a template" under an existing quest. The quest's own fields come from `build()`. */
export function EditorSaveTemplate({ build, onSaved }: { build: () => QuestTemplate; onSaved: (list: QuestTemplate[]) => void }) {
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  function saveAsTemplate() {
    setTemplateNote(null);
    const tpl = build();
    saveQuestTemplateAction(tpl).then(
      (list) => {
        onSaved(list);
        setTemplateNote("Saved as a template ✓ — it's in the quest creator now");
      },
      (e) => setTemplateNote(e instanceof Error ? e.message : "Couldn't save the template.")
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 pl-7 text-[13px]">
      <button type="button" onClick={saveAsTemplate} className="underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }} title="Keep this quest (with its steps) as a ready-made one in the quest creator">
        📜 Save as a template
      </button>
      {templateNote && <span style={{ color: "var(--t-ink)" }}>{templateNote}</span>}
    </div>
  );
}
