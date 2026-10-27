"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskWithBoard } from "@/lib/data/tasks";
import type { Board } from "@/lib/data/types";
import { layoutMatrix } from "@/lib/matrix-layout";
import { effortOf } from "@/lib/one-thing";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { QuestCardPopup } from "@/components/tasks/QuestCardPopup";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { BoardSeal } from "@/components/boards/BoardSeal";
import { nextActionOf } from "@/lib/next-action";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { useEscape } from "@/lib/use-escape";
import { collapseBoardOnMatrixAction, confirmImportAction, expandBoardOnMatrixAction, placeOnMatrixAction, setMatrixStateAction } from "@/app/actions";
import { QuestEditorDialog } from "@/components/tasks/QuestEditorDialog";
import { BoardMatrixDialog } from "./BoardMatrixDialog";
import { AddToMatrixSheet } from "./AddToMatrixSheet";

type Mode = "priority" | "impact";
type Lot = "map" | "unplotted" | "later";
type Target = "map" | "unplotted" | "later" | "trash" | null;
type MatrixBoard = Pick<Board, "id" | "title"> & Partial<Board>;

/** One icon on the matrix screen: a quest, or a whole board plotted as one. */
type Item = {
  key: string;
  kind: "task" | "board";
  id: string;
  title: string;
  description: string | null;
  importance: number;
  urgency: number;
  /** Effort used for plotting (falls back to the time estimate for quests). */
  effort: number;
  effortKnown: boolean;
  img: string | null;
  lot: Lot;
  task?: TaskWithBoard;
  board?: MatrixBoard;
  boardTitle: string | null;
  openQuests?: number;
  /** A project board shows as its next action. */
  next?: TaskWithBoard;
};

type Override = { importance?: number; urgency?: number; effort?: number; state?: string | null };

/**
 * Quadrants in LEGEND order, with where each sits. Priority mode: importance
 * along X, urgency up Y. Impact mode: effort along X (easy on the left),
 * impact (importance) up Y — quick wins top-left.
 */
const QUADRANTS = {
  priority: {
    pos: ["tr", "br", "tl", "bl"],
    adventure: [
      { title: "Battle Now", desc: "Important & urgent" },
      { title: "Plan the Siege", desc: "Important, not urgent" },
      { title: "Send a Scout", desc: "Urgent, not important" },
      { title: "Abandon Quest", desc: "Neither important nor urgent" },
    ],
    calm: [
      { title: "Do now", desc: "Important & urgent" },
      { title: "Plan for later", desc: "Important, not urgent" },
      { title: "Delegate", desc: "Urgent, not important" },
      { title: "Let go", desc: "Neither important nor urgent" },
    ],
    tint: ["rgba(196,72,40,.13)", "rgba(79,109,60,.13)", "rgba(56,104,140,.12)", "rgba(107,98,82,.10)"],
    axes: { up: "Urgent ↑", down: { adventure: "Can wait", calm: "Not urgent" }, left: { adventure: "Minor", calm: "Not important" }, right: "Important →" },
  },
  impact: {
    pos: ["tl", "tr", "bl", "br"],
    adventure: [
      { title: "Quick Victories", desc: "Big impact, little effort — start here" },
      { title: "Grand Campaigns", desc: "Big impact, big effort — plan them" },
      { title: "Side Errands", desc: "Small impact, little effort — fill gaps" },
      { title: "The Swamp", desc: "Small impact, big effort — avoid" },
    ],
    calm: [
      { title: "Quick wins", desc: "High impact, low effort — start here" },
      { title: "Big projects", desc: "High impact, high effort — plan them" },
      { title: "Fill-ins", desc: "Low impact, low effort — fill gaps" },
      { title: "Time sinks", desc: "Low impact, high effort — avoid" },
    ],
    tint: ["rgba(79,140,60,.15)", "rgba(56,104,140,.12)", "rgba(190,150,60,.12)", "rgba(150,70,50,.11)"],
    axes: { up: "High impact ↑", down: { adventure: "Low impact", calm: "Low impact" }, left: { adventure: "Easy", calm: "Easy" }, right: "Hard →" },
  },
} as const;

const CORNER: Record<string, React.CSSProperties> = {
  tr: { right: 0, top: 0, borderTopRightRadius: 14 },
  br: { right: 0, bottom: 0, borderBottomRightRadius: 14 },
  tl: { left: 0, top: 0, borderTopLeftRadius: 14 },
  bl: { left: 0, bottom: 0, borderBottomLeftRadius: 14 },
};

/** Inverts the 10–90% mapping back to a 0–5 value (one decimal place). */
function pctToScale(pct: number) {
  const value = Math.round(((pct - 10) / 80) * 5 * 10) / 10;
  return Math.min(5, Math.max(0, value));
}

