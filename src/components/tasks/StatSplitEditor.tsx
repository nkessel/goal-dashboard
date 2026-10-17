"use client";

import { useEffect, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getStatsAction, setStatsAction } from "@/app/actions";
import { DEFAULT_STATS, cleanStatName, setShare, statAbbr, type StatSplit } from "@/lib/stats";


/**
 * "Stats" under a quest's XP reward: slide a share of the XP to each
 * character stat (all 0% by default). XP sent to stats doesn't fill the main
 * level meter. Past 100%, the other stats give up the difference equally.
 * Add your own stats and drag to reorder them (the order is yours everywhere).
 */
export function StatSplitEditor({
  xp,
  split,
  onChange,
  isAdventure,
}: {
  xp: number;
  split: StatSplit;
  onChange: (next: StatSplit) => void;
  isAdventure: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [stats, setStats] = useState<string[]>([...DEFAULT_STATS]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let live = true;
    getStatsAction()
      .then((r) => live && setStats(r.stats))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Stats named in this quest's split but no longer in the list still show.
  const shown = [...stats, ...Object.keys(split).filter((k) => !stats.includes(k))];
  const total = Object.values(split).reduce((a, b) => a + b, 0);
  const toStats = Math.round((xp * total) / 100);

  function saveStats(next: string[]) {
    setStats(next);
    void setStatsAction(next).catch(() => {});
  }
  function add() {
    const n = cleanStatName(name);
    setName("");
    setAdding(false);
    if (!n || stats.some((s) => s.toLowerCase() === n.toLowerCase())) return;
    saveStats([...stats, n]);
  }
  function drop(stat: string) {
    saveStats(stats.filter((s) => s !== stat));
    if (split[stat]) onChange(setShare(split, stat, 0));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = stats.indexOf(String(e.active.id));
    const to = stats.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    saveStats(arrayMove(stats, from, to));
  }

  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  return (
    <div className="flex flex-col gap-1.5 rounded-xl px-3 py-2" style={{ background: "rgba(70,50,20,.06)", border: "1px solid rgba(139,112,64,.25)" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-8 items-center gap-1.5 text-left">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined, color: soft }}>
          <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[14px] font-semibold" style={{ color: ink }}>
          Stats
        </span>
        <span className="ml-auto text-[12.5px] tabular-nums" style={{ color: soft }}>
          {total === 0 ? "all XP to your level" : `${toStats} XP to stats · ${xp - toStats} to your level`}
        </span>
      </button>

      {open && (
        <div className="reveal flex flex-col gap-1.5">
          <DndContext id="dnd-StatSplit" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={stats} strategy={verticalListSortingStrategy}>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {shown.map((stat) => (
                  <StatRow
                    key={stat}
                    stat={stat}
                    pct={split[stat] ?? 0}
                    xp={Math.round((xp * (split[stat] ?? 0)) / 100)}
                    sortable={stats.includes(stat)}
                    editing={editing}
                    isAdventure={isAdventure}
                    onPct={(p) => onChange(setShare(split, stat, p))}
                    onRemove={() => drop(stat)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {adding ? (
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add();
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setAdding(false);
                    }
                  }}
                  maxLength={24}
                  placeholder="New stat, e.g. Creativity"
                  className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[15px]"
                  style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: ink }}
                />
                <button type="button" onClick={add} className="h-9 rounded-full px-3 text-[13.5px] font-bold" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
                  Add
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px dashed rgba(139,112,64,.6)", color: ink }}>
                <span aria-hidden className="text-[15px] leading-none" style={{ color: "#8a6116" }}>
                  +
                </span>
                Add a stat
              </button>
            )}
            {!adding && (
              <button type="button" onClick={() => setEditing((v) => !v)} className="text-[13px] underline underline-offset-2" style={{ color: soft }}>
                {editing ? "Done" : "Edit list"}
              </button>
            )}
            {total > 0 && !adding && (
              <button type="button" onClick={() => onChange({})} className="ml-auto text-[13px] underline underline-offset-2" style={{ color: soft }}>
                Reset to 0%
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({
  stat,
  pct,
  xp,
  sortable,
  editing,
  isAdventure,
  onPct,
  onRemove,
}: {
  stat: string;
  pct: number;
  xp: number;
  sortable: boolean;
  editing: boolean;
  isAdventure: boolean;
  onPct: (p: number) => void;
  onRemove: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: stat, disabled: !sortable });
  return (
    <li
      ref={setNodeRef}
      className="flex items-center gap-2"
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: "relative", zIndex: isDragging ? 5 : undefined }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Move ${stat}`}
        title="Drag to reorder"
        className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center"
        style={{ color: "rgba(110,85,40,.55)" }}
      >
        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden>
          {[2, 7, 12].map((y) => (
            <g key={y}>
              <circle cx="2" cy={y} r="1.2" />
              <circle cx="6" cy={y} r="1.2" />
            </g>
          ))}
        </svg>
      </button>
      <span className="font-display w-9 shrink-0 text-center text-[11px] font-bold tracking-wide" style={{ color: "#6b5124" }} title={stat}>
        {statAbbr(stat)}
      </span>
      <span className="w-[88px] shrink-0 truncate text-[14px]" style={{ color: "var(--t-ink)" }}>
        {stat}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        onChange={(e) => onPct(Number(e.target.value))}
        aria-label={`Share of XP to ${stat}`}
        className="h-8 min-w-0 flex-1"
        style={{ accentColor: isAdventure ? "#8a6116" : "var(--t-accent)" }}
      />
      <span className="w-[62px] shrink-0 text-right text-[13px] tabular-nums" style={{ color: pct ? "var(--t-ink)" : "var(--t-ink-soft)", fontWeight: pct ? 700 : 400 }}>
        {pct}%{pct > 0 && <span className="block text-[11px] font-normal" style={{ color: "var(--t-ink-soft)" }}>{xp} XP</span>}
      </span>
      {editing && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${stat}`} title={`Remove ${stat} from your stats (its XP is kept)`} className="flex h-8 w-6 shrink-0 items-center justify-center text-[17px] leading-none" style={{ color: "var(--t-warn)" }}>
          ×
        </button>
      )}
    </li>
  );
}
