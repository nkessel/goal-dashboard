"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import type { Task } from "@/lib/data/types";

type Sort = "made" | "changed" | "due" | "xp" | "az";
const SORTS: { key: Sort; label: string }[] = [
  { key: "made", label: "Newest" },
  { key: "changed", label: "Last changed" },
  { key: "due", label: "Due soonest" },
  { key: "xp", label: "Most XP" },
  { key: "az", label: "A–Z" },
];
const KEY = "quest-list-sort";

function dueWords(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * All Quests › List (owner, Nov 4): every open quest in one list, in the order made by default,
 * or by last changed, due date, XP or name. The pick is remembered on this device; tap a quest to edit it.
 */
export function QuestList({ tasks, boards, isAdventure }: { tasks: Task[]; boards: Record<string, string>; isAdventure: boolean }) {
  const [sort, setSort] = useState<Sort>("made");
  const [editing, setEditing] = useState<Task | null>(null);
  const router = useRouter();
  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY) as Sort | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the remembered sort is only known in the browser
      if (s && SORTS.some((x) => x.key === s)) setSort(s);
    } catch {}
  }, []);
  const pick = (s: Sort) => {
    setSort(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {}
  };
  const shown = useMemo(() => {
    const t = [...tasks];
    const time = (s: string | null | undefined) => (s ? new Date(s).getTime() : Infinity);
    if (sort === "made") t.sort((a, b) => time(b.created_at) - time(a.created_at));
    if (sort === "changed") t.sort((a, b) => time(b.updated_at) - time(a.updated_at));
    if (sort === "due") t.sort((a, b) => time(a.due_at) - time(b.due_at));
    if (sort === "xp") t.sort((a, b) => b.xp_value - a.xp_value);
    if (sort === "az") t.sort((a, b) => a.title.localeCompare(b.title));
    return t;
  }, [tasks, sort]);
  const ink = isAdventure ? "#2a1c10" : "var(--t-ink)";
  const soft = isAdventure ? "#6b5631" : "var(--t-ink-soft)";
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sort quests">
        {SORTS.map((s) => {
          const on = s.key === sort;
          return (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(s.key)}
              className="h-8 rounded-full px-3 text-[13.5px] font-semibold"
              style={on ? { background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" } : { background: isAdventure ? "rgba(246,236,210,.14)" : "var(--t-card)", color: isAdventure ? "var(--t-cream)" : "var(--t-ink)", border: `1px solid ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}` }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p className="text-center text-[15px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.8 }}>
          No open quests. A clear road!
        </p>
      ) : (
        <ul key={sort} className={`m-0 flex list-none flex-col gap-1.5 rounded-2xl p-1.5 ${isAdventure ? "parchment" : ""}`} style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}>
          {shown.map((t) => {
            const img = (t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? t.icon_key : null;
            const board = t.board_id ? boards[t.board_id] : null;
            const due = dueWords(t.due_at);
            return (
              <li key={t.id} className="due-in">
                <button type="button" onClick={() => setEditing(t)} className="hover-glow flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ border: "1.5px solid #a58c66", background: "#f3e6c8" }}>
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <QuestMonogram id={t.id} title={t.title} size={36} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-[15px] leading-snug" style={{ color: ink }}>
                      {t.title}
                    </span>
                    {(board || due) && (
                      <span className="block truncate text-[12.5px]" style={{ color: soft }}>
                        {[board, due && `Due ${due}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: "var(--t-xp)" }}>
                    {t.xp_value} XP
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <EditTaskModal task={editing} theme={isAdventure ? "adventure" : "calm"} onClose={() => (setEditing(null), router.refresh())} />}
    </div>
  );
}
