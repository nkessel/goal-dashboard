"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { completeRiteAction, removeRiteAction, reorderRitesAction, restoreRiteAction, uncompleteRiteAction, updateRiteAction } from "@/app/actions";
import { SwipeToDelete } from "@/components/ui/SwipeToDelete";
import { RecentWins } from "./RecentWins";
import { DayPlanner } from "./DayPlanner";
import { GoldRule, Leaf } from "@/components/ui/Ornaments";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { RiteEditorDialog } from "./RiteEditorDialog";
import { Moon } from "./BeginEveningButton";
import { useFlipToEvening } from "./DayNightFlip";
import { useLocalDay } from "./evening-clock";
import { TomorrowQuests } from "./TomorrowQuests";
import { RiteGlyph, TrophyAvatar, glyphFor } from "./RiteGlyph";
import type { Task } from "@/lib/data/types";
import { fromFeedback } from "@/lib/from-feedback";

/** Client-side copy of a rite (the data module is server-only). */
export type RiteView = {
  id: string;
  title: string;
  description: string | null;
  is_core: boolean;
  xp_value: number;
  /** "day" = a daily habit (day side); otherwise an evening rite. */
  slot?: string | null;
  /** Habits: weekdays it repeats on (0 = Sunday); null = every day. */
  days?: number[] | null;
  /** Habits: due by this time ("17:30"). */
  due_time?: string | null;
  /** Special evening rites with their own content: "wins" or "tomorrow". */
  kind?: string | null;
  /** Habits: a picked portrait (null = the plain checkbox). */
  icon_key?: string | null;
  icon_source?: "library" | "ai" | null;
  /** Habits: coins paid; null = automatic. */
  coin_value?: number | null;
  /** Habits: minutes it usually takes. */
  estimate_minutes?: number | null;
  /** Habits: sub-habits ticked off each day. */
  steps?: { id: string; title: string }[];
};

const CORE_ZONE = "zone:core";
const MINI_ZONE = "zone:mini";
type ListName = "core" | "mini";

/**
 * The rite's seal: its picture (a portrait if it has one, else a small
 * glyph that fits it — a heart, a shirt, an eye…) on a pale ring, turning
 * gold with a check once done tonight. "Celebrate today's wins" wears an
 * illustrated trophy.
 */
function RiteSeal({ done, rite }: { done: boolean; rite?: RiteView }) {
  if (rite?.kind === "wins" || rite?.icon_key) {
    return (
      <span aria-hidden className="relative block h-[52px] w-[52px] shrink-0">
        {rite.kind === "wins" ? (
          <TrophyAvatar size={52} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- rite portrait
          <img src={rite.icon_key!} alt="" className="h-[52px] w-[52px] rounded-full object-cover" style={{ border: "2px solid #8e8aa8" }} />
        )}
        {done && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #a8d88a, #58a04a 60%, #3d7a32)", border: "1.5px solid #fff6e0" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </span>
    );
  }
  const glyph = rite ? glyphFor(rite) : "moon";
  return (
    <span
      aria-hidden
      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full"
      style={{
        background: done ? "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)" : "radial-gradient(circle at 35% 30%, rgba(255,255,255,.6), rgba(214,220,240,.25))",
        border: `2px solid ${done ? "#5a4520" : "#8e8aa8"}`,
        boxShadow: done ? "0 0 14px rgba(242,210,126,.65), inset 0 1px 0 rgba(255,255,255,.5)" : "inset 0 1px 3px rgba(0,0,0,.15)",
      }}
    >
      {done ? (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="qc-card-check">
          <path d="M4.5 12.8 L9.6 17.9 L19.6 6.6" stroke="#2a1c10" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : glyph === "moon" ? (
        <Moon size={24} />
      ) : (
        <RiteGlyph kind={glyph} size={27} />
      )}
    </span>
  );
}

// ---- Skipped / snoozed tonight (kept on this device, cleared each night) ----
type Away = Record<string, "skip" | number>;
const awayKey = (day: string) => `rites-away:${day}`;
function readAway(day: string | null): Away {
  if (!day) return {};
  try {
    return JSON.parse(window.localStorage.getItem(awayKey(day)) ?? "{}") as Away;
  } catch {
    return {};
  }
}
function writeAway(day: string, away: Away) {
  try {
    window.localStorage.setItem(awayKey(day), JSON.stringify(away));
  } catch {
    /* storage unavailable — just this visit */
  }
}
const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
};

/** A drop target with no cards in it (an empty list or the closed tray's bar). */
function Zone({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className} style={isOver ? { boxShadow: "0 0 0 2px rgba(242,210,126,.75)", borderRadius: 16 } : undefined}>
      {children}
    </div>
  );
}

