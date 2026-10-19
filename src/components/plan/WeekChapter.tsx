"use client";

import { useState, useTransition } from "react";
import { getQuestForEditAction, setChapterTitleAction } from "@/app/actions";
import type { Task } from "@/lib/data/types";
import type { WeekChapter as Chapter } from "@/lib/data/planning";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

/**
 * This week as a chapter of your story: the three big rocks are its beats,
 * each lit up in gold once it's written (done). Name the chapter if you like.
 */
export function WeekChapter({ chapter, theme }: { chapter: Chapter; theme: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const [title, setTitle] = useState(chapter.title ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [opening, setOpening] = useState<Task | null>(null);
  const [, start] = useTransition();
  const written = chapter.beats.filter((b) => b.done).length;
  const all = written === chapter.beats.length;

  function saveTitle(v: string) {
    setEditingTitle(false);
    if (v.trim() === (chapter.title ?? "")) return;
    start(() => setChapterTitleAction(v).catch(() => {}));
  }
  function open(id: string) {
    start(async () => {
      const t = await getQuestForEditAction(id).catch(() => null);
      if (t) setOpening(t);
    });
  }

  const ink = isAdventure ? "#3b2a14" : "var(--t-ink)";
  const soft = isAdventure ? "#6b5631" : "var(--t-ink-soft)";

  return (
    <section
      aria-label={`Chapter ${chapter.number}`}
      className={`relative flex flex-col gap-2.5 rounded-2xl px-4 py-3.5 ${isAdventure ? "parchment parchment-framed" : ""} ${all ? "chapter-complete" : ""}`}
      style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
    >
      <div className="relative z-[1] flex items-baseline gap-2">
        <span className="shrink-0 text-[11.5px] font-bold uppercase tracking-[.18em]" style={{ color: isAdventure ? "#8a6116" : "var(--t-accent)" }}>
          Chapter {chapter.number}
        </span>
        <span aria-hidden className="h-px flex-1 self-center" style={{ background: "rgba(139,112,64,.35)" }} />
        <span className="shrink-0 text-[12.5px] tabular-nums" style={{ color: soft }}>
          {all ? "✦ Complete" : `${written} of ${chapter.beats.length} written`}
        </span>
      </div>
      {editingTitle ? (
        <input
          autoFocus
          defaultValue={title}
          maxLength={60}
          onBlur={(e) => {
            setTitle(e.target.value);
            saveTitle(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditingTitle(false);
          }}
          aria-label="Name this chapter"
          placeholder="The one where…"
          className="relative z-[1] -my-0.5 h-10 rounded-lg border px-2 text-[18px] italic"
          style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.7)", color: ink, fontFamily: "var(--font-display, inherit)" }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingTitle(true)}
          className={`inline-edit relative z-[1] -mx-1 -my-0.5 self-start rounded-md px-1 text-left ${isAdventure ? "font-display text-[20px]" : "text-[17px] font-bold"} italic leading-tight`}
          style={{ color: title ? ink : soft }}
          title="Name this chapter"
        >
          {title || "Name this week’s chapter…"}
        </button>
      )}

      <ol className="relative z-[1] m-0 grid list-none grid-cols-3 gap-2 p-0">
        {chapter.beats.map((b, i) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => open(b.id)}
              className="hover-glow flex h-full w-full flex-col items-center gap-1.5 rounded-xl px-1.5 py-2 text-center"
              style={{
                background: b.done ? "linear-gradient(180deg, rgba(246,220,142,.55), rgba(217,180,95,.3))" : isAdventure ? "rgba(255,250,238,.45)" : "var(--t-bg)",
                border: `1.5px solid ${b.done ? "#c9a24a" : "rgba(139,112,64,.28)"}`,
                boxShadow: b.done ? "0 0 12px rgba(242,210,126,.45)" : undefined,
              }}
            >
              <span className="relative h-11 w-11 overflow-hidden rounded-full" style={{ border: `2px solid ${b.done ? "#c9a24a" : "#a58c66"}`, background: "#f3e6c8", filter: b.done ? undefined : "saturate(.75)" }}>
                {b.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                  <img src={b.icon} alt="" className="h-full w-full object-cover" />
                ) : (
                  <QuestMonogram id={b.id} title={b.title} size={44} />
                )}
                {b.done && (
                  <span className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(42,28,16,.35)" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#f6dc8e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-[.1em]" style={{ color: soft }}>
                {["I", "II", "III"][i]}
              </span>
              <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug" style={{ color: ink }}>
                {b.title}
              </span>
              <span className="text-[11.5px] leading-tight" style={{ color: b.done ? "#3f6a2c" : soft }}>
                {b.done ? "Written ✓" : b.scheduledAt ? when(b.scheduledAt) : b.dueAt ? `Due ${new Date(b.dueAt).toLocaleDateString(undefined, { weekday: "short" })}` : "Needs a time"}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {opening && <EditTaskModal task={opening} theme={theme} onClose={() => setOpening(null)} />}
    </section>
  );
}
