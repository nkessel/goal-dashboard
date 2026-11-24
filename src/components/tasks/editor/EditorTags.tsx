"use client";

import { useState } from "react";
import { setTaskTagsAction } from "@/app/actions";
import { CloseIcon } from "@/components/ui/Icons";

/** Tags: a few words that sort quests across boards (and feed the life wheel). The list itself stays with the dialog, which saves and drafts it. */
export function EditorTags({ tags, setTags, taskId, knownTags, fieldStyle }: { tags: string[]; setTags: (t: string[]) => void; taskId: string | null; knownTags: string[]; fieldStyle: React.CSSProperties }) {
  const [tagText, setTagText] = useState("");
  function commitTags(next: string[]) {
    const clean = [...new Set(next.map((t) => t.replace(/^#/, "").trim().toLowerCase()).filter(Boolean))].slice(0, 12);
    setTags(clean);
    if (taskId) void setTaskTagsAction(taskId, clean).catch(() => {});
  }
  function addTag(raw: string) {
    const parts = raw.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length) commitTags([...tags, ...parts]);
    setTagText("");
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-7 text-[13px]">
      {tags.map((t) => (
        <span key={t} className="flex h-7 items-center gap-0.5 rounded-full pl-2.5 pr-0.5" style={{ background: "rgba(217,180,95,.22)", border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink)" }}>
          #{t}
          <button type="button" onClick={() => commitTags(tags.filter((x) => x !== t))} aria-label={`Remove the tag ${t}`} className="flex h-6 w-6 items-center justify-center rounded-full text-[14px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
            <CloseIcon size={9} />
          </button>
        </span>
      ))}
      <input
        value={tagText}
        list="qe-known-tags"
        onChange={(e) => {
          const v = e.target.value;
          if (/[,\n]/.test(v)) addTag(v);
          else setTagText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && tagText.trim()) {
            e.preventDefault();
            addTag(tagText);
          }
          if (e.key === "Backspace" && !tagText && tags.length) commitTags(tags.slice(0, -1));
        }}
        onBlur={() => tagText.trim() && addTag(tagText)}
        placeholder={tags.length ? "+ tag" : "Tags (e.g. health, learning)"}
        aria-label="Add a tag"
        className="h-7 min-w-[110px] flex-1 rounded-full border px-2.5 text-[13px]"
        style={fieldStyle}
      />
      <datalist id="qe-known-tags">
        {knownTags.filter((t) => !tags.includes(t)).slice(0, 30).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