/**
 * The evening side of Today's Quest. Non-negotiable rites sit where Today's
 * Quests do by day; Additional Mini-Quests wait in a tray below. Press and
 * drag to reorder, or to move one between the two. Each rite earns its XP
 * once per night; one can be skipped or snoozed for tonight.
 */
export function EveningRites({
  rites,
  completions,
  theme,
  tomorrow = null,
  todayIds = [],
  openQuests = [],
}: {
  /** Null when the rites tables haven't been created yet. */
  rites: RiteView[] | null;
  completions: { rite_id: string; day: string }[];
  theme: "calm" | "adventure";
  /** Quests already planned for tomorrow (null before that database update). */
  tomorrow?: (Task & { categoryLabel?: string | null })[] | null;
  /** What's on Today's Quests now: tomorrow's starting choice when nothing is chosen yet. */
  todayIds?: string[];
  /** Open quests to plan tomorrow from. */
  openQuests?: (Task & { categoryLabel?: string | null })[];
}) {
  const flip = useFlipToEvening();
  const day = useLocalDay();
  const now = useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / 60_000) * 60_000, () => 0);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<RiteView | { new: true; core: boolean } | null>(null);
  const [miniOpen, setMiniOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pop, setPop] = useState<{ id: string; xp: number } | null>(null);
  const [away, setAway] = useState<Away>({});
  const [error, setError] = useState<string | null>(null);
  // Special rites open to show their content (wins, tomorrow's quests).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Trays opened at least once stay mounted, so closing can slide away.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  // Swiped away: hidden at once, with a moment to undo.
  const [removed, setRemoved] = useState<RiteView | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // Order + which list, kept locally while dragging / saving.
  const [local, setLocal] = useState<{ core: string[]; mini: string[] } | null>(null);
  const [seen, setSeen] = useState(rites);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [startList, setStartList] = useState<ListName | null>(null);
  if (seen !== rites) {
    setSeen(rites);
    if (!activeId) setLocal(null);
  }

  // Load tonight's skips/snoozes once the local day is known (and again if it rolls over).
  const [awayDay, setAwayDay] = useState<string | null>(null);
  if (day !== awayDay) {
    setAwayDay(day);
    setAway(readAway(day));
  }

  const byId = new Map((rites ?? []).map((r) => [r.id, r]));
  const coreIds = local?.core ?? (rites ?? []).filter((r) => r.is_core).map((r) => r.id);
  const miniIds = local?.mini ?? (rites ?? []).filter((r) => !r.is_core).map((r) => r.id);
  const isAway = (id: string) => {
    if (hidden.has(id)) return true;
    const a = away[id];
    return a === "skip" || (typeof a === "number" && a > now);
  };
  const core = coreIds.map((id) => byId.get(id)).filter((r): r is RiteView => !!r && !isAway(r.id));
  const mini = miniIds.map((id) => byId.get(id)).filter((r): r is RiteView => !!r && !isAway(r.id));
  const awayList = (rites ?? []).filter((r) => isAway(r.id) && !hidden.has(r.id));
  const tomorrowRite = (rites ?? []).find((r) => r.kind === "tomorrow");

  const doneTonight = (id: string) => optimistic[id] ?? completions.some((c) => c.rite_id === id && c.day === day);
  const coreDone = core.filter((r) => doneTonight(r.id)).length;
  const allDone = core.length > 0 && coreDone === core.length;

  function toggle(r: RiteView) {
    if (!day) return;
    const next = !doneTonight(r.id);
    setError(null);
    setOptimistic((o) => ({ ...o, [r.id]: next }));
    if (next && r.xp_value > 0) {
      setPop({ id: r.id, xp: r.xp_value });
      setTimeout(() => setPop((p) => (p?.id === r.id ? null : p)), 1500);
    }
    startTransition(async () => {
      try {
        if (next) await completeRiteAction(r.id, day);
        else await uncompleteRiteAction(r.id, day);
      } catch (e) {
        setOptimistic((o) => ({ ...o, [r.id]: !next }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  const isOpen = (r: RiteView) => expanded[r.id] ?? false;
  const toggleOpen = (r: RiteView) => {
    setOpened((o) => (o[r.id] ? o : { ...o, [r.id]: true }));
    setExpanded((x) => ({ ...x, [r.id]: !isOpen(r) }));
  };

  /**
   * Choosing tomorrow's quests is one rite: it completes itself once three or
   * more are chosen (or with a tap, for a lighter day), and undoes itself if
   * every quest is taken back out.
   */
  const [tomorrowCount, setTomorrowCount] = useState<number | null>(null);
  const chosenTomorrow = tomorrowCount ?? tomorrow?.length ?? 0;
  function syncTomorrow(r: RiteView, filled: number) {
    setTomorrowCount(filled);
    const done = doneTonight(r.id);
    if ((filled >= 3 && !done) || (filled === 0 && done)) toggle(r);
  }

  function remove(r: RiteView) {
    setHidden((h) => new Set(h).add(r.id));
    setRemoved(r);
    setError(null);
    startTransition(async () => {
      try {
        await removeRiteAction(r.id);
      } catch (e) {
        setHidden((h) => {
          const n = new Set(h);
          n.delete(r.id);
          return n;
        });
        setRemoved(null);
        setError(e instanceof Error ? e.message : "Couldn't remove that rite.");
      }
    });
    setTimeout(() => setRemoved((x) => (x?.id === r.id ? null : x)), 6000);
  }

  function undoRemove() {
    const r = removed;
    if (!r) return;
    setRemoved(null);
    setHidden((h) => {
      const n = new Set(h);
      n.delete(r.id);
      return n;
    });
    startTransition(async () => {
      try {
        await restoreRiteAction(r.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't bring it back.");
      }
    });
  }

  function setAwayFor(id: string, value: "skip" | number | null) {
    if (!day) return;
    const next = { ...away };
    if (value === null) delete next[id];
    else next[id] = value;
    setAway(next);
    writeAway(day, next);
    setMenuFor(null);
  }

  // A tap outside closes a rite's menu.
  useEffect(() => {
    if (!menuFor) return;
    const onDown = (e: PointerEvent) => {
      if (fromFeedback(e)) return;
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.("[data-rite-menu]") && !t?.closest?.("[data-rite-menu-button]")) setMenuFor(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuFor]);

  // ---- Drag and drop -------------------------------------------------------
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const listOf = (id: string | null | undefined): ListName | null => {
    if (!id) return null;
    if (id === CORE_ZONE) return "core";
    if (id === MINI_ZONE) return "mini";
    if (coreIds.includes(id)) return "core";
    if (miniIds.includes(id)) return "mini";
    return null;
  };
  const collision: CollisionDetection = (args) => {
    const zones = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id === CORE_ZONE || c.id === MINI_ZONE) });
    const bar = zones.find((z) => z.id === MINI_ZONE && !miniOpen);
    if (bar) return [bar];
    const cards = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== CORE_ZONE && c.id !== MINI_ZONE) });
    return cards.length ? cards : zones;
  };
  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    setStartList(listOf(id));
    setLocal({ core: coreIds, mini: miniIds });
    setMenuFor(null);
  }
  function onDragOver(e: DragOverEvent) {
    const id = String(e.active.id);
    const from = listOf(id);
    const to = listOf(e.over ? String(e.over.id) : null);
    if (!from || !to || from === to) return;
    const source = from === "core" ? coreIds : miniIds;
    const target = to === "core" ? coreIds : miniIds;
    const overIndex = e.over ? target.indexOf(String(e.over.id)) : -1;
    const nextTarget = [...target];
    nextTarget.splice(overIndex === -1 ? target.length : overIndex, 0, id);
    const nextSource = source.filter((x) => x !== id);
    setLocal(from === "core" ? { core: nextSource, mini: nextTarget } : { core: nextTarget, mini: nextSource });
  }
  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const list = listOf(id);
    let nextCore = coreIds;
    let nextMini = miniIds;
    if (list && e.over) {
      const items = list === "core" ? coreIds : miniIds;
      const from = items.indexOf(id);
      const to = items.indexOf(String(e.over.id));
      if (from !== -1 && to !== -1 && from !== to) {
        if (list === "core") nextCore = arrayMove(items, from, to);
        else nextMini = arrayMove(items, from, to);
      }
    }
    setLocal({ core: nextCore, mini: nextMini });
    setActiveId(null);
    const crossed = list && startList && list !== startList;
    setStartList(null);
    if (!list) return;
    startTransition(async () => {
      try {
        if (crossed) await updateRiteAction(id, { isCore: list === "core" });
        await reorderRitesAction([...nextCore, ...nextMini]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't move that rite.");
        setLocal(null);
      }
    });
  }

  function card(r: RiteView, overlay = false) {
    const done = doneTonight(r.id);
    const special = r.kind === "wins" || r.kind === "tomorrow" || r.kind === "plan";
    const open = special && !overlay && isOpen(r);
    const inner = (
      <div
        className={`parchment moonlit relative flex flex-col rounded-2xl px-3 py-3 ${done ? "rite-done" : ""}`}
        style={{ borderRadius: 16 }}
        onContextMenu={(e) => {
          if (overlay) return;
          e.preventDefault();
          setMenuFor(r.id);
        }}
      >
      <div className="flex items-center gap-3">
        {r.kind === "tomorrow" && chosenTomorrow === 0 && !done ? (
          // Nothing chosen yet: the seal opens the list instead.
          <button type="button" onClick={() => toggleOpen(r)} aria-label={`${r.title}: choose a quest first`} className="relative z-[1] rounded-full">
            <RiteSeal done={done} rite={r} />
          </button>
        ) : (
          <button type="button" onClick={() => toggle(r)} aria-pressed={done} aria-label={done ? `Undo ${r.title}` : `Complete ${r.title}`} className="relative z-[1] rounded-full">
            <RiteSeal done={done} rite={r} />
          </button>
        )}
        <button
          type="button"
          onClick={() => (special ? toggleOpen(r) : setEditing(r))}
          aria-expanded={special ? open : undefined}
          title={special ? (open ? "Fold away" : "Open") : "Edit rite"}
          className="relative z-[1] min-w-0 flex-1 text-left"
        >
          <span className="block break-words text-[18px] font-semibold leading-tight" style={{ color: "var(--t-ink)", textDecoration: done ? "line-through" : undefined, textDecorationColor: "rgba(80,60,20,.45)" }}>
            {r.title}
          </span>
          {r.description && (
            <span className="mt-0.5 block break-words text-[14px] leading-snug" style={{ color: "#4d4535" }}>
              {r.description}
            </span>
          )}

        </button>
        <span className="relative z-[1] flex shrink-0 flex-col items-end gap-1">
          <span className="text-[18px] font-bold leading-none" style={{ color: "var(--t-xp)" }}>
            +{r.xp_value} XP
          </span>
          {!done && !overlay && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              data-rite-menu-button
              onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}
              aria-label={`More for ${r.title}`}
              aria-expanded={menuFor === r.id}
              className="flex h-8 items-center rounded-full px-2 text-[18px] leading-none"
              style={{ color: "var(--t-ink-soft)" }}
            >
              ⋯
            </button>
          )}
        </span>
        {menuFor === r.id && !overlay && (
          <div data-rite-menu data-menu="rite" role="menu" className="card-pop-in absolute right-2 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-xl parchment" style={{ borderRadius: 12, minWidth: 190 }}>
            {!special && (
              <button
                type="button"
                role="menuitem"
                data-mi="edit"
                onClick={() => {
                  setMenuFor(null);
                  setEditing(r);
                }}
                className="relative z-[1] flex min-h-11 items-center gap-2.5 px-4 text-left text-[15px] hover:bg-black/5"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Edit
              </button>
            )}
            <button type="button" role="menuitem" data-mi="skip" onClick={() => setAwayFor(r.id, "skip")} className="relative z-[1] flex min-h-11 items-center gap-2.5 border-t px-4 text-left text-[15px] hover:bg-black/5" style={{ borderColor: "rgba(139,112,64,.3)" }}>
              <span aria-hidden className="w-4 text-center">⤼</span>
              Skip tonight
            </button>
            {!special && (
              <button
                type="button"
                role="menuitem"
                data-mi="delete"
                onClick={() => {
                  setMenuFor(null);
                  remove(r);
                }}
                className="relative z-[1] flex min-h-11 items-center gap-2.5 border-t px-4 text-left text-[15px] hover:bg-black/5"
                style={{ borderColor: "rgba(139,112,64,.3)", color: "var(--t-warn)" }}
              >
                <TrashGlyph />
                Delete
              </button>
            )}
          </div>
        )}
        {pop?.id === r.id && (
          <span aria-hidden className="power-spark pointer-events-none absolute left-1/2 top-0 z-[2] text-[17px] font-bold" style={{ color: "var(--t-xp)" }}>
            +{pop.xp} XP
          </span>
        )}
      </div>
      </div>
    );
    // Special rites slide a tray out from under the card: today's wins on
    // parchment (like Victories Today); tomorrow's quests and the day plan on
    // the night's dark tray.
    const tray =
      special && !overlay && (opened[r.id] || open) ? (
        <div className="drawer-body relative z-0" data-open={open ? "true" : "false"}>
          <div className="drawer-inner">
            <div
              className={r.kind === "wins" ? "parchment parchment-framed -mt-3 rounded-b-2xl px-4 pb-3 pt-6" : "-mt-3 rounded-b-2xl px-2.5 pb-3 pt-6 sm:px-3"}
              style={
                r.kind === "wins"
                  ? { borderTopLeftRadius: 4, borderTopRightRadius: 4 }
                  : { background: "linear-gradient(180deg, rgba(6,8,24,.78), rgba(10,12,32,.62))", border: "1px solid rgba(217,180,95,.22)", borderTop: "none", boxShadow: "inset 0 10px 14px -10px rgba(0,0,0,.8), inset 0 -6px 10px -6px rgba(0,0,0,.6)" }
              }
              // Its own controls (buttons, inner drag, scrolling) shouldn't start dragging the rite card.
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <div className="relative z-[1]">
                {r.kind === "wins" ? (
                  <RecentWins day={day} onHide={() => toggleOpen(r)} />
                ) : r.kind === "plan" ? (
                  <DayPlanner day={day} chosen={tomorrow ?? []} theme={theme} onHide={() => toggleOpen(r)} />
                ) : (
                  <TomorrowQuests heading={false} queued={tomorrow} todayIds={todayIds} candidates={openQuests} theme={theme} onCountChange={(n) => syncTomorrow(r, n)} />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null;
    const withTray = tray ? (
      <div className="flex flex-col">
        <div className="relative z-[1]">{inner}</div>
        {tray}
      </div>
    ) : (
      inner
    );
    return overlay || special ? withTray : <SwipeToDelete label={r.title} onDelete={() => remove(r)}>{inner}</SwipeToDelete>;
  }

  const active = activeId ? byId.get(activeId) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header, where Today's Quests sit by day */}
      <div className="flex flex-col items-center gap-1.5 pt-1 text-center">
        <div className="flex w-full items-center gap-2">
          <span className="hidden flex-1 sm:flex">
            <GoldRule dir="left" />
          </span>
          <span className="flex-1 sm:hidden" />
          <Leaf flip />
          <h2 className="font-display m-0 whitespace-nowrap text-[23px] leading-none sm:text-[27px]" style={{ color: "#f1ead2", textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>
            Evening Rites
            <span className="ml-2 align-middle text-[14px] font-normal" style={{ color: "var(--t-gold)" }}>
              {coreDone}/{core.length}
            </span>
          </h2>
          <Leaf />
          <span className="hidden flex-1 sm:flex">
            <GoldRule dir="right" />
          </span>
          <span className="flex-1 sm:hidden" />
        </div>
        <p className="m-0 text-[15px]" style={{ color: "#d9d2bd", opacity: 0.85 }}>
          The non-negotiables, before the day is done.
        </p>
      </div>

      {rites === null ? (
        <p className="parchment moonlit rounded-2xl p-5 text-center text-[16px]" style={{ color: "var(--t-ink)" }}>
          The evening rites need a quick database update before they can be saved. Once it&apos;s run, your rites appear here.
        </p>
      ) : (
        <DndContext id="dnd-EveningRites" sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setLocal(null))}>
          {error && (
            <p className="rounded-lg px-3 py-2 text-center text-[14.5px] font-semibold" style={{ background: "var(--t-warn-bg)", color: "var(--t-warn)" }}>
              {error}
            </p>
          )}

          {/* The rites themselves, in a subtle section of their own */}
          <section className="rounded-3xl px-2.5 pb-3 pt-3" style={{ background: "rgba(8,10,30,.35)", border: "1px solid rgba(217,180,95,.2)" }}>
            <Zone id={CORE_ZONE}>
              <SortableContext items={core.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <ul className="m-0 flex min-h-[48px] list-none flex-col gap-3 p-0">
                  {core.map((r) => (
                    <SortableRite key={r.id} id={r.id} raised={menuFor === r.id}>
                      {card(r)}
                    </SortableRite>
                  ))}
                </ul>
              </SortableContext>
              {core.length === 0 && (
                <p className="-mt-10 px-2 py-3 text-center text-[14.5px]" style={{ color: "#d9d2bd", opacity: 0.75 }}>
                  Drag a mini-quest up here to make it a rite.
                </p>
              )}
            </Zone>
          </section>

          {awayList.length > 0 && (
            <p className="-mt-2 text-center text-[13.5px]" style={{ color: "#d9d2bd", opacity: 0.8 }}>
              {awayList.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && " · "}
                  {r.title} {away[r.id] === "skip" ? "skipped" : `until ${new Date(away[r.id] as number).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}{" "}
                  <button type="button" onClick={() => setAwayFor(r.id, null)} className="underline">
                    bring back
                  </button>
                </span>
              ))}
            </p>
          )}

          {allDone && (
            <div className="rest-well flex items-center justify-center gap-2.5 rounded-2xl px-5 py-3 text-center text-[18px]" style={{ color: "#f8e3a0" }}>
              ✨ <span className="font-display">All rites complete — rest well.</span>
            </div>
          )}

          {!tomorrowRite && <TomorrowQuests queued={tomorrow} todayIds={todayIds} candidates={openQuests} theme={theme} />}

          {removed && (
            <p role="status" className="fade-in -mt-2 text-center text-[14px]" style={{ color: "#d9d2bd" }}>
              Removed “{removed.title}” ·{" "}
              <button type="button" onClick={undoRemove} className="font-semibold underline" style={{ color: "var(--t-gold)" }}>
                Undo
              </button>
            </p>
          )}

          {/* Additional Mini-Quests: a tray that slides open */}
          <section>
            <Zone id={MINI_ZONE}>
              <button
                type="button"
                onClick={() => setMiniOpen((v) => !v)}
                aria-expanded={miniOpen}
                className="hover-glow evening-bar relative flex min-h-[58px] w-full items-center justify-center rounded-2xl px-11 py-2.5"
              >
                <span className="font-display flex items-center gap-2.5 text-[19px] sm:text-[21px]" style={{ color: "#f1ead2" }}>
                  <Moon size={26} />
                  Additional Mini-Quests
                  <span className="text-[15px] font-normal" style={{ color: "var(--t-gold)" }}>
                    ({mini.length})
                  </span>
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="absolute right-5 transition-transform duration-300" style={{ transform: miniOpen ? "rotate(180deg)" : undefined }}>
                  <path d="M5.5 9l6.5 6.5L18.5 9" stroke="#f1ead2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </Zone>
            <div className="drawer-body" data-open={miniOpen ? "true" : "false"}>
              <div className="drawer-inner -mx-2 px-2">
                <div
                  className="quest-tray mt-2.5 flex max-h-[min(58vh,520px)] flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl px-2 pb-3 pt-3"
                  style={{ background: "rgba(6,8,24,.45)", boxShadow: "inset 0 6px 10px -6px rgba(0,0,0,.6), inset 0 -6px 10px -6px rgba(0,0,0,.6)" }}
                >
                  <SortableContext items={mini.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {mini.map((r) => (
                        <SortableRite key={r.id} id={r.id} disabled={!miniOpen} raised={menuFor === r.id}>
                          {card(r)}
                        </SortableRite>
                      ))}
                    </ul>
                  </SortableContext>
                  <button
                    type="button"
                    onClick={() => setEditing({ new: true, core: false })}
                    className="hover-glow flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-[16px]"
                    style={{ borderColor: "rgba(217,180,95,.45)", background: "rgba(8,10,26,.3)", color: "#f1ead2" }}
                  >
                    <span className="text-xl leading-none" style={{ color: "var(--t-gold)" }}>
                      +
                    </span>
                    Add a mini-quest
                  </button>
                </div>
              </div>
            </div>
          </section>

          <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }}>
            {active ? <div style={{ transform: "scale(1.02)", filter: "drop-shadow(0 12px 18px rgba(0,0,0,.5))" }}>{card(active, true)}</div> : null}
          </DragOverlay>
        </DndContext>
      )}

      <button
        type="button"
        onClick={() => flip(false)}
        className="hover-glow day-cta flex min-h-[54px] w-full items-center justify-center gap-3 rounded-2xl px-5 text-[19px]"
      >
        <span aria-hidden className="text-[22px]">
          ☀
        </span>
        <span className="font-display">Return to the day</span>
      </button>

      <AddTaskForm theme={theme} initial="rite" />

      {editing && (
        <RiteEditorDialog
          rite={"new" in editing ? undefined : editing}
          defaultCore={"new" in editing ? editing.core : true}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** One rite card that can be pressed and dragged (mouse after a short move, touch after a short hold). */
function SortableRite({ id, disabled = false, raised = false, children }: { id: string; disabled?: boolean; raised?: boolean; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="board-sortable touch-manipulation"
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1, position: "relative", zIndex: raised ? 30 : undefined }}
    >
      {children}
    </li>
  );
}

function TrashGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7M9.5 7V4.5h5V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
