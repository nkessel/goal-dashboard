"use client";

import { talkToToucan } from "@/components/toucan/ToucanGuide";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
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
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/lib/data/types";
import { useRouter } from "next/navigation";
import { findSlot } from "./place-next";
import {
  applyAutoScheduleAction,
  unscheduleTaskAction,
  deleteSchedulingFolderAction,
  moveSchedulingFolderAction,
  moveOffSchedulingAction,
  moveToSchedulingAction,
  renameSchedulingFolderAction,
  reorderSchedulingAction,
  setSchedulingAction,
  setSchedulingFoldersAction,
  toggleManualPriorityAction,
  type SchedHabit,
} from "@/app/actions";
import { localDayKey } from "@/lib/auto-schedule";
import { saveDayHold } from "@/lib/day-holds";
import { HORIZON_LABELS, HORIZON_ORDER, horizonOf, planByFor, type HorizonKey } from "@/lib/schedule-horizon";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { carryQuest, useCarried, QUEST_DRAG_TYPE } from "@/lib/schedule-carry";
import { fromFeedback } from "@/lib/from-feedback";
import { FloatingWindow } from "@/components/ui/FloatingWindow";

type Folder = { name: string; open: boolean };

const OPEN_KEY = "scheduling-drawer-open";
const NUMBERED = 3;
const GROUP = "group:";
/** The loose (unfiled) list's group key. */
const LOOSE = "";

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

type Sec = "today" | "additional" | "habits" | "list";
const SECS: Sec[] = ["today", "additional", "habits", "list"];
const SEC_KEY = "S:";
const UI_KEY = "auto-scheduler-ui";
type Ui = { order: Sec[]; shut: Sec[]; items: Partial<Record<Sec, string[]>>; byWhen: boolean };
const UI_DEFAULT: Ui = { order: SECS, shut: ["additional"], items: {}, byWhen: true };
type Sections = { today: Task[]; additional: Task[]; habits: SchedHabit[]; settings: Record<string, unknown> | null };
type Next = { kind: "task"; task: Task } | { kind: "habit"; habit: SchedHabit };
type Placed = { id: string; title: string; at: Date; habit: boolean };

const hasTime = (t: Task) => !!(t.is_on_calendar && t.scheduled_start);
const clockOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

/**
 * The auto-scheduler, beside the calendar (owner, Nov 6: "the more urgent things get scheduled first"):
 * Today's quests, Additional quests and today's habits as sections on top (drag a section by its name to
 * reorder; drag a quest within, between them or onto the calendar), then the list to schedule, grouped by
 * how soon each needs a time (This week, Next week, In 2 weeks… by plan-by, else due date) or by your own
 * folders. ✨ Auto-schedule takes the next one, open sections in order, the list soonest first.
 */