function artOf(t: { icon_source?: string | null; icon_key?: string | null }) {
  return (t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? t.icon_key : null;
}

export function PriorityMatrix({
  tasks: initialTasks,
  theme = "calm",
  boards,
  plotIds,
  confirmImports = false,
}: {
  tasks: TaskWithBoard[];
  theme?: "calm" | "adventure";
  /** Plot mode: place these quests one by one by clicking the map. */
  plotIds?: string[];
  /** Placing a quest in plot mode also confirms it as a reviewed import. */
  confirmImports?: boolean;
  /** Boards: for the filter, and to plot a board as one item. */
  boards?: MatrixBoard[];
}) {
  const router = useRouter();
  const isAdventure = theme === "adventure";
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Optimistic moves, cleared whenever fresh data arrives from the server.
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [seen, setSeen] = useState({ initialTasks, boards });
  if (seen.initialTasks !== initialTasks || seen.boards !== boards) {
    setSeen({ initialTasks, boards });
    setOverrides({});
  }

  // ---- Mode and board filter (remembered per browser) -------------------
  const [mode, setMode] = useState<Mode>("priority");
  const [hiddenBoards, setHiddenBoards] = useState<Set<string>>(() => new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("matrix-hidden-boards") ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
      if (Array.isArray(saved) && saved.length) setHiddenBoards(new Set(saved));
      if (window.localStorage.getItem("matrix-mode") === "impact") setMode("impact");
    } catch {
      /* storage unavailable */
    }
  }, []);
  function pickMode(m: Mode) {
    setMode(m);
    try {
      window.localStorage.setItem("matrix-mode", m);
    } catch {
      /* storage unavailable */
    }
  }
  function toggleBoard(id: string) {
    setHiddenBoards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem("matrix-hidden-boards", JSON.stringify(Array.from(next)));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }

  // ---- Items ------------------------------------------------------------
  const boardTitle = new Map((boards ?? []).map((b) => [b.id, b.title]));
  const openCount = new Map<string, number>();
  for (const t of initialTasks) if (t.board_id) openCount.set(t.board_id, (openCount.get(t.board_id) ?? 0) + 1);

  const rated = (importance: number, urgency: number, effortKnown: boolean) =>
    mode === "priority" ? importance > 0 || urgency > 0 : importance > 0 && effortKnown;

  const items: Item[] = [];
  const hiddenQuests: TaskWithBoard[] = [];
  const projectIds = new Set((boards ?? []).filter((b) => (overrides[`b:${b.id}`]?.state !== undefined ? overrides[`b:${b.id}`]?.state : b.matrix_state)).map((b) => b.id));
  for (const t of initialTasks) {
    const key = `t:${t.id}`;
    const ov = overrides[key] ?? {};
    const state = ov.state !== undefined ? ov.state : (t.matrix_state ?? null);
    if (state === "hidden") {
      hiddenQuests.push(t);
      continue;
    }
    if (boards && hiddenBoards.has(t.board_id ?? "none")) continue;
    // A project on the matrix shows only its next step (as the board's icon).
    if (t.board_id && projectIds.has(t.board_id)) continue;
    const importance = ov.importance ?? t.importance;
    const urgency = ov.urgency ?? t.urgency;
    const rawEffort = ov.effort ?? t.effort ?? 0;
    const effortKnown = rawEffort > 0 || t.estimate_minutes != null;
    const lot: Lot = state === "later" ? "later" : state === "unplotted" ? "unplotted" : rated(importance, urgency, effortKnown) ? "map" : "unplotted";
    items.push({
      key,
      kind: "task",
      id: t.id,
      title: t.title,
      description: t.description,
      importance,
      urgency,
      effort: rawEffort > 0 ? rawEffort : effortOf(t),
      effortKnown,
      img: artOf(t),
      lot,
      task: t,
      boardTitle: t.board_id ? (boardTitle.get(t.board_id) ?? null) : null,
    });
  }
  const offMatrixBoards: MatrixBoard[] = [];
  for (const b of boards ?? []) {
    const key = `b:${b.id}`;
    const ov = overrides[key] ?? {};
    const state = ov.state !== undefined ? ov.state : (b.matrix_state ?? null);
    if (!state) {
      offMatrixBoards.push(b);
      continue;
    }
    if (hiddenBoards.has(b.id)) continue;
    const importance = ov.importance ?? b.importance ?? 0;
    const urgency = ov.urgency ?? b.urgency ?? 0;
    const effort = ov.effort ?? b.effort ?? 0;
    const lot: Lot = state === "later" ? "later" : state === "unplotted" ? "unplotted" : rated(importance, urgency, effort > 0) ? "map" : "unplotted";
    const next = nextActionOf(b, initialTasks) ?? undefined;
    items.push({
      key,
      kind: "board",
      id: b.id,
      title: next ? next.title : b.title,
      next,
      task: next,
      description: next ? (next.description ?? null) : (b.description ?? null),
      importance,
      urgency,
      effort: effort || 2.5,
      effortKnown: effort > 0,
      img: (next && artOf(next)) || artOf(b),
      lot,
      board: b,
      boardTitle: next ? b.title : null,
      openQuests: openCount.get(b.id) ?? 0,
    });
  }
  const byKey = new Map(items.map((i) => [i.key, i]));
  const xy = (i: Item) => (mode === "priority" ? { x: i.importance, y: i.urgency } : { x: i.effort, y: i.importance });
  const plotted = layoutMatrix(items.filter((i) => i.lot === "map").map((i) => ({ item: i, key: i.key, ...xy(i) })));
  const later = items.filter((i) => i.lot === "later");
  const unplotted = items.filter((i) => i.lot === "unplotted");
  const hasUnboarded = initialTasks.some((t) => !t.board_id);

  // ---- Popups -----------------------------------------------------------
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Right-click menu on an icon, and a new quest started by clicking an empty spot.
  const [ctx, setCtx] = useState<{ key: string; x: number; y: number; expand?: boolean } | null>(null);
  const [newAt, setNewAt] = useState<{ importance: number; urgency?: number; effort?: number } | null>(null);
  const lastDragEnd = useRef(0);
  const viewingTask = viewingTaskId ? (initialTasks.find((t) => t.id === viewingTaskId) ?? null) : null;
  const editingTask = editingTaskId ? (initialTasks.find((t) => t.id === editingTaskId) ?? null) : null;
  const editingBoard = editingBoardId ? ((boards ?? []).find((b) => b.id === editingBoardId) ?? null) : null;
  const dialogOpen = !!(viewingTask || editingTask || editingBoard || adding || newAt || ctx);

  const gridRef = useRef<HTMLDivElement>(null);
  const laterRef = useRef<HTMLDivElement>(null);
  const unplottedRef = useRef<HTMLDivElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);

  const [hover, setHover] = useState<{ key: string; left: number; top: number; above: boolean } | null>(null);

  // ---- Plot mode ----------------------------------------------------------
  const [localPlot, setLocalPlot] = useState<string[] | null>(null);
  const [plotIndex, setPlotIndex] = useState(0);
  const [plotStopped, setPlotStopped] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const urlQueue = plotStopped ? [] : (plotIds ?? []).map((id) => `t:${id}`);
  const queue = (localPlot ?? urlQueue).filter((k) => byKey.has(k) || (localPlot ?? urlQueue).indexOf(k) < plotIndex);
  const plotting = queue.length > 0 && plotIndex < queue.length;
  const plotItem = plotting ? byKey.get(queue[plotIndex]) : undefined;
  const showBanner = queue.length > 0;

  function startPlot(keys: string[]) {
    setLocalPlot(keys);
    setPlotIndex(0);
    setPlotStopped(false);
    setDescOpen(false);
    window.setTimeout(() => gridRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 30);
  }
  function stopPlot() {
    setLocalPlot(null);
    setPlotIndex(0);
    setPlotStopped(true);
    setGhost(null);
    if (plotIds?.length) router.replace("/matrix", { scroll: false });
  }
  function nextPlot() {
    setPlotIndex((i) => i + 1);
    setDescOpen(false);
  }
  function tap(item: Item, source: Lot) {
    if (source === "map") {
      if (item.kind === "task") setViewingTaskId(item.id);
      else if (item.next) setViewingTaskId(item.next.id);
      else setEditingBoardId(item.id);
    } else {
      startPlot([item.key]);
    }
  }

  // ---- Moving things ----------------------------------------------------

  function valuesAt(clientX: number, clientY: number) {
    const r = gridRef.current!.getBoundingClientRect();
    const xPct = ((clientX - r.left) / r.width) * 100;
    const yPct = ((r.bottom - clientY) / r.height) * 100;
    const x = Math.max(0.1, pctToScale(xPct));
    const y = Math.max(0.1, pctToScale(yPct));
    return mode === "priority" ? { importance: x, urgency: y } : { effort: x, importance: y };
  }

  function move(item: Item, target: Exclude<Target, null>, clientX?: number, clientY?: number) {
    setError(null);
    if (target === "map") {
      if (clientX === undefined || clientY === undefined || !gridRef.current) return;
      const values = valuesAt(clientX, clientY);
      setOverrides((o) => ({ ...o, [item.key]: { ...o[item.key], ...values, state: item.kind === "task" ? null : "plot" } }));
      startTransition(async () => {
        try {
          await placeOnMatrixAction(item.kind, item.id, values);
          if (confirmImports && item.kind === "task" && item.task?.needs_review) await confirmImportAction("quest", item.id);
        } catch (e) {
          setOverrides((o) => ({ ...o, [item.key]: {} }));
          setError(e instanceof Error ? e.message : "Couldn't plot that.");
        }
      });
      return;
    }
    if (target === item.lot) return;
    const state = target === "trash" ? (item.kind === "task" ? "hidden" : null) : target;
    setOverrides((o) => ({ ...o, [item.key]: { ...o[item.key], state } }));
    startTransition(async () => {
      try {
        await setMatrixStateAction(item.kind, item.id, target === "trash" ? "hidden" : target);
      } catch (e) {
        setOverrides((o) => ({ ...o, [item.key]: {} }));
        setError(e instanceof Error ? e.message : "Couldn't move that.");
      }
    });
  }

  // Pointer drag shared by map pins and lot icons. Mouse drags after a few
  // pixels; touch drags pins at once and lot icons after a short hold (so
  // the lots still scroll).
  const press = useRef<{ key: string; source: Lot; pointerId: number; touch: boolean; sx: number; sy: number; active: boolean; timer?: number } | null>(null);
  const [drag, setDrag] = useState<{ key: string; x: number; y: number; target: Target; label: string } | null>(null);

  function targetAt(x: number, y: number): Target {
    const inside = (el: HTMLElement | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    if (inside(trashRef.current)) return "trash";
    if (inside(laterRef.current)) return "later";
    if (inside(unplottedRef.current)) return "unplotted";
    if (inside(gridRef.current)) return "map";
    return null;
  }

  function labelFor(target: Target, x: number, y: number) {
    if (target === "trash") return "Remove from priority matrix";
    if (target === "later") return "Save for later";
    if (target === "unplotted") return "Not yet plotted";
    if (target === "map" && gridRef.current) {
      const v = valuesAt(x, y);
      return mode === "priority"
        ? `Importance ${v.importance.toFixed(1)} · Urgency ${v.urgency!.toFixed(1)}`
        : `Impact ${v.importance.toFixed(1)} · Effort ${v.effort!.toFixed(1)}`;
    }
    return "";
  }

  function startPress(e: React.PointerEvent, item: Item, source: Lot) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerType === "mouse") e.preventDefault();
    setHover(null);
    const touch = e.pointerType !== "mouse";
    const p = { key: item.key, source, pointerId: e.pointerId, touch, sx: e.clientX, sy: e.clientY, active: false, timer: undefined as number | undefined };
    if (touch && source !== "map") {
      p.timer = window.setTimeout(() => {
        if (press.current !== p) return;
        p.active = true;
        navigator.vibrate?.(8);
        const t = targetAt(p.sx, p.sy);
        setDrag({ key: p.key, x: p.sx, y: p.sy, target: t, label: labelFor(t, p.sx, p.sy) });
      }, 260);
    }
    press.current = p;
  }

  const onWindowMove = useEffectEvent((e: PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const dist = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    if (!p.active) {
      if (p.touch && p.source !== "map") {
        if (dist > 8) {
          window.clearTimeout(p.timer);
          press.current = null; // a scroll, not a drag
        }
        return;
      }
      if (dist <= 4) return;
      p.active = true;
    }
    const t = targetAt(e.clientX, e.clientY);
    setDrag({ key: p.key, x: e.clientX, y: e.clientY, target: t, label: labelFor(t, e.clientX, e.clientY) });
  });

  const onWindowUp = useEffectEvent((e: PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    window.clearTimeout(p.timer);
    press.current = null;
    const item = byKey.get(p.key);
    setDrag(null);
    if (!item) return;
    if (p.active) {
      lastDragEnd.current = e.timeStamp;
      const t = targetAt(e.clientX, e.clientY);
      if (t) move(item, t, e.clientX, e.clientY);
    } else {
      tap(item, p.source);
    }
  });

  const onWindowCancel = useEffectEvent((e: PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    window.clearTimeout(p.timer);
    press.current = null;
    setDrag(null);
  });

  useEffect(() => {
    const mv = (e: PointerEvent) => onWindowMove(e);
    const up = (e: PointerEvent) => onWindowUp(e);
    const cancel = (e: PointerEvent) => onWindowCancel(e);
    // Once a touch drag is live, keep the page from scrolling under it.
    const tm = (e: TouchEvent) => {
      if (press.current?.active) e.preventDefault();
    };
    const scroll = () => setHover(null);
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    document.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", tm);
      window.removeEventListener("scroll", scroll);
    };
  }, []);

  // ---- Hover preview (mouse) -------------------------------------------
  function hoverOn(e: React.PointerEvent, item: Item) {
    if (e.pointerType !== "mouse" || press.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const width = 280;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    const above = r.top > 240;
    setHover({ key: item.key, left, top: above ? r.top - 10 : r.bottom + 10, above });
  }
  const hoverItem = hover && !drag ? byKey.get(hover.key) : undefined;

  useEscape(() => stopPlot(), showBanner && !dialogOpen);

  const legend = QUADRANTS[mode][theme];
  const axes = QUADRANTS[mode].axes;
  const axisLabelStyle = {
    color: isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)",
    fontFamily: isAdventure ? "var(--font-display)" : undefined,
    fontWeight: isAdventure ? 500 : 600,
    letterSpacing: isAdventure ? "0.02em" : undefined,
  };
  const chipBg = isAdventure ? "rgba(15,19,13,.55)" : "var(--t-card)";
  const chipBorder = `1px solid ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`;
  const chipInk = isAdventure ? "var(--t-cream)" : "var(--t-ink)";
  const dragItem = drag ? byKey.get(drag.key) : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* ---- Plot mode banner ---- */}
      {showBanner && (
        <div
          className="sticky top-2 z-40 flex flex-col gap-2 rounded-2xl p-3 shadow-xl"
          style={{ background: isAdventure ? "var(--t-panel)" : "var(--t-card)", border: `2px solid ${isAdventure ? "var(--t-gold)" : "var(--t-accent)"}`, color: "var(--t-ink)" }}
          role="status"
        >
          <button
            type="button"
            onClick={stopPlot}
            aria-label="Stop plotting"
            title="Stop plotting (Esc)"
            className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full text-[24px] leading-none"
            style={{ color: "var(--t-ink-soft)" }}
          >
            ×
          </button>
          {plotItem ? (
            <>
              <div className="flex items-start gap-3 pr-8">
                <Portrait item={plotItem} size={56} />
                <div className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-bold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
                    Plot {plotIndex + 1} of {queue.length} · tap the map where it belongs
                  </span>
                  <span className={`block text-[18px] font-bold leading-snug ${isAdventure ? "font-display" : ""}`}>{plotItem.title}</span>
                  <Facts item={plotItem} theme={theme} />
                </div>
              </div>
              {plotItem.description && (
                <button type="button" onClick={() => setDescOpen((v) => !v)} className="text-left text-[14.5px] leading-snug" style={{ color: "#4a3c26" }}>
                  <span className={descOpen ? "whitespace-pre-line" : "line-clamp-3"}>{plotItem.description}</span>
                </button>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => (plotItem.kind === "task" ? setEditingTaskId(plotItem.id) : plotItem.next ? setEditingTaskId(plotItem.next.id) : setEditingBoardId(plotItem.id))}
                  className="h-9 rounded-full border px-3.5 text-[13.5px] font-semibold"
                  style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)" }}
                >
                  Edit details
                </button>
                <button
                  type="button"
                  onClick={() => {
                    move(plotItem, "later");
                    nextPlot();
                  }}
                  className="h-9 rounded-full border px-3.5 text-[13.5px] font-semibold"
                  style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)" }}
                >
                  Save for later
                </button>
                <button type="button" onClick={nextPlot} className="h-9 px-2 text-[13.5px] underline" style={{ color: "var(--t-ink-soft)" }}>
                  Skip
                </button>
                <span className="ml-auto hidden text-[12px] sm:inline" style={{ color: "var(--t-ink-soft)" }}>
                  Esc to stop
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 pr-8">
              <span className="text-2xl" aria-hidden>
                ✓
              </span>
              <span className="flex-1 text-[15px] font-semibold">All plotted! Drag any icon to fine-tune.</span>
              <button
                type="button"
                onClick={stopPlot}
                className="h-9 rounded-full px-4 text-[14px] font-bold"
                style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- Controls: mode, filter, legend ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Matrix" className="flex rounded-full p-0.5" style={{ background: chipBg, border: chipBorder }}>
          {(
            [
              ["priority", "Urgent × Important"],
              ["impact", "Impact × Effort"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => pickMode(m)}
              className="min-h-9 rounded-full px-3.5 text-[14px] font-semibold transition-colors"
              style={mode === m ? { background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" } : { color: chipInk }}
            >
              {label}
            </button>
          ))}
        </div>
        {boards && boards.length > 0 && (
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
            className="hover-glow flex min-h-10 items-center gap-2 rounded-full px-3.5 text-[14px]"
            style={{ background: chipBg, border: chipBorder, color: chipInk }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
            </svg>
            {(() => {
              const all = boards.length + (hasUnboarded ? 1 : 0);
              const shown = boards.filter((b) => !hiddenBoards.has(b.id)).length + (hasUnboarded && !hiddenBoards.has("none") ? 1 : 0);
              return <span>{shown === all ? "All boards" : `${shown} of ${all} boards`}</span>;
            })()}
          </button>
        )}
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          aria-label="What the corners mean"
          className="hover-glow flex h-10 w-10 items-center justify-center rounded-full font-display text-[18px] italic"
          style={{ background: chipBg, border: chipBorder, color: isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)" }}
        >
          i
        </button>
      </div>

      {boards && boards.length > 0 && (
        <div className="drawer-body" data-open={filterOpen ? "true" : "false"}>
          <div className="drawer-inner">
            <fieldset className={`board-filter ${isAdventure ? "board-filter-adventure" : "board-filter-calm"} flex flex-wrap items-center gap-x-2 gap-y-2 pb-1 pt-1`}>
              <legend className="sr-only">Show quests from these boards</legend>
              {[...boards, ...(hasUnboarded ? [{ id: "none", title: "No board" }] : [])].map((b) => (
                <label key={b.id} className="board-chip">
                  <input type="checkbox" className="sr-only" checked={!hiddenBoards.has(b.id)} onChange={() => toggleBoard(b.id)} />
                  <svg className="board-chip-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                    <path d="M2.5 6.4 5 8.8 9.6 3.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{b.title}</span>
                </label>
              ))}
            </fieldset>
          </div>
        </div>
      )}

      <div className="drawer-body" data-open={legendOpen ? "true" : "false"}>
        <div className="drawer-inner">
          <div
            className={`flex flex-col rounded-2xl px-4 py-2 ${isAdventure ? "parchment parchment-framed" : ""}`}
            style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
          >
            {legend.map((item, i) => (
              <div key={item.title} className="relative z-[1] flex items-center gap-3 py-1.5" style={i === 0 ? undefined : { borderTop: `1px solid ${isAdventure ? "rgba(139,112,64,.3)" : "var(--t-card-border)"}` }}>
                <span aria-hidden className="h-4 w-4 shrink-0 rounded" style={{ background: QUADRANTS[mode].tint[i].replace(/[\d.]+\)$/, ".55)"), border: "1px solid rgba(80,60,20,.35)" }} />
                <span className="w-[128px] shrink-0 text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
                  {item.title}
                </span>
                <span className="text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
                  {item.desc}
                </span>
              </div>
            ))}
            <p className="relative z-[1] m-0 py-1.5 text-[13px] italic" style={{ color: "var(--t-ink-soft)", borderTop: `1px solid ${isAdventure ? "rgba(139,112,64,.3)" : "var(--t-card-border)"}` }}>
              Drag an icon to re-plot it, or down into the lots. Hover over one (or tap it) to see the quest.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="m-0 rounded-lg px-3 py-2 text-[14px] font-semibold" style={{ background: "var(--t-warn-bg)", color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      {/* ---- The map ---- */}
      <div className="mx-auto flex w-full gap-2" style={{ maxWidth: "min(100%, max(260px, calc(100svh - 360px)))" }}>
        <div className="relative w-6 shrink-0" style={axisLabelStyle} aria-hidden>
          <span className="absolute left-1/2 top-2 origin-center whitespace-nowrap text-[14px]" style={{ transform: "translateX(-50%) rotate(180deg)", writingMode: "vertical-rl" }}>
            {axes.up}
          </span>
          <span className="absolute bottom-2 left-1/2 origin-center whitespace-nowrap text-[14px]" style={{ transform: "translateX(-50%) rotate(180deg)", writingMode: "vertical-rl" }}>
            {axes.down[theme]}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div
            ref={gridRef}
            onClick={(e) => {
              // An empty spot: start a new quest right there.
              if (plotItem || e.timeStamp - lastDragEnd.current < 400) return;
              if ((e.target as HTMLElement).closest("button")) return;
              setNewAt(valuesAt(e.clientX, e.clientY));
            }}
            title="Click an empty spot to add a quest there"
            className={`relative aspect-square w-full cursor-crosshair rounded-2xl ${isAdventure ? "parchment" : ""}`}
            style={{
              ...(isAdventure ? {} : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }),
              outline: drag?.target === "map" ? "3px solid rgba(217,180,95,.75)" : undefined,
              outlineOffset: 2,
            }}
          >
            {legend.map((q, i) => {
              const corner = QUADRANTS[mode].pos[i];
              return (
                <div key={q.title} className="pointer-events-none absolute h-1/2 w-1/2" style={{ ...CORNER[corner], background: QUADRANTS[mode].tint[i] }}>
                  <span
                    className={`absolute text-[14px] italic sm:text-[15px] ${corner.endsWith("r") ? "right-3 text-right" : "left-3"} ${corner.startsWith("t") ? "top-2.5" : "bottom-2.5"}`}
                    style={{ color: "var(--t-ink-soft)", opacity: 0.85 }}
                  >
                    {q.title}
                  </span>
                </div>
              );
            })}
            <div className="absolute bottom-0 left-1/2 top-0 w-0" style={{ borderLeft: `1.5px dashed ${isAdventure ? "rgba(139,112,64,.55)" : "var(--t-card-border)"}` }} />
            <div className="absolute left-0 right-0 top-1/2 h-0" style={{ borderTop: `1.5px dashed ${isAdventure ? "rgba(139,112,64,.55)" : "var(--t-card-border)"}` }} />

            {plotItem && (
              <button
                type="button"
                aria-label={`Place “${plotItem.title}” here`}
                onClick={(e) => {
                  move(plotItem, "map", e.clientX, e.clientY);
                  nextPlot();
                }}
                onPointerMove={(e) => {
                  if (e.pointerType !== "mouse") return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setGhost({ x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onPointerLeave={() => setGhost(null)}
                className="absolute inset-0 z-30"
                style={{ background: "rgba(217,180,95,.08)", boxShadow: "inset 0 0 0 3px rgba(217,180,95,.7)", cursor: ghost ? "none" : "pointer", borderRadius: 14 }}
              >
                {ghost && (
                  <span aria-hidden className="pointer-events-none absolute" style={{ left: ghost.x, top: ghost.y, transform: "translate(-50%, -50%)" }}>
                    <Portrait item={plotItem} size={40} ring />
                  </span>
                )}
              </button>
            )}

            {plotted.map(({ item, key, xPct, yPct }) => {
              const tint = item.task ? rescheduleRedness(item.task.reschedule_count) : null;
              const dragging = drag?.key === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`${item.title} — drag to move, tap to open`}
                  onPointerDown={(e) => startPress(e, item, "map")}
                  onPointerEnter={(e) => hoverOn(e, item)}
                  onPointerLeave={() => setHover(null)}
                  onClick={(e) => e.detail === 0 && tap(item, "map")}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (press.current?.active) return;
                    press.current = null;
                    setHover(null);
                    setCtx({ key: item.key, x: e.clientX, y: e.clientY });
                  }}
                  className="matrix-pin absolute -translate-x-1/2 translate-y-1/2 cursor-grab touch-none select-none hover:z-20 active:cursor-grabbing"
                  style={{ left: `${xPct}%`, bottom: `${yPct}%`, opacity: dragging ? 0.3 : 1 }}
                >
                  <Portrait item={item} size={34} ring warn={!!tint} />
                </button>
              );
            })}

            {plotted.length === 0 && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm" style={{ color: "var(--t-ink-soft)" }}>
                {mode === "impact" ? "Rate a quest's importance and effort to see it here." : "No plotted quests yet."}
              </p>
            )}
          </div>

          <div className="mt-1.5 flex justify-between text-[14px]" style={axisLabelStyle}>
            <span>{axes.left[theme]}</span>
            <span>{axes.right}</span>
          </div>
        </div>
      </div>

      {/* ---- Parking lots, with the trash zone between them while dragging ---- */}
      <div className="grid items-stretch gap-x-2" style={{ gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)" }}>
        <LotBox
          refEl={laterRef}
          title="Save for later"
          count={later.length}
          empty="Drag quests here to park them."
          highlight={drag?.target === "later"}
          theme={theme}
        >
          {later.map((i) => (
            <LotIcon key={i.key} item={i} theme={theme} dimmed={drag?.key === i.key} onPointerDown={(e) => startPress(e, i, "later")} onHover={(e) => hoverOn(e, i)} onLeave={() => setHover(null)} onKey={() => tap(i, "later")} onMenu={(x, y) => { press.current = null; setHover(null); setCtx({ key: i.key, x, y }); }} />
          ))}
        </LotBox>

        <div
          ref={trashRef}
          aria-hidden={!drag}
          className="flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl text-center transition-all duration-200"
          style={{
            width: drag ? 84 : 0,
            opacity: drag ? 1 : 0,
            border: drag ? `2px dashed ${drag.target === "trash" ? "#c0412c" : "rgba(192,65,44,.55)"}` : "none",
            background: drag?.target === "trash" ? "rgba(192,65,44,.22)" : "rgba(192,65,44,.08)",
            color: isAdventure ? "#f3c9b8" : "#9a3322",
          }}
        >
          <TrashGlyph open={drag?.target === "trash"} />
          <span className="px-1 text-[11.5px] font-semibold leading-tight">remove from priority matrix</span>
        </div>

        <LotBox
          refEl={unplottedRef}
          title="Not yet plotted"
          count={unplotted.length}
          empty="Everything is on the map."
          highlight={drag?.target === "unplotted"}
          theme={theme}
          actions={
            <>
              {unplotted.length > 0 && (
                <button
                  type="button"
                  onClick={() => startPlot(unplotted.map((i) => i.key))}
                  className="hover-glow h-8 rounded-full px-3 text-[13px] font-semibold"
                  style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
                >
                  Plot all
                </button>
              )}
              <button
                type="button"
                onClick={() => setAdding(true)}
                aria-label="Add boards or quests to the matrix"
                title="Add boards or quests"
                className="hover-glow flex h-8 w-8 items-center justify-center rounded-full text-[20px] leading-none"
                style={{ border: `1.5px solid ${isAdventure ? "var(--t-gold)" : "var(--t-accent)"}`, color: isAdventure ? "var(--t-gold)" : "var(--t-accent)" }}
              >
                +
              </button>
            </>
          }
        >
          {unplotted.map((i) => (
            <LotIcon key={i.key} item={i} theme={theme} dimmed={drag?.key === i.key} onPointerDown={(e) => startPress(e, i, "unplotted")} onHover={(e) => hoverOn(e, i)} onLeave={() => setHover(null)} onKey={() => tap(i, "unplotted")} onMenu={(x, y) => { press.current = null; setHover(null); setCtx({ key: i.key, x, y }); }} />
          ))}
        </LotBox>
      </div>

      {/* ---- Floating bits ---- */}
      {drag && dragItem && (
        <div className="pointer-events-none fixed z-[60] flex flex-col items-center gap-1" style={{ left: drag.x, top: drag.y, transform: "translate(-50%, -50%)" }}>
          <span style={{ transform: "scale(1.15)", filter: "drop-shadow(0 8px 14px rgba(0,0,0,.45))" }}>
            <Portrait item={dragItem} size={44} ring />
          </span>
          {drag.label && (
            <span
              className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold"
              style={{ background: drag.target === "trash" ? "#8e2b25" : "rgba(20,16,8,.85)", color: "#f6ecd2" }}
            >
              {drag.label}
            </span>
          )}
        </div>
      )}
      {hover && hoverItem && <Preview item={hoverItem} left={hover.left} top={hover.top} above={hover.above} theme={theme} />}

      {ctx && byKey.get(ctx.key) && (
        <ContextMenu
          item={byKey.get(ctx.key)!}
          x={ctx.x}
          y={ctx.y}
          expand={!!ctx.expand}
          boardOf={(id) => (boards ?? []).find((b) => b.id === id)}
          boardOnMatrix={(id) => items.some((i) => i.kind === "board" && i.id === id)}
          theme={theme}
          onClose={() => setCtx(null)}
          onPick={(action) => {
            const item = byKey.get(ctx.key)!;
            if (action === "expand-ask") return setCtx({ ...ctx, expand: true });
            setCtx(null);
            setError(null);
            if (action === "open") return item.kind === "task" ? setViewingTaskId(item.id) : item.next ? setViewingTaskId(item.next.id) : setEditingBoardId(item.id);
            if (action === "later" || action === "unplotted" || action === "trash") return move(item, action);
            startTransition(async () => {
              try {
                if (action === "collapse") await collapseBoardOnMatrixAction(item.kind === "board" ? item.id : item.task!.board_id!);
                else if (action === "expand-here") await expandBoardOnMatrixAction(item.id, "here");
                else if (action === "expand-unplotted") await expandBoardOnMatrixAction(item.id, "unplotted");
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't do that.");
              }
            });
          }}
        />
      )}
      {newAt && (
        <QuestEditorDialog
          mode={{ kind: "create", prefill: { importance: newAt.importance, urgency: newAt.urgency, effort: newAt.effort } }}
          theme={theme}
          onClose={() => setNewAt(null)}
        />
      )}
      {viewingTask && <QuestCardPopup task={viewingTask} theme={theme} categoryLabel={viewingTask.board_id ? boardTitle.get(viewingTask.board_id) : null} onClose={() => setViewingTaskId(null)} />}
      {editingTask && <EditTaskModal task={editingTask} theme={theme} onClose={() => setEditingTaskId(null)} />}
      {editingBoard && editingBoard.created_at && (
        <BoardMatrixDialog board={editingBoard as Board} openQuests={openCount.get(editingBoard.id) ?? 0} theme={theme} onClose={() => setEditingBoardId(null)} />
      )}
      {adding && (
        <AddToMatrixSheet
          boards={offMatrixBoards as Board[]}
          quests={hiddenQuests}
          openCountByBoard={openCount}
          theme={theme}
          onClose={() => setAdding(false)}
          onAdded={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Portrait({ item, size, ring = false, warn = false }: { item: Item; size: number; ring?: boolean; warn?: boolean }) {
  const isBoard = item.kind === "board";
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden ${isBoard ? "rounded-[28%]" : "rounded-full"}`}
      style={{
        width: size,
        height: size,
        background: "#f3e6c8",
        border: `2px solid ${warn ? "var(--t-warn)" : isBoard ? "#6d4f1d" : "#8a6c2c"}`,
        boxShadow: ring ? `0 0 0 2px ${isBoard ? "rgba(217,180,95,.85)" : "rgba(217,180,95,.45)"}, 0 2px 5px rgba(0,0,0,.35)` : undefined,
      }}
    >
      {item.img ? (
        // eslint-disable-next-line @next/next/no-img-element -- quest portrait
        <img src={item.img} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
      ) : isBoard ? (
        <BoardSeal color={item.board?.color} size={Math.round(size * 0.7)} />
      ) : (
        <span className="pointer-events-none">
          <QuestMonogram id={item.id} title={item.title} size={size} />
        </span>
      )}
    </span>
  );
}

function Facts({ item, theme }: { item: Item; theme: "calm" | "adventure" }) {
  const t = item.task;
  const facts: string[] = [];
  if (item.kind === "board") facts.push(item.next ? `Next step · ${item.boardTitle} (${item.openQuests ?? 0} open)` : `Board · ${item.openQuests ?? 0} open quests`);
  else if (item.boardTitle) facts.push(item.boardTitle);
  if (t?.due_at) facts.push(`Due ${new Date(t.due_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`);
  if (t?.estimate_minutes != null) facts.push(`⏱ ${t.estimate_minutes < 60 ? `${t.estimate_minutes}m` : `${Math.round((t.estimate_minutes / 60) * 10) / 10}h`}`);
  if (t?.steps_total) facts.push(`${t.steps_done ?? 0}/${t.steps_total} steps`);
  if (t && t.xp_value > 0) facts.push(`${t.xp_value} ${theme === "adventure" ? "XP" : "pts"}`);
  const ratings: string[] = [];
  if (item.importance > 0) ratings.push(`Importance ${item.importance.toFixed(1)}`);
  if (item.urgency > 0) ratings.push(`Urgency ${item.urgency.toFixed(1)}`);
  if (item.effortKnown) ratings.push(`Effort ${item.effort.toFixed(1)}`);
  return (
    <span className="mt-0.5 flex flex-col gap-0.5 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
      {facts.length > 0 && <span>{facts.join(" · ")}</span>}
      {ratings.length > 0 && <span>{ratings.join(" · ")}</span>}
    </span>
  );
}

function Preview({ item, left, top, above, theme }: { item: Item; left: number; top: number; above: boolean; theme: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  return (
    <div
      className={`pointer-events-none fixed z-[58] flex w-[280px] flex-col gap-1.5 rounded-xl p-3 shadow-2xl ${isAdventure ? "parchment" : ""}`}
      style={{
        left,
        top,
        transform: above ? "translateY(-100%)" : undefined,
        background: isAdventure ? undefined : "var(--t-card)",
        border: isAdventure ? undefined : "1px solid var(--t-card-border)",
        color: "var(--t-ink)",
      }}
    >
      <div className="relative z-[1] flex items-start gap-2.5">
        <Portrait item={item} size={40} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[15px] font-semibold leading-snug">{item.title}</p>
          <Facts item={item} theme={theme} />
        </div>
      </div>
      {item.description && (
        <p className="relative z-[1] m-0 line-clamp-4 whitespace-pre-line text-[13.5px] leading-snug" style={{ color: "#4a3c26" }}>
          {item.description}
        </p>
      )}
    </div>
  );
}

function LotBox({
  refEl,
  title,
  count,
  empty,
  highlight,
  theme,
  actions,
  children,
}: {
  refEl: React.RefObject<HTMLDivElement | null>;
  title: string;
  count: number;
  empty: string;
  highlight: boolean;
  theme: "calm" | "adventure";
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isAdventure = theme === "adventure";
  return (
    <section
      ref={refEl}
      className="flex min-w-0 flex-col gap-2 rounded-2xl px-2.5 py-2.5 transition-colors"
      style={{
        background: highlight ? "rgba(217,180,95,.2)" : isAdventure ? "rgba(14,18,10,.4)" : "var(--t-card)",
        border: `${highlight ? 2 : 1}px ${highlight ? "solid" : "solid"} ${highlight ? "var(--t-gold)" : isAdventure ? "rgba(217,180,95,.3)" : "var(--t-card-border)"}`,
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <h2 className={`m-0 mr-auto ${isAdventure ? "font-display text-[17px]" : "text-sm font-bold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
          {title} <span className="font-normal opacity-70">({count})</span>
        </h2>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </div>
      {count === 0 ? (
        <p className="m-0 text-[13px] italic" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.7 }}>
          {empty}
        </p>
      ) : (
        <ul className="lot-scroll m-0 flex max-h-[232px] list-none flex-wrap content-start gap-1 overflow-y-auto p-0">{children}</ul>
      )}
    </section>
  );
}

function LotIcon({
  item,
  theme,
  dimmed,
  onPointerDown,
  onHover,
  onLeave,
  onKey,
  onMenu,
}: {
  item: Item;
  theme: "calm" | "adventure";
  dimmed: boolean;
  onMenu: (x: number, y: number) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onHover: (e: React.PointerEvent) => void;
  onLeave: () => void;
  onKey: () => void;
}) {
  return (
    <li className="shrink-0">
      <button
        type="button"
        aria-label={`${item.title} — tap to plot, hold and drag to move`}
        onPointerDown={onPointerDown}
        onPointerEnter={onHover}
        onPointerLeave={onLeave}
        onClick={(e) => e.detail === 0 && onKey()}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu(e.clientX, e.clientY);
        }}
        className="matrix-pin flex w-[62px] cursor-grab select-none flex-col items-center gap-1 rounded-xl p-1 text-center active:cursor-grabbing"
        style={{ opacity: dimmed ? 0.3 : 1 }}
      >
        <Portrait item={item} size={42} ring={item.kind === "board"} />
        <span className="line-clamp-2 text-[11px] leading-tight" style={{ color: theme === "adventure" ? "var(--t-cream)" : "var(--t-ink)" }}>
          {item.title}
        </span>
      </button>
    </li>
  );
}

function TrashGlyph({ open }: { open?: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 7.5h14l-1.1 12a1.8 1.8 0 0 1-1.8 1.6H7.9a1.8 1.8 0 0 1-1.8-1.6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9.5 11v6.5M14.5 11v6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M3.5 6h17M9 6V4.3c0-.7.5-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2V6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transformOrigin: "20px 6px", transform: open ? "rotate(18deg)" : undefined, transition: "transform 160ms" }}
      />
    </svg>
  );
}

type CtxAction = "open" | "collapse" | "expand-ask" | "expand-here" | "expand-unplotted" | "later" | "unplotted" | "trash";

/** Right-click on a quest or board icon. */
function ContextMenu({
  item,
  x,
  y,
  expand,
  boardOf,
  boardOnMatrix,
  theme,
  onClose,
  onPick,
}: {
  item: Item;
  x: number;
  y: number;
  expand: boolean;
  boardOf: (id: string) => MatrixBoard | undefined;
  boardOnMatrix: (id: string) => boolean;
  theme: "calm" | "adventure";
  onClose: () => void;
  onPick: (a: CtxAction) => void;
}) {
  useEscape(onClose);
  const board = item.kind === "task" && item.task?.board_id ? boardOf(item.task.board_id) : undefined;
  const rows: { a: CtxAction; label: string; hint?: string }[] = [];
  if (expand) {
    rows.push({ a: "expand-here", label: "Plot them all where the board is", hint: "You can drag them apart afterwards" });
    rows.push({ a: "expand-unplotted", label: "Put them all in Not yet plotted", hint: "Then plot them one by one" });
  } else if (item.kind === "board") {
    rows.push({ a: "open", label: "Edit board" });
    rows.push({ a: "expand-ask", label: `Show all ${item.openQuests ?? 0} quests on the matrix`, hint: "Replaces this board icon" });
  } else {
    rows.push({ a: "open", label: "Open quest" });
    if (board) rows.push({ a: "collapse", label: `Collapse all “${board.title}” quests`, hint: boardOnMatrix(board.id) ? "Into its board icon" : "Into one board icon" });
  }
  if (!expand) {
    if (item.lot !== "later") rows.push({ a: "later", label: "Save for later" });
    if (item.lot !== "unplotted") rows.push({ a: "unplotted", label: "Move to Not yet plotted" });
    rows.push({ a: "trash", label: "Remove from priority matrix" });
  }
  const width = 260;
  const left = typeof window === "undefined" ? x : Math.min(Math.max(8, x), window.innerWidth - width - 8);
  const top = typeof window === "undefined" ? y : Math.min(y, window.innerHeight - rows.length * 52 - 24);
  return (
    <>
      <div className="fixed inset-0 z-[57]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        role="menu"
        data-menu="matrix"
        className={`card-pop-in fixed z-[58] flex flex-col overflow-hidden rounded-xl py-1 shadow-2xl ${theme === "adventure" ? "parchment" : ""}`}
        style={{ left, top, width, background: theme === "adventure" ? "var(--t-panel-2)" : "var(--t-card)", border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" }}
      >
        <p className="relative z-[1] m-0 truncate px-3.5 pb-1 pt-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
          {expand ? `Show “${item.title}” quests` : item.title}
        </p>
        {rows.map((r) => (
          <button
            key={r.a}
            type="button"
            role="menuitem"
            data-mi={r.a}
            onClick={() => onPick(r.a)}
            className="relative z-[1] flex min-h-11 flex-col justify-center px-3.5 py-1.5 text-left hover:bg-black/5"
            style={{ color: r.a === "trash" ? "var(--t-warn)" : undefined }}
          >
            <span className="text-[15px]">{r.label}</span>
            {r.hint && (
              <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                {r.hint}
              </span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}
