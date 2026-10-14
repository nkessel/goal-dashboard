"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Board, Task } from "@/lib/data/types";
import { addToMatrixAction } from "@/app/actions";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { BoardSeal } from "@/components/boards/BoardSeal";
import { useEscape } from "@/lib/use-escape";

/**
 * "+" in Not yet plotted: bring boards (plotted as one item) and quests that
 * were removed from the matrix back onto it.
 */
export function AddToMatrixSheet({
  boards,
  quests,
  openCountByBoard,
  theme,
  onClose,
  onAdded,
}: {
  /** Boards not on the matrix yet. */
  boards: Board[];
  /** Quests removed from the matrix. */
  quests: Task[];
  openCountByBoard: Map<string, number>;
  theme: "calm" | "adventure";
  onClose: () => void;
  onAdded: () => void;
}) {
  useEscape(() => onClose());
  const isAdventure = theme === "adventure";
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [hideQuests, setHideQuests] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const q = query.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q);
  const shownBoards = boards.filter((b) => matches(b.title));
  const shownQuests = quests.filter((t) => matches(t.title));
  const pickedBoards = boards.filter((b) => picked.has(`b:${b.id}`));
  const pickedQuestCount = quests.filter((t) => picked.has(`t:${t.id}`)).length;
  const boardQuestCount = pickedBoards.reduce((n, b) => n + (openCountByBoard.get(b.id) ?? 0), 0);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function add() {
    setError(null);
    startSaving(async () => {
      try {
        await addToMatrixAction({
          boardIds: pickedBoards.map((b) => b.id),
          taskIds: quests.filter((t) => picked.has(`t:${t.id}`)).map((t) => t.id),
          hideQuestsOfBoards: hideQuests,
        });
        onAdded();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add them.");
      }
    });
  }

  const total = pickedBoards.length + pickedQuestCount;
  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";

  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[52] flex items-end justify-center sm:items-center sm:p-4" style={{ background: "var(--t-overlay)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add to the matrix"
        onClick={(e) => e.stopPropagation()}
        className="create-sheet-in parchment parchment-framed flex max-h-[86svh] w-full max-w-lg flex-col gap-3 rounded-t-3xl p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-3xl"
        style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", color: ink }}
      >
        <div className="relative z-[1] flex items-center justify-between">
          <h3 className={`m-0 ${isAdventure ? "font-display text-[20px]" : "text-base font-bold"}`} style={{ color: ink }}>
            Add to the matrix
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center text-2xl leading-none" style={{ color: soft }}>
            ×
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search boards and quests"
          aria-label="Search"
          className="relative z-[1] w-full rounded-lg border px-3 py-2 text-[16px]"
          style={{ borderColor: isAdventure ? "rgba(139,112,64,.55)" : "var(--t-card-border)", background: isAdventure ? "rgba(255,250,238,.55)" : "var(--t-bg)", color: ink }}
        />

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <Group title="Boards" hint="Plotted as one item, e.g. a whole course instead of each assignment." empty={boards.length ? "No boards match." : "Every board is already on the matrix."} count={shownBoards.length}>
            {shownBoards.map((b) => (
              <Row
                key={b.id}
                checked={picked.has(`b:${b.id}`)}
                onToggle={() => toggle(`b:${b.id}`)}
                art={b.icon_key ? <img src={b.icon_key} alt="" className="h-full w-full object-cover" /> : <BoardSeal color={b.color} size={26} />}
                title={b.title}
                sub={`${openCountByBoard.get(b.id) ?? 0} open quests`}
                square
              />
            ))}
          </Group>
          <Group title="Quests removed from the matrix" empty={quests.length ? "No quests match." : "No quests have been removed."} count={shownQuests.length}>
            {shownQuests.map((t) => {
              const img = (t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? t.icon_key : null;
              return (
                <Row
                  key={t.id}
                  checked={picked.has(`t:${t.id}`)}
                  onToggle={() => toggle(`t:${t.id}`)}
                  art={img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <QuestMonogram id={t.id} title={t.title} size={40} />}
                  title={t.title}
                  sub={t.description ?? undefined}
                />
              );
            })}
          </Group>
        </div>

        {pickedBoards.length > 0 && boardQuestCount > 0 && (
          <label className="relative z-[1] flex items-start gap-2.5 text-[14.5px]" style={{ color: ink }}>
            <input type="checkbox" checked={hideQuests} onChange={(e) => setHideQuests(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#8a6c2c]" />
            <span>
              Also take {pickedBoards.length === 1 ? "its" : "their"} {boardQuestCount} quest{boardQuestCount === 1 ? "" : "s"} off the matrix
              <span className="block text-[12.5px]" style={{ color: soft }}>
                They stay on the board; bring any back with + later.
              </span>
            </span>
          </label>
        )}

        {error && (
          <p className="relative z-[1] m-0 text-[14px] font-semibold" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={add}
          disabled={!total || saving}
          className="relative z-[1] h-12 rounded-full text-[16px] font-bold disabled:opacity-50"
          style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
        >
          {saving ? "Adding…" : total ? `Add ${total} to the matrix` : "Pick boards or quests"}
        </button>
      </div>
    </div>,
    document.body
  );
}

function Group({ title, hint, empty, count, children }: { title: string; hint?: string; empty: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="m-0 text-[12px] font-bold uppercase tracking-wider" style={{ color: "var(--t-ink-soft)" }}>
        {title}
      </h4>
      {hint && (
        <p className="m-0 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
          {hint}
        </p>
      )}
      {count ? (
        <ul className="m-0 flex list-none flex-col p-0">{children}</ul>
      ) : (
        <p className="m-0 py-1 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
          {empty}
        </p>
      )}
    </section>
  );
}

function Row({ checked, onToggle, art, title, sub, square }: { checked: boolean; onToggle: () => void; art: React.ReactNode; title: string; sub?: string; square?: boolean }) {
  return (
    <li>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5" style={{ background: checked ? "rgba(217,180,95,.18)" : undefined }}>
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-5 w-5 shrink-0 accent-[#8a6c2c]" />
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden ${square ? "rounded-[10px]" : "rounded-full"}`}
          style={{ border: "2px solid #8a6c2c", background: "#f3e6c8" }}
        >
          {art}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
            {title}
          </span>
          {sub && (
            <span className="block truncate text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
              {sub}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