export function SchedulingDrawer({ tasks, folders: initialFolders, theme, today = null, sections = null }: { tasks: Task[]; folders: Folder[]; theme: "calm" | "adventure"; /** Plan my day: that day's quests, in the Today section (owner, Nov 3). */ today?: { day: string; tasks: Task[] } | null; sections?: Sections | null }) {
  const wide = useWide();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // On wide screens it floats: drag it by its title, – tucks it into a chip (owner, Nov 2).
  const [min, setMin] = useState(false);
  const [ui, setUi] = useState<Ui>(UI_DEFAULT);
  const [nowMs] = useState(() => Date.now());
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      setMin(window.localStorage.getItem("scheduling-min") === "1");
      const raw = JSON.parse(window.localStorage.getItem(UI_KEY) || "null") as Partial<Ui> | null;
      if (raw && typeof raw === "object") {
        const order = Array.isArray(raw.order) ? raw.order.filter((s): s is Sec => SECS.includes(s)) : [];
        setUi({ order: [...order, ...SECS.filter((s) => !order.includes(s))], shut: Array.isArray(raw.shut) ? raw.shut : UI_DEFAULT.shut, items: raw.items && typeof raw.items === "object" ? raw.items : {}, byWhen: raw.byWhen !== false });
      }
    } catch {
      /* storage unavailable */
    }
  }, []);
  function saveUi(next: Ui) {
    setUi(next);
    try {
      window.localStorage.setItem(UI_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }
  // On the calendar its toolbar pill already opens it, so a minimized window leaves no second chip there (owner, Nov 5).
  const [hasPill, setHasPill] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the toolbar is only findable after it mounts
    setHasPill(!!document.querySelector("[data-scheduling-pill]"));
  }, []);
  function minimize(v: boolean) {
    setMin(v);
    try {
      window.localStorage.setItem("scheduling-min", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
  const [seen, setSeen] = useState({ tasks, sections, today });
  // Where things are while a move is saving (the page's lists catch up on refresh).
  const [layout, setLayout] = useState<Record<string, string[]> | null>(null);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [seenFolders, setSeenFolders] = useState(initialFolders);
  const [editing, setEditing] = useState<Task | null>(null);
  const [moving, setMoving] = useState<{ task: Task; x: number; y: number } | null>(null);
  const [folderMenu, setFolderMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  // ✨ Auto-schedule: the next one goes into the first free slot, a moment to undo.
  const [placing, setPlacing] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (seen.tasks !== tasks || seen.sections !== sections || seen.today !== today) {
    setSeen({ tasks, sections, today });
    setLayout(null);
  }
  if (seenFolders !== initialFolders) {
    setSeenFolders(initialFolders);
    setFolders(initialFolders);
  }

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(OPEN_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      setOpen(v === null ? window.matchMedia("(min-width: 1024px)").matches : v === "1");
      // Arrived from Plan my day or Today's "waiting for a time" card: the list opens, not minimized.
      const q = new URLSearchParams(window.location.search);
      if (q.get("auto") === "1" || q.get("plan")) {
        setOpen(true);
        setMin(false);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);
  function toggle(next = !open) {
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
  // The calendar button on the calendar's top-left corner opens (or closes) it.
  useEffect(() => {
    // A minimized list comes back up rather than closing.
    const on = () => (open && min ? minimize(false) : toggle(!open));
    window.addEventListener("open-scheduling", on);
    return () => window.removeEventListener("open-scheduling", on);
  });
  useEffect(() => {
    if (!open || wide) return;
    const key = (e: KeyboardEvent) => !fromFeedback(e) && e.key === "Escape" && !editing && toggle(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // ---- What's where -------------------------------------------------------
  const now = new Date(nowMs);
  const todayTasks = (today?.tasks ?? sections?.today ?? []).filter((t) => !hasTime(t) && t.schedule_rank == null);
  const addTasks = (sections?.additional ?? []).filter((t) => !hasTime(t));
  const habits = sections?.habits ?? [];
  const taskById = new Map<string, Task>([...addTasks, ...todayTasks, ...tasks].map((t) => [t.id, t]));
  const habitById = new Map(habits.map((h) => [`h:${h.id}`, h]));
  const dayKeyNow = localDayKey(now);
  const holds = ((sections?.settings as { essentialDays?: Record<string, Record<string, { at?: number }>> } | null)?.essentialDays ?? {})[dayKeyNow] ?? {};
  const habitAt = (h: SchedHabit): string | null => {
    const at = holds[`h:${h.id}`]?.at;
    if (at != null) return clockOf(`${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")}`);
    return null;
  };
  const habitPlaceable = (h: SchedHabit) => !h.due_time && habitAt(h) === null;
  const ordered = (sec: Sec, ids: string[]) => {
    const saved = (ui.items[sec] ?? []).filter((id) => ids.includes(id));
    return [...saved, ...ids.filter((id) => !saved.includes(id))];
  };
  const known = new Set(folders.map((f) => f.name));
  const listIds = tasks.map((t) => t.id);
  const folderOfTask = (t: Task) => (t.schedule_folder && known.has(t.schedule_folder) ? t.schedule_folder : LOOSE);
  const rank = (h: HorizonKey) => HORIZON_ORDER.indexOf(h);
  const base: Record<string, string[]> = {
    "sec:today": ordered("today", todayTasks.map((t) => t.id)),
    "sec:additional": ordered("additional", addTasks.map((t) => t.id)),
    "sec:habits": ordered("habits", habits.map((h) => `h:${h.id}`)),
  };
  if (ui.byWhen) for (const h of HORIZON_ORDER) base[`b:${h}`] = listIds.filter((id) => horizonOf(taskById.get(id)!, now) === h);
  else {
    base[`f:${LOOSE}`] = listIds.filter((id) => folderOfTask(taskById.get(id)!) === LOOSE);
    for (const f of folders) base[`f:${f.name}`] = listIds.filter((id) => folderOfTask(taskById.get(id)!) === f.name);
  }
  const boxes = layout ?? base;
  const listKeys = Object.keys(boxes).filter((k) => !k.startsWith("sec:"));
  const flatList = () => listKeys.flatMap((k) => boxes[k]);
  const boxOf = (id: string) => Object.keys(boxes).find((k) => boxes[k].includes(id)) ?? null;
  const count = listKeys.reduce((n, k) => n + boxes[k].length, 0) + boxes["sec:today"].length;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const collision: CollisionDetection = (args) => {
    const isSec = String(args.active.id).startsWith(SEC_KEY);
    const pool = args.droppableContainers.filter((c) => String(c.id).startsWith(SEC_KEY) === isSec);
    const a = { ...args, droppableContainers: pool };
    if (isSec) return closestCenter(a);
    const hits = pointerWithin(a);
    // Prefer a quest under the pointer over the group around it.
    const rows = hits.filter((h) => !String(h.id).startsWith(GROUP));
    if (rows.length) return rows;
    return hits.length ? hits : closestCenter(a);
  };

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setLayout(null);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    const a = String(e.active.id);
    const o = String(e.over.id);
    if (a === o) return;
    if (a.startsWith(SEC_KEY)) {
      const order = arrayMove(ui.order, ui.order.indexOf(a.slice(SEC_KEY.length) as Sec), ui.order.indexOf(o.slice(SEC_KEY.length) as Sec));
      return saveUi({ ...ui, order });
    }
    const from = boxOf(a);
    const to = o.startsWith(GROUP) ? o.slice(GROUP.length) : boxOf(o);
    if (!from || !to || !(to in boxes)) return;
    // Habits stay with the habits (onto the calendar is the way out); quests stay out of them.
    if ((from === "sec:habits") !== (to === "sec:habits")) return;
    const next: Record<string, string[]> = Object.fromEntries(Object.entries(boxes).map(([k, v]) => [k, v.filter((x) => x !== a)]));
    const at = o.startsWith(GROUP) ? next[to].length : Math.max(0, next[to].indexOf(o) + (from === to && boxes[to].indexOf(a) < boxes[to].indexOf(o) ? 1 : 0));
    next[to].splice(at, 0, a);
    setLayout(next);
    const order = listKeys.flatMap((k) => next[k]);
    if (to.startsWith("sec:")) saveUi({ ...ui, items: { ...ui.items, [to.slice(4)]: next[to] } });
    if (from === to) {
      if (!to.startsWith("sec:")) run(() => reorderSchedulingAction(order));
      return;
    }
    if (to === "sec:today" || to === "sec:additional") {
      const toToday = to === "sec:today";
      run(() => (from.startsWith("sec:") ? toggleManualPriorityAction(a, toToday) : moveOffSchedulingAction(a, toToday)));
    } else if (to.startsWith("b:")) {
      run(() => moveToSchedulingAction(a, planByFor(to.slice(2) as HorizonKey, new Date()), order));
    } else {
      run(() => moveSchedulingFolderAction(a, to.slice(2) || null, order));
    }
  }

  function remove(id: string) {
    setLayout(Object.fromEntries(Object.entries(boxes).map(([k, v]) => [k, v.filter((x) => x !== id)])));
    run(() => setSchedulingAction(id, null));
  }
  /** Right-click "Move to…": a group of the list. */
  function moveTo(id: string, to: string) {
    const next: Record<string, string[]> = Object.fromEntries(Object.entries(boxes).map(([k, v]) => [k, v.filter((x) => x !== id)]));
    if (!next[to]) return;
    next[to].push(id);
    setLayout(next);
    const order = listKeys.flatMap((k) => next[k]);
    if (to.startsWith("b:")) run(() => moveToSchedulingAction(id, planByFor(to.slice(2) as HorizonKey, new Date()), order));
    else run(() => moveSchedulingFolderAction(id, to.slice(2) || null, order));
  }

  function saveFolders(next: Folder[]) {
    const prev = folders;
    setFolders(next);
    setError(null);
    startTransition(async () => {
      try {
        await setSchedulingFoldersAction(next);
      } catch (e) {
        setFolders(prev);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  function addFolder(name: string) {
    const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
    setAdding(false);
    if (!n || folders.some((f) => f.name.toLowerCase() === n.toLowerCase())) return;
    saveFolders([...folders, { name: n, open: true }]);
  }
  function rename(from: string, to: string) {
    setRenaming(null);
    const n = to.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!n || n === from) return;
    setFolders(folders.map((f) => (f.name === from ? { ...f, name: n } : f)));
    run(() => renameSchedulingFolderAction(from, n));
  }
  function dropFolder(name: string) {
    setFolders(folders.filter((f) => f.name !== name));
    run(() => deleteSchedulingFolderAction(name));
  }

  const isAdventure = theme === "adventure";
  const carried = useCarried();
  /** Pick a quest (or habit) up to place on the calendar (tap again to put it back). */
  function carry(c: { id: string; title: string; minutes: number }) {
    if (carried?.id === c.id) return carryQuest(null);
    carryQuest(c);
    if (!wide) minimize(true); // out of the way of the calendar; its chip stays
  }
  const carryOf = (t: Task) => ({ id: t.id, title: t.title, minutes: Math.max(15, t.estimate_minutes ?? 60) });

  /** What a section offers to ✨, in its order: quests without a time, habits that float, the list soonest first. */
  const placeable = (sec: Sec | string): Next[] => {
    if (sec === "habits" || sec === "sec:habits") return boxes["sec:habits"].map((id) => habitById.get(id)).filter((h): h is SchedHabit => !!h && habitPlaceable(h)).map((habit) => ({ kind: "habit", habit }));
    const fromIds = (ids: string[]) => ids.map((id) => taskById.get(id)).filter((t): t is Task => !!t && !hasTime(t)).map((task): Next => ({ kind: "task", task }));
    if (sec === "today" || sec === "additional") return fromIds(boxes[`sec:${sec}`]);
    if (sec === "list") {
      const ids = flatList();
      return fromIds([...ids].sort((x, y) => rank(horizonOf(taskById.get(x)!, now)) - rank(horizonOf(taskById.get(y)!, now)) || ids.indexOf(x) - ids.indexOf(y)));
    }
    return fromIds(boxes[sec] ?? []);
  };
  /** The next one waiting: open sections in their order (a folded section waits). */
  const nextUp = (): Next | null => {
    for (const s of ui.order) {
      if (ui.shut.includes(s)) continue;
      const n = placeable(s)[0];
      if (n) return n;
    }
    return null;
  };
  const nameOf = (n: Next) => (n.kind === "task" ? n.task.title : n.habit.title);
  const planDay = today ? new Date(`${today.day}T12:00:00`) : undefined;

  async function placeOne(n: Next): Promise<Placed | null> {
    if (n.kind === "habit") {
      const h = n.habit;
      const slot = await findSlot({ id: h.id, title: h.title, estimate_minutes: h.minutes, effort: undefined, due_at: null, plan_by: null }, planDay ?? new Date());
      if (!slot) return null;
      await saveDayHold(sections?.settings ?? null, localDayKey(slot.start), `h:${h.id}`, { at: slot.start.getHours() * 60 + slot.start.getMinutes(), minutes: h.minutes });
      return { id: h.id, title: h.title, at: slot.start, habit: true };
    }
    const t = n.task;
    const slot = await findSlot(t, today && boxes["sec:today"].includes(t.id) ? planDay : undefined);
    if (!slot) return null;
    await applyAutoScheduleAction([{ taskId: t.id, startISO: slot.start.toISOString(), endISO: slot.end.toISOString() }]);
    return { id: t.id, title: t.title, at: slot.start, habit: false };
  }
  /** ✨ the next one, or every one in a group (up to 12 at a time). */
  function autoPlace(list: Next[], key: string) {
    if (!list.length || placing) return;
    setPlacing(key);
    setError(null);
    setPlaced([]);
    (async () => {
      const done: Placed[] = [];
      const missed: string[] = [];
      for (const n of list.slice(0, 12)) {
        const p = await placeOne(n);
        if (p) {
          done.push(p);
          setPlaced([...done]);
        } else missed.push(nameOf(n));
      }
      if (missed.length) setError(`No free time found for ${missed.map((m) => `“${m}”`).join(", ")}${planDay ? " that day" : " in the next two weeks"}.`);
      router.refresh();
    })()
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't place it."))
      .finally(() => setPlacing(null));
  }
  function undoPlaced() {
    const ps = placed;
    if (!ps.length) return;
    setPlaced([]);
    (async () => {
      for (const p of ps) {
        if (p.habit) await saveDayHold(sections?.settings ?? null, localDayKey(p.at), `h:${p.id}`, null);
        else await unscheduleTaskAction(p.id);
      }
      router.refresh();
    })().catch((e) => setError(e instanceof Error ? e.message : "Couldn't take it back."));
  }

  const next = nextUp();
  const soft = "var(--t-ink-soft)";
  const ink = "var(--t-ink)";
  const gold: React.CSSProperties = isAdventure ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { background: "var(--t-accent)", color: "#fff" };
  const sparkle = (list: Next[], key: string, what: string) =>
    list.length > 0 && (
      <button type="button" onClick={() => autoPlace(list, key)} disabled={!!placing} className="h-7 shrink-0 whitespace-nowrap rounded-full px-2 text-[12px] font-semibold hover:bg-black/[.06] disabled:opacity-50" style={{ color: ink, border: "1px solid rgba(139,112,64,.45)" }} title={`Find a time for ${list.length > 12 ? "the first 12" : list.length === 1 ? "it" : `all ${list.length}`} in ${what}`}>
        {placing === key ? "…" : `✨ ${list.length > 12 ? 12 : list.length === 1 ? "1" : `All ${list.length}`}`}
      </button>
    );

  const taskRow = (id: string, n: number | null, divider: boolean, onRemove?: () => void) => {
    const t = taskById.get(id);
    if (!t) return null;
    return <Row key={id} task={t} n={n} dividerBefore={divider} onOpen={() => setEditing(t)} onPlace={() => carry(carryOf(t))} placing={carried?.id === id} onMove={(x, y) => setMoving({ task: t, x, y })} onRemove={onRemove} />;
  };
  const empty = (words: string) => (
    <p className="m-0 px-1.5 py-1 text-[13px] italic" style={{ color: soft }}>
      {words}
    </p>
  );

  const sectionBody = (s: Sec) => {
    if (s === "today" || s === "additional") {
      const ids = boxes[`sec:${s}`];
      return (
        <GroupZone id={`sec:${s}`}>
          {ids.length === 0 ? (
            empty(s === "today" ? (today?.tasks.length || sections?.today.length ? "All of them have a time. 🎉" : "No quests on Today yet. Drag one here to add it.") : "Nothing here without a time.")
          ) : (
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ol className="m-0 flex list-none flex-col gap-1 p-0">{ids.map((id) => taskRow(id, null, false))}</ol>
            </SortableContext>
          )}
        </GroupZone>
      );
    }
    if (s === "habits") {
      const ids = boxes["sec:habits"];
      return (
        <GroupZone id="sec:habits">
          {ids.length === 0 ? (
            empty("No habits left for today. 🌿")
          ) : (
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {ids.map((id) => {
                  const h = habitById.get(id);
                  if (!h) return null;
                  const at = habitAt(h);
                  const when = at ? `Placed ${at}` : h.due_time ? (h.window_to ? `${clockOf(h.due_time)}–${clockOf(h.window_to)}` : clockOf(h.due_time)) : `${h.minutes}m · no time yet`;
                  return <HabitRow key={id} id={id} habit={h} when={when} placing={carried?.id === id} onPlace={() => carry({ id, title: h.title, minutes: Math.max(15, h.minutes) })} />;
                })}
              </ol>
            </SortableContext>
          )}
        </GroupZone>
      );
    }
    // The list to schedule.
    if (ui.byWhen) {
      const keys = HORIZON_ORDER.map((h) => `b:${h}`).filter((k) => boxes[k]?.length || dragging);
      if (!keys.length) return empty(count === 0 ? "Nothing waiting. Tick “Add to the scheduling list” in a quest, or sort your imports, to line it up here." : "Nothing waiting.");
      return keys.map((k) => {
        const h = k.slice(2) as HorizonKey;
        const ids = boxes[k] ?? [];
        return (
          <GroupZone key={k} id={k}>
            <div className="flex items-center gap-1.5 px-1 pb-0.5 pt-1">
              <span className="text-[13px] font-bold" style={{ color: h === "w0" ? "#7a3b12" : ink }}>
                {HORIZON_LABELS[h]}
              </span>
              <span className="text-[12px] tabular-nums" style={{ color: soft }}>
                {ids.length || ""}
              </span>
              <span className="ml-auto">{sparkle(placeable(k), k, HORIZON_LABELS[h].toLowerCase())}</span>
            </div>
            {ids.length === 0 ? (
              empty("Drop here")
            ) : (
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ol className="m-0 flex list-none flex-col gap-1 p-0">{ids.map((id) => taskRow(id, null, false, () => remove(id)))}</ol>
              </SortableContext>
            )}
          </GroupZone>
        );
      });
    }
    const loose = boxes[`f:${LOOSE}`] ?? [];
    return (
      <>
        <GroupZone id={`f:${LOOSE}`}>
          {loose.length === 0 ? (
            empty(count === 0 ? "Nothing waiting. Tick “Add to the scheduling list” in a quest to line it up here." : "Drag a quest here to number it.")
          ) : (
            <SortableContext items={loose} strategy={verticalListSortingStrategy}>
              <ol className="m-0 flex list-none flex-col gap-1 p-0">{loose.map((id, i) => taskRow(id, i < NUMBERED ? i + 1 : null, i === NUMBERED, () => remove(id)))}</ol>
            </SortableContext>
          )}
        </GroupZone>
        {folders.map((f) => {
          const ids = boxes[`f:${f.name}`] ?? [];
          return (
            <GroupZone key={f.name} id={`f:${f.name}`}>
              <div className="relative flex items-center gap-1.5 rounded-lg px-1 py-1" onContextMenu={(e) => (e.preventDefault(), setFolderMenu(f.name))}>
                <button type="button" onClick={() => saveFolders(folders.map((x) => (x.name === f.name ? { ...x, open: !x.open } : x)))} aria-expanded={f.open} className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 text-left" style={{ color: ink }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform duration-150" style={{ transform: f.open ? "rotate(90deg)" : undefined, color: soft }}>
                    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <FolderGlyph open={f.open} name={f.name} />
                  {renaming === f.name ? (
                    <input
                      autoFocus
                      defaultValue={f.name}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") rename(f.name, e.currentTarget.value);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      onBlur={(e) => rename(f.name, e.currentTarget.value)}
                      className="h-8 min-w-0 flex-1 rounded-md border px-2 text-[14.5px]"
                      style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: ink }}
                    />
                  ) : (
                    <span className="truncate text-[15px] font-semibold">{f.name}</span>
                  )}
                  <span className="shrink-0 text-[13px] tabular-nums" style={{ color: soft }}>
                    ({ids.length})
                  </span>
                </button>
                <button type="button" data-folder-menu-button onClick={() => setFolderMenu(folderMenu === f.name ? null : f.name)} aria-label={`${f.name} folder options`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: soft }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
                {folderMenu === f.name && (
                  <SmallMenu
                    onClose={() => setFolderMenu(null)}
                    menu="folder"
                    items={[
                      ["Rename", () => setRenaming(f.name), "rename"],
                      ["Remove folder (keeps its quests)", () => dropFolder(f.name), "remove"],
                    ]}
                  />
                )}
              </div>
              {f.open && (
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  <ol className="reveal m-0 ml-4 flex list-none flex-col gap-1 border-l border-dashed p-0 pl-1.5" style={{ borderColor: "rgba(139,112,64,.4)" }}>
                    {ids.length === 0 && (
                      <li className="px-1.5 py-1 text-[13px] italic" style={{ color: soft }}>
                        Empty — drag quests here.
                      </li>
                    )}
                    {/* A folder's first three are numbered too (owner, Nov 3). */}
                    {ids.map((id, i) => taskRow(id, i < NUMBERED ? i + 1 : null, i === NUMBERED, () => remove(id)))}
                  </ol>
                </SortableContext>
              )}
            </GroupZone>
          );
        })}
        {adding && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addFolder(String(new FormData(e.currentTarget).get("name") ?? ""));
            }}
            className="reveal flex items-center gap-1.5 px-1 pt-1"
          >
            <FolderGlyph open={false} />
            <input name="name" autoFocus placeholder="Folder name, e.g. Relationships" onKeyDown={(e) => e.key === "Escape" && setAdding(false)} onBlur={(e) => addFolder(e.currentTarget.value)} className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[14.5px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: ink }} />
          </form>
        )}
      </>
    );
  };

  const secTitle = (s: Sec) =>
    s === "today" ? (planDay && planDay.toDateString() !== now.toDateString() ? `${planDay.toLocaleDateString(undefined, { weekday: "long" })}'s quests` : "Today's quests") : s === "additional" ? "Additional quests" : s === "habits" ? "Habits" : "To schedule";
  const secCount = (s: Sec) => (s === "list" ? flatList().length : boxes[`sec:${s}`].length);
  // Plain lists (no sections data, e.g. the planning rituals) show only the list.
  const shown = ui.order.filter((s) => sections || today || s === "list").filter((s) => s !== "today" || sections || today).filter((s) => (s !== "additional" && s !== "habits") || sections);

  const panel = (
    <aside
      aria-label="Auto-scheduler"
      className={`flex max-h-full min-h-0 flex-1 flex-col ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={{
        borderRadius: 16,
        ...(isAdventure ? {} : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }),
      }}
    >
      <div className="relative z-[1] flex flex-col gap-1.5 px-3 pb-2 pt-2.5">
        <div data-drag-handle="" className="flex cursor-grab touch-none select-none items-center gap-2 active:cursor-grabbing" title="Drag to move">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: ink }}>
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" stroke="currentColor" strokeWidth="1.9" />
            <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <span className={`flex-1 ${isAdventure ? "font-display text-[18px]" : "text-[15px] font-bold"}`} style={{ color: ink }}>
            Auto-scheduler
            {count > 0 && <span className="ml-1.5 text-[13.5px] font-normal tabular-nums" style={{ color: soft }}>{count}</span>}
          </span>
          <button type="button" onClick={() => minimize(true)} aria-label="Minimize the auto-scheduler" title="Minimize" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: soft }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M2.5 7h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" onClick={() => toggle(false)} aria-label="Close the auto-scheduler" title="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[20px] leading-none hover:bg-black/[.06]" style={{ color: soft }}>
            ×
          </button>
        </div>
        {/* Its tools, quietly on one line. */}
        <div className="flex items-center gap-1.5">
          {next && (
            <button type="button" onClick={() => autoPlace([next], "next")} disabled={!!placing} className="hover-glow h-8 whitespace-nowrap rounded-full px-3 text-[12.5px] font-bold disabled:opacity-60" style={gold} title={`Put “${nameOf(next)}” in the first free time (open sections in order, the list soonest first); then drag it on the calendar to change it`}>
              {placing === "next" ? "Finding a time…" : "✨ Auto-schedule"}
            </button>
          )}
          <button type="button" onClick={() => talkToToucan(undefined, "catchup")} className="h-8 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold hover:bg-black/[.06]" style={{ color: ink, border: "1px solid rgba(139,112,64,.45)" }} title="Coursework catch-up: coming up first, then missed ones from the beginning">
            📚 Catch-up
          </button>
        </div>
      </div>

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 pb-20 lg:pb-8">
        {error && (
          <p className="m-0 px-1 text-[13px]" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        {placed.length > 0 && (
          <p className="due-in m-0 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[13px]" style={{ background: "rgba(92,138,70,.16)", color: ink }}>
            <span className="min-w-0 flex-1">
              {placed.length === 1 ? (
                <>
                  ✓ <b>{placed[0].title}</b> · {placed[0].at.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}. Drag it on the calendar to change it.
                </>
              ) : (
                <>✓ Placed {placed.length}{placing ? "…" : ". Drag any on the calendar to change it."}</>
              )}
            </span>
            {!placing && (
              <button type="button" onClick={undoPlaced} className="shrink-0 font-semibold underline underline-offset-2">
                Undo
              </button>
            )}
          </p>
        )}
        <DndContext id="dnd-SchedulingList" sensors={sensors} collisionDetection={collision} onDragStart={(e) => setDragging(String(e.active.id))} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((s) => SEC_KEY + s)} strategy={verticalListSortingStrategy}>
            {shown.map((s) => {
              const isOpen = !ui.shut.includes(s);
              return (
                <SectionBox
                  key={s}
                  id={SEC_KEY + s}
                  title={secTitle(s)}
                  count={secCount(s)}
                  open={isOpen}
                  onToggle={() => saveUi({ ...ui, shut: isOpen ? [...ui.shut, s] : ui.shut.filter((x) => x !== s) })}
                  tools={
                    <>
                      {s === "list" && (
                        <button type="button" aria-pressed={ui.byWhen} onClick={() => saveUi({ ...ui, byWhen: !ui.byWhen })} className="h-7 shrink-0 whitespace-nowrap rounded-full px-2 text-[12px] font-semibold hover:bg-black/[.06]" style={{ color: ink, border: "1px solid rgba(139,112,64,.45)", background: ui.byWhen ? "rgba(217,180,95,.3)" : undefined }} title={ui.byWhen ? "Grouped by how soon each needs a time; tap for your folders" : "In your own order and folders; tap to group by how soon"}>
                          {ui.byWhen ? "⏳ By when" : "📁 Folders"}
                        </button>
                      )}
                      {s === "list" && !ui.byWhen && (
                        <button type="button" onClick={() => setAdding(true)} aria-label="Add a folder" className="h-7 w-7 shrink-0 rounded-full text-[16px] font-semibold hover:bg-black/[.06]" style={{ color: ink, border: "1px solid rgba(139,112,64,.45)" }} title="Add a folder">
                          +
                        </button>
                      )}
                      {s !== "list" && sparkle(placeable(s), `sec:${s}`, secTitle(s))}
                    </>
                  }
                >
                  {sectionBody(s)}
                </SectionBox>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>
    </aside>
  );

  const moveOpts: [string, string][] = ui.byWhen ? HORIZON_ORDER.map((h): [string, string] => [`b:${h}`, HORIZON_LABELS[h]]) : [[`f:${LOOSE}`, "Main list (numbered)"], ...folders.map((f): [string, string] => [`f:${f.name}`, f.name])];

  return (
    <>
      {/* A floating window on every screen (owner, Nov 3): moved by its title, resized from its corner, minimized to a chip. */}
      {open && !(min && hasPill) && (
        <FloatingWindow
          storageKey="scheduling-window"
          width={wide ? 340 : 290}
          resizable
          minimized={min}
          onRestore={() => minimize(false)}
          chip={
            <>
              <span aria-hidden>✨</span>
              <span className="font-display tracking-wide">Auto-scheduler</span>
              {count > 0 && <span className="tabular-nums opacity-80">{count}</span>}
            </>
          }
        >
          {panel}
        </FloatingWindow>
      )}

      {moving && boxOf(moving.task.id) && !boxOf(moving.task.id)!.startsWith("sec:") && (
        <MoveMenu
          x={moving.x}
          y={moving.y}
          current={boxOf(moving.task.id)!}
          opts={moveOpts}
          folderIcons={!ui.byWhen}
          onClose={() => setMoving(null)}
          onPick={(g) => moveTo(moving.task.id, g)}
          onNew={
            ui.byWhen
              ? undefined
              : (name) => {
                  const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
                  if (!n) return;
                  if (!folders.some((f) => f.name === n)) setFolders([...folders, { name: n, open: true }]);
                  const id = moving.task.id;
                  run(() => moveSchedulingFolderAction(id, n));
                }
          }
        />
      )}
      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
    </>
  );
}

/** A section of the auto-scheduler: its name drags it (reorder), the caret folds it. */
function SectionBox({ id, title, count, open, onToggle, tools, children }: { id: string; title: string; count: number; open: boolean; onToggle: () => void; tools: React.ReactNode; children: React.ReactNode }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  return (
    <section ref={setNodeRef} data-sched-section={id.slice(SEC_KEY.length)} className="flex flex-col pb-1" style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: "relative", zIndex: isDragging ? 6 : undefined }}>
      <div className="flex items-center gap-1 border-b border-dashed px-0.5 py-1" style={{ borderColor: "rgba(139,112,64,.35)" }}>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? "Fold" : "Open"} ${title}`} className="flex h-7 w-6 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-150" style={{ transform: open ? "rotate(90deg)" : undefined }}>
            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h4 ref={setActivatorNodeRef} {...attributes} {...listeners} onClick={onToggle} className="m-0 min-w-0 flex-1 cursor-grab touch-manipulation select-none truncate text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "var(--t-ink-soft)" }} title="Tap to fold · drag to move this section">
          {title}
          {count > 0 && <span className="ml-1.5 font-normal normal-case tracking-normal tabular-nums">{count}</span>}
        </h4>
        {tools}
      </div>
      <div className="drawer-body" data-open={open || undefined}>
        <div className="drawer-inner">
          <div className="flex flex-col gap-1 pt-1">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** A habit for today: drag it within Habits to reorder, or onto the calendar (or tap the calendar mark, then a time). */
function HabitRow({ id, habit, when, placing, onPlace }: { id: string; habit: SchedHabit; when: string; placing: boolean; onPlace: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  const carry = { id, title: habit.title, minutes: Math.max(15, habit.minutes) };
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onMouseDown: (e: React.MouseEvent) => e.stopPropagation(), onTouchStart: (e: React.TouchEvent) => e.stopPropagation() };
  return (
    <li ref={setNodeRef} {...attributes} {...listeners} className="flex touch-manipulation items-center gap-1.5 rounded-xl px-1 py-1 hover:bg-black/[.04]" style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.45 : 1, position: "relative", zIndex: isDragging ? 5 : undefined }}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[15px]" style={{ border: "1.5px solid #7c9a5a", background: "#e6efd2" }}>
        {habit.icon_key ? (
          // eslint-disable-next-line @next/next/no-img-element -- habit portrait
          <img src={habit.icon_key} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden>🌿</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[14.5px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
          {habit.title}
        </span>
        <span className="block text-[12px]" style={{ color: when.startsWith("Placed") ? "#3f6a2c" : "var(--t-ink-soft)" }}>
          {when}
        </span>
      </span>
      <button
        type="button"
        {...stop}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(QUEST_DRAG_TYPE, JSON.stringify(carry));
          e.dataTransfer.effectAllowed = "move";
          carryQuest(carry);
        }}
        onClick={onPlace}
        aria-label={`Place ${habit.title} on the calendar today`}
        title="Place on the calendar today: tap, then tap a time — or drag onto the calendar"
        className="flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded-full hover:bg-black/[.07]"
        style={placing ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10" } : { color: "var(--t-ink-soft)" }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" stroke="currentColor" strokeWidth="1.9" fill="none" />
          <path d="M3.5 9.6h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

function GroupZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: GROUP + id });
  return (
    <div ref={setNodeRef} className="rounded-xl transition-colors" style={{ background: isOver ? "rgba(217,180,95,.22)" : undefined, outline: isOver ? "2px dashed rgba(168,138,63,.7)" : undefined }}>
      {children}
    </div>
  );
}

/** A folder, with a small mark for what it holds: a heart for Relationships (owner, Nov 3), and so on. */
function FolderGlyph({ open, name = "" }: { open: boolean; name?: string }) {
  const mark = /relation|love|family|friend|partner|couple/i.test(name)
    ? "M12 17.2l-3.4-3.1c-1.5-1.4-1.2-3.4.4-3.9 1.1-.4 2.2.1 3 1 .8-.9 1.9-1.4 3-1 1.6.5 1.9 2.5.4 3.9z"
    : /work|job|career|business/i.test(name)
      ? "M9 11.5h6M9.5 11.5v-1a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1M8 11.5h8v5H8z"
      : /home|house|chore|clean/i.test(name)
        ? "M8 16.5v-4l4-3 4 3v4zM11 16.5v-2.2h2v2.2"
        : /health|body|gym|exercise/i.test(name)
          ? "M8.5 13.5h7M12 10v7"
          : null;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2h8.8A1.5 1.5 0 0 1 21 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" fill="#d9b45f" stroke="#4a3913" strokeWidth="1.4" strokeLinejoin="round" />
      {open && <path d="M3.4 18.6L6 11h16l-2.8 8.1" fill="#f3dc95" stroke="#4a3913" strokeWidth="1.4" strokeLinejoin="round" />}
      {mark && <path d={mark} fill={/relation|love|family|friend|partner|couple/i.test(name) ? "#b8453a" : "none"} stroke="#4a3913" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}

function Row({
  task,
  n,
  dividerBefore,
  onOpen,
  onPlace,
  placing,
  onMove,
  onRemove,
}: {
  task: Task;
  n: number | null;
  dividerBefore: boolean;
  onOpen: () => void;
  onPlace: () => void;
  placing: boolean;
  onMove: (x: number, y: number) => void;
  /** Off the list to schedule (not shown for Today's and Additional quests). */
  onRemove?: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: task.id });
  const art = (task.icon_source === "ai" || task.icon_source === "library") && task.icon_key ? task.icon_key : null;
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onMouseDown: (e: React.MouseEvent) => e.stopPropagation(), onTouchStart: (e: React.TouchEvent) => e.stopPropagation() };
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onContextMenu={(e) => {
        e.preventDefault();
        onMove(e.clientX, e.clientY);
      }}
      className="touch-manipulation"
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.45 : 1, position: "relative", zIndex: isDragging ? 5 : undefined }}
    >
      {dividerBefore && <span aria-hidden className="mb-1 mt-0.5 block border-t border-dashed" style={{ borderColor: "rgba(139,112,64,.4)" }} />}
      <div className="flex items-center gap-1.5 rounded-xl px-1 py-1 hover:bg-black/[.04]">
        {n !== null ? (
          <span
            aria-label={`Number ${n}`}
            className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold"
            style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}
          >
            {n}
          </span>
        ) : null}
        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full" style={{ border: "1.5px solid #a58c66", background: "#f3e6c8" }}>
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element -- quest portrait
            <img src={art} alt="" className="h-full w-full object-cover" />
          ) : (
            <QuestMonogram id={task.id} title={task.title} size={32} />
          )}
        </span>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left" title="Open this quest · right-click to move">
          <span className="line-clamp-2 block text-[14.5px] font-semibold leading-snug [overflow-wrap:anywhere]" style={{ color: "var(--t-ink)" }}>
            {task.title}
          </span>
          {task.is_on_calendar && task.scheduled_start ? (
            <span className="block text-[12px]" style={{ color: "#3f6a2c" }}>
              Scheduled {new Date(task.scheduled_start).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
            </span>
          ) : task.plan_by || task.due_at ? (
            <span className="block text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
              {task.plan_by ? "Plan by" : "Due"} {new Date((task.plan_by || task.due_at)!).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              {task.estimate_minutes ? ` · ${task.estimate_minutes}m` : ""}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          {...stop}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(QUEST_DRAG_TYPE, JSON.stringify({ id: task.id, title: task.title, minutes: Math.max(15, task.estimate_minutes ?? 60) }));
            e.dataTransfer.effectAllowed = "move";
            carryQuest({ id: task.id, title: task.title, minutes: Math.max(15, task.estimate_minutes ?? 60) });
          }}
          onClick={() => onPlace()}
          aria-label={`Place ${task.title} on the calendar`}
          title="Place on the calendar: tap, then tap a time — or drag onto the calendar"
          className="flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded-full hover:bg-black/[.07]"
          style={placing ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10" } : { color: "var(--t-ink-soft)" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" stroke="currentColor" strokeWidth="1.9" fill="none" />
            <path d="M3.5 9.6h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </button>
        {/* No "move to a folder" button (owner, Nov 3): drag it, or right-click for the menu. */}
        {onRemove && (
          <IconBtn label="Take it off the list" {...stop} onClick={onRemove}>
            <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </IconBtn>
        )}
      </div>
    </li>
  );
}


function IconBtn({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className="flex h-8 w-7 shrink-0 items-center justify-center rounded-full hover:bg-black/[.07]" style={{ color: "var(--t-ink-soft)" }} {...rest}>
      <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function SmallMenu({ items, menu, onClose }: { items: [string, () => void, string?][]; menu?: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (fromFeedback(e)) return;
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.("[data-folder-menu-button]")) onClose();
    };
    const key = (e: KeyboardEvent) => !fromFeedback(e) && e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" data-menu={menu} className="parchment absolute right-0 top-full z-[20] mt-1 flex w-56 flex-col overflow-hidden py-1" style={{ borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 10px 24px rgba(0,0,0,.3)" }}>
      {items.map(([label, fn, key]) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          data-mi={key}
          onClick={() => {
            onClose();
            fn();
          }}
          className="relative z-[1] min-h-10 px-3 text-left text-[14px] hover:bg-black/[.06]"
          style={{ color: "var(--t-ink)" }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MoveMenu({ x, y, current, opts, folderIcons, onClose, onPick, onNew }: { x: number; y: number; current: string; opts: [string, string][]; folderIcons: boolean; onClose: () => void; onPick: (g: string) => void; onNew?: (name: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [naming, setNaming] = useState(false);
  useEffect(() => {
    const down = (e: PointerEvent) => !fromFeedback(e) && ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => !fromFeedback(e) && e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const W = 240;
  const left = Math.max(8, Math.min(x - W, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - 40 * opts.length - 80));
  return createPortal(
    <div ref={ref} role="menu" aria-label="Move to" className="parchment fixed z-[80] flex flex-col overflow-hidden py-1" style={{ left, top, width: W, borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 12px 30px rgba(0,0,0,.35)" }}>
      <p className="relative z-[1] m-0 px-3 pb-1 pt-1.5 text-[12.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
        {folderIcons ? "Move to…" : "Needs a time…"}
      </p>
      {opts.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="menuitem"
          disabled={key === current}
          onClick={() => {
            onClose();
            onPick(key);
          }}
          className="relative z-[1] flex min-h-9 items-center gap-2 px-3 text-left text-[14px] hover:bg-black/[.06] disabled:opacity-50"
          style={{ color: "var(--t-ink)" }}
        >
          {folderIcons && (key.slice(2) ? <FolderGlyph open={false} /> : <span className="w-[18px] text-center font-bold">#</span>)}
          {label}
          {key === current && <span className="ml-auto text-[12px]">here</span>}
        </button>
      ))}
      {onNew &&
        (naming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onNew(String(new FormData(e.currentTarget).get("name") ?? ""));
              onClose();
            }}
            className="relative z-[1] px-2 py-1.5"
          >
            <input name="name" autoFocus placeholder="New folder name" className="h-9 w-full rounded-lg border px-2 text-[14px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }} />
          </form>
        ) : (
          <button type="button" onClick={() => setNaming(true)} className="relative z-[1] min-h-10 border-t px-3 text-left text-[14px] font-semibold hover:bg-black/[.06]" style={{ color: "var(--t-ink)", borderColor: "rgba(139,112,64,.3)" }}>
            + New folder…
          </button>
        ))}
    </div>,
    document.body
  );
}
