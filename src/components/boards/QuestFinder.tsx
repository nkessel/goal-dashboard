"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { findQuestsAction, listArchivedQuestsAction, questForEditAction, restoreArchivedQuestAction } from "@/app/actions";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { Fold } from "@/components/ui/Fold";
import type { Task } from "@/lib/data/types";

/**
 * Find a quest from the boards list (owner, Nov 3: "search for quests on the boards list"): type, and the
 * matching open quests show under the box; tap one to open it in its editor.
 */
export function QuestFinder({ isAdventure }: { isAdventure: boolean }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; title: string }[]>([]);
  const [editing, setEditing] = useState<Task | null>(null);
  const router = useRouter();
  const term = q.trim();
  useEffect(() => {
    if (!term) return;
    let live = true;
    const t = setTimeout(() => findQuestsAction(term).then((r) => live && setFound(r), () => {}), 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term]);
  const shown = term ? found : [];
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex h-11 items-center gap-2 rounded-full px-4" style={{ background: isAdventure ? "rgba(246,236,210,.92)" : "var(--t-card)", border: `1px solid ${isAdventure ? "#a88a3f" : "var(--t-card-border)"}`, boxShadow: "inset 0 1px 3px rgba(60,40,10,.18)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#7a6034" }}>
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.2" />
          <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Find a quest…"
          aria-label="Find a quest"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none"
          style={{ color: "#2a1c10" }}
        />
      </label>
      <Fold open={shown.length > 0 || (!!term && found.length === 0)}>
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl p-1" style={{ background: "rgba(246,236,210,.96)", border: "1px solid #a88a3f" }}>
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-[14px] italic" style={{ color: "#6b5631" }}>
              No open quest by that name.
            </li>
          ) : (
            shown.map((f) => (
              <li key={f.id} className="due-in">
                <button type="button" onClick={() => questForEditAction(f.id).then((t) => t && setEditing(t), () => {})} className="hover-glow flex min-h-10 w-full items-center rounded-xl px-3 text-left text-[15px]" style={{ color: "#2a1c10" }}>
                  <span className="truncate">{f.title}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </Fold>
      {editing && <EditTaskModal task={editing} theme={isAdventure ? "adventure" : "calm"} onClose={() => (setEditing(null), router.refresh())} />}
    </div>
  );
}

/** Quests you archived instead of deleting, ready to bring back (a fold at the bottom of the boards list). */
export function ArchivedQuests({ isAdventure }: { isAdventure: boolean }) {
  const [list, setList] = useState<{ id: string; title: string; at: string; steps: number }[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    listArchivedQuestsAction().then(setList, () => setList([]));
  }, []);
  if (!list || list.length === 0) return note ? <p className="m-0 text-[13px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}>{note}</p> : null;
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1.5 self-start text-[14px] font-semibold" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>
          <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Archived quests <span className="font-normal opacity-70">({list.length})</span>
      </button>
      <Fold open={open}>
        <ul className="m-0 flex list-none flex-col gap-1 rounded-2xl p-2" style={{ background: "rgba(246,236,210,.94)", border: "1px solid #a88a3f" }}>
          {list.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-2 py-1">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px]" style={{ color: "#2a1c10" }}>{a.title}</span>
                <span className="text-[12px]" style={{ color: "#6b5631" }}>
                  archived {new Date(a.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  {a.steps ? ` · with its steps` : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={!!busy}
                onClick={async () => {
                  setBusy(a.id);
                  try {
                    const r = await restoreArchivedQuestAction(a.id);
                    setList((l) => (l ?? []).filter((x) => x.id !== a.id));
                    setNote(`“${r.title}” is back.`);
                    router.refresh();
                  } catch (e) {
                    setNote(e instanceof Error ? e.message : "Couldn't bring it back.");
                  } finally {
                    setBusy(null);
                  }
                }}
                className="h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold disabled:opacity-60"
                style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}
              >
                {busy === a.id ? "…" : "Bring back"}
              </button>
            </li>
          ))}
        </ul>
      </Fold>
      {note && <p className="m-0 text-[13px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}>{note}</p>}
    </div>
  );
}
