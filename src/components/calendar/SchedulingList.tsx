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
  renameSchedulingFolderAction,
  reorderSchedulingAction,
  setSchedulingAction,
  setSchedulingFoldersAction,
} from "@/app/actions";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { TaskScheduleControl } from "@/components/tasks/TaskScheduleControl";
import { carryQuest, useCarried, QUEST_DRAG_TYPE } from "@/lib/schedule-carry";
import { fromFeedback } from "@/lib/from-feedback";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { useLingerValue } from "@/components/ui/Fold";

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

/**
 * The scheduling priority list, in a slide-out beside the calendar: quests
 * (often people to see) waiting for a time. The first three loose ones are
 * numbered; the rest wait below, and anything can be filed into light
 * folders (e.g. "Relationships") that open and close with a caret.
 */
export function SchedulingDrawer({ tasks, folders: initialFolders, theme, today = null }: { tasks: Task[]; folders: Folder[]; theme: "calm" | "adventure"; /** Plan my day: today's quests, at the top of the list (owner, Nov 3). */ today?: { day: string; tasks: Task[] } | null }) {
  const wide = useWide();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // On wide screens it floats: drag it by its title, – tucks it into a chip (owner, Nov 2).
  const [min, setMin] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      setMin(window.localStorage.getItem("scheduling-min") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  function minimize(v: boolean) {
    setMin(v);
    try {
      window.localStorage.setItem("scheduling-min", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
  const [seen, setSeen] = useState(tasks);
  const [order, setOrder] = useState<string[] | null>(null);
  const [filed, setFiled] = useState<Record<string, string>>({});
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [seenFolders, setSeenFolders] = useState(initialFolders);
  const [editing, setEditing] = useState<Task | null>(null);
  const [scheduling, setScheduling] = useState<Task | null>(null);
  const sched = useLingerValue(scheduling);
  const [moving, setMoving] = useState<{ task: Task; x: number; y: number } | null>(null);
  const [folderMenu, setFolderMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // ✨ Auto-schedule: the next one on the list goes into the first free slot, a moment to undo.
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ id: string; title: string; at: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (seen !== tasks) {
    setSeen(tasks);
    setOrder(null);
    setFiled({});
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
    const on = () => (open && min && wide ? minimize(false) : toggle(!open));
    window.addEventListener("open-scheduling", on);
    return () => window.removeEventListener("open-scheduling", on);
  });
  useEffect(() => {
    if (!open || wide) return;
    const key = (e: KeyboardEvent) => !fromFeedback(e) && e.key === "Escape" && !editing && !scheduling && toggle(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids = (order ?? tasks.map((t) => t.id)).filter((id) => byId.has(id));
  const folderOf = (id: string) => (id in filed ? filed[id] : (byId.get(id)?.schedule_folder ?? LOOSE)) || LOOSE;
  const known = new Set(folders.map((f) => f.name));
  // Quests filed in a folder that no longer exists show loose.
  const groupOf = (id: string) => (known.has(folderOf(id)) ? folderOf(id) : LOOSE);
  const groups: { key: string; ids: string[] }[] = [{ key: LOOSE, ids: ids.filter((id) => groupOf(id) === LOOSE) }, ...folders.map((f) => ({ key: f.name, ids: ids.filter((id) => groupOf(id) === f.name) }))];
  const flat = (gs: { ids: string[] }[]) => gs.flatMap((g) => g.ids);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    // Prefer a quest under the pointer over the folder around it.
    const rows = hits.filter((h) => !String(h.id).startsWith(GROUP));
    if (rows.length) return rows;
    return hits.length ? hits : closestCenter(args);
  };

  function run(fn: () => Promise<unknown>, undo: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        undo();
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  /** Move a quest into a group at an index (end when omitted). */
  function place(id: string, toGroup: string, index?: number) {
    const from = groupOf(id);
    const next = groups.map((g) => ({ key: g.key, ids: g.ids.filter((x) => x !== id) }));
    const target = next.find((g) => g.key === toGroup);
    if (!target) return;
    target.ids.splice(index ?? target.ids.length, 0, id);
    const nextOrder = flat(next);
    setOrder(nextOrder);
    if (from === toGroup) {
      run(() => reorderSchedulingAction(nextOrder), () => setOrder(null));
    } else {
      setFiled((f) => ({ ...f, [id]: toGroup }));
      run(
        () => moveSchedulingFolderAction(id, toGroup || null, nextOrder),
        () => {
          setOrder(null);
          setFiled({});
        }
      );
    }
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const a = String(e.active.id);
    const o = String(e.over.id);
    if (a === o) return;
    if (o.startsWith(GROUP)) return place(a, o.slice(GROUP.length));
    const g = groupOf(o);
    const list = groups.find((x) => x.key === g)!.ids;
    if (groupOf(a) === g) {
      const next = groups.map((x) => (x.key === g ? { ...x, ids: arrayMove(list, list.indexOf(a), list.indexOf(o)) } : x));
      const nextOrder = flat(next);
      setOrder(nextOrder);
      run(() => reorderSchedulingAction(nextOrder), () => setOrder(null));
    } else place(a, g, list.indexOf(o));
  }

  function remove(id: string) {
    setOrder(ids.filter((x) => x !== id));
    run(() => setSchedulingAction(id, null), () => setOrder(null));
  }

  function saveFolders(next: Folder[]) {
    const prev = folders;
    setFolders(next);
    run(() => setSchedulingFoldersAction(next), () => setFolders(prev));
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
    const prev = folders;
    setFolders(folders.map((f) => (f.name === from ? { ...f, name: n } : f)));
    setFiled((m) => {
      const out = { ...m };
      for (const id of ids) if (folderOf(id) === from) out[id] = n;
      return out;
    });
    run(() => renameSchedulingFolderAction(from, n), () => (setFolders(prev), setFiled({})));
  }
  function dropFolder(name: string) {
    const prev = folders;
    setFolders(folders.filter((f) => f.name !== name));
    run(() => deleteSchedulingFolderAction(name), () => setFolders(prev));
  }

  const isAdventure = theme === "adventure";
  const count = ids.length;
  const carried = useCarried();
  /** Pick a quest up to place on the calendar (tap again to put it back). */
  function place2(t: Task) {
    if (carried?.id === t.id) return carryQuest(null);
    carryQuest({ id: t.id, title: t.title, minutes: Math.max(15, t.estimate_minutes ?? 60) });
    if (!wide) minimize(true); // out of the way of the calendar; its chip stays
  }

  const todayIds = (today?.tasks ?? []).filter((t) => !(t.is_on_calendar && t.scheduled_start)).map((t) => t.id);
  const todayById = new Map((today?.tasks ?? []).map((t) => [t.id, t]));
  /** The next one waiting: today's first (when planning the day), then the list in its order. */
  const nextUp = (): Task | null => {
    const fromToday = todayIds.map((id) => todayById.get(id)!).find(Boolean);
    if (fromToday) return fromToday;
    return flat(groups).map((id) => byId.get(id)!).find((t) => t && !(t.is_on_calendar && t.scheduled_start && Date.parse(t.scheduled_start) > Date.now())) ?? null;
  };
  function placeNext() {
    const t = nextUp();
    if (!t || placing) return;
    setPlacing(true);
    setError(null);
    const day = today && todayIds.includes(t.id) ? new Date(`${today.day}T12:00:00`) : undefined;
    findSlot(t, day)
      .then(async (slot) => {
        if (!slot) {
          setError(`No free time found for “${t.title}”${day ? " that day" : " in the next two weeks"}.`);
          return;
        }
        await applyAutoScheduleAction([{ taskId: t.id, startISO: slot.start.toISOString(), endISO: slot.end.toISOString() }]);
        setPlaced({ id: t.id, title: t.title, at: slot.start });
        router.refresh();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't place it."))
      .finally(() => setPlacing(false));
  }
  function undoPlaced() {
    const p = placed;
    if (!p) return;
    setPlaced(null);
    unscheduleTaskAction(p.id)
      .then(() => router.refresh())
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't take it back."));
  }

  const panel = (
    <aside
      aria-label="Scheduling priority list"
      className={`flex max-h-full min-h-0 flex-1 flex-col ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={{
        borderRadius: 16,
        ...(isAdventure ? {} : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }),
      }}
    >
      <div className="relative z-[1] flex flex-col gap-1.5 px-3 pb-2 pt-2.5">
        <div data-drag-handle="" className="flex cursor-grab touch-none select-none items-center gap-2 active:cursor-grabbing" title="Drag to move">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--t-ink)" }}>
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" stroke="currentColor" strokeWidth="1.9" />
            <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <span className={`flex-1 ${isAdventure ? "font-display text-[18px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
            Auto-scheduler
            {count + todayIds.length > 0 && <span className="ml-1.5 text-[13.5px] font-normal tabular-nums" style={{ color: "var(--t-ink-soft)" }}>{count + todayIds.length}</span>}
          </span>
          <button type="button" onClick={() => minimize(true)} aria-label="Minimize the auto-scheduler" title="Minimize" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M2.5 7h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => toggle(false)}
            aria-label="Close the auto-scheduler"
            title="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[20px] leading-none hover:bg-black/[.06]"
            style={{ color: "var(--t-ink-soft)" }}
          >
            ×
          </button>
        </div>
        {/* Its tools, quietly on one line. */}
        <div className="flex items-center gap-1.5">
          {count + todayIds.length > 0 && (
            <button
              type="button"
              onClick={placeNext}
              disabled={placing}
              className="hover-glow h-8 whitespace-nowrap rounded-full px-3 text-[12.5px] font-bold disabled:opacity-60"
              style={isAdventure ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { background: "var(--t-accent)", color: "#fff" }}
              title={nextUp() ? `Put “${nextUp()!.title}” in the first free time; then drag it on the calendar to change it` : "Nothing left to place"}
            >
              {placing ? "Finding a time…" : "✨ Auto-schedule"}
            </button>
          )}
          <button
            type="button"
            onClick={() => talkToToucan(undefined, "catchup")}
            className="h-8 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold hover:bg-black/[.06]"
            style={{ color: "var(--t-ink)", border: "1px solid rgba(139,112,64,.45)" }}
            title="Coursework catch-up: coming up first, then missed ones from the beginning"
          >
            📚 Catch-up
          </button>
          <button type="button" onClick={() => setAdding(true)} aria-label="Add a folder" className="ml-auto h-8 w-8 shrink-0 whitespace-nowrap rounded-full text-[17px] font-semibold hover:bg-black/[.06]" style={{ color: "var(--t-ink)", border: "1px solid rgba(139,112,64,.45)" }} title="Add a folder">
            +
          </button>
        </div>
      </div>

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 pb-3">
        {error && (
          <p className="m-0 px-1 text-[13px]" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        {placed && (
          <p className="due-in m-0 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[13px]" style={{ background: "rgba(92,138,70,.16)", color: "var(--t-ink)" }}>
            <span className="min-w-0 flex-1">
              ✓ <b>{placed.title}</b> · {placed.at.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}. Drag it on the calendar to change it.
            </span>
            <button type="button" onClick={undoPlaced} className="shrink-0 font-semibold underline underline-offset-2">
              Undo
            </button>
          </p>
        )}
        {today && (
          <section className="flex flex-col gap-1 pb-1">
            <h4 className="m-0 px-1 text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "var(--t-ink-soft)" }}>
              {new Date(`${today.day}T12:00:00`).toDateString() === new Date().toDateString() ? "Today's quests" : new Date(`${today.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })}
            </h4>
            {todayIds.length === 0 ? (
              <p className="m-0 px-1.5 text-[13.5px] italic" style={{ color: "var(--t-ink-soft)" }}>
                {(today.tasks.length ? "All of them have a time. 🎉" : "No quests on Today yet.")}
              </p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {todayIds.map((id) => (
                  <PlainRow key={id} task={todayById.get(id)!} placing={carried?.id === id} onOpen={() => setEditing(todayById.get(id)!)} onPlace={() => place2(todayById.get(id)!)} />
                ))}
              </ol>
            )}
            {count > 0 && <span aria-hidden className="mx-1 mt-1 block border-t border-dashed" style={{ borderColor: "rgba(139,112,64,.4)" }} />}
          </section>
        )}
        <DndContext id="dnd-SchedulingList" sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd}>
          {/* Loose quests: the first three are numbered. */}
          <GroupZone id={LOOSE}>
            {groups[0].ids.length === 0 && today && count === 0 ? null : groups[0].ids.length === 0 ? (
              <p className="m-0 px-1.5 py-1 text-[13.5px] italic" style={{ color: "var(--t-ink-soft)" }}>
                {count === 0 ? "Nothing waiting. Tick “Add to the scheduling list” in a quest to line it up here." : "Drag a quest here to number it."}
              </p>
            ) : (
              <SortableContext items={groups[0].ids} strategy={verticalListSortingStrategy}>
                <ol className="m-0 flex list-none flex-col gap-1 p-0">
                  {groups[0].ids.map((id, i) => (
                    <Row
                      key={id}
                      task={byId.get(id)!}
                      n={i < NUMBERED ? i + 1 : null}
                      dividerBefore={i === NUMBERED}
                      onOpen={() => setEditing(byId.get(id)!)}
                      onSchedule={() => setScheduling(byId.get(id)!)}
                      onPlace={() => place2(byId.get(id)!)}
                      placing={carried?.id === id}
                      onMove={(x, y) => setMoving({ task: byId.get(id)!, x, y })}
                      onRemove={() => remove(id)}
                    />
                  ))}
                </ol>
              </SortableContext>
            )}
          </GroupZone>

          {/* Folders */}
          {groups.slice(1).map((g) => {
            const f = folders.find((x) => x.name === g.key)!;
            return (
              <GroupZone key={g.key} id={g.key}>
                <div className="relative flex items-center gap-1.5 rounded-lg px-1 py-1" onContextMenu={(e) => (e.preventDefault(), setFolderMenu(g.key))}>
                  <button
                    type="button"
                    onClick={() => saveFolders(folders.map((x) => (x.name === g.key ? { ...x, open: !x.open } : x)))}
                    aria-expanded={f.open}
                    className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 text-left"
                    style={{ color: "var(--t-ink)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform duration-150" style={{ transform: f.open ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft)" }}>
                      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <FolderGlyph open={f.open} name={g.key} />
                    {renaming === g.key ? (
                      <input
                        autoFocus
                        defaultValue={g.key}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") rename(g.key, e.currentTarget.value);
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={(e) => rename(g.key, e.currentTarget.value)}
                        className="h-8 min-w-0 flex-1 rounded-md border px-2 text-[14.5px]"
                        style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }}
                      />
                    ) : (
                      <span className="truncate text-[15px] font-semibold">{g.key}</span>
                    )}
                    <span className="shrink-0 text-[13px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                      ({g.ids.length})
                    </span>
                  </button>
                  <button
                    type="button"
                    data-folder-menu-button
                    onClick={() => setFolderMenu(folderMenu === g.key ? null : g.key)}
                    aria-label={`${g.key} folder options`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                    </svg>
                  </button>
                  {folderMenu === g.key && (
                    <SmallMenu
                      onClose={() => setFolderMenu(null)}
                      menu="folder"
                      items={[
                        ["Rename", () => setRenaming(g.key), "rename"],
                        ["Remove folder (keeps its quests)", () => dropFolder(g.key), "remove"],
                      ]}
                    />
                  )}
                </div>
                {f.open && (
                  <SortableContext items={g.ids} strategy={verticalListSortingStrategy}>
                    <ol className="reveal m-0 ml-4 flex list-none flex-col gap-1 border-l border-dashed p-0 pl-1.5" style={{ borderColor: "rgba(139,112,64,.4)" }}>
                      {g.ids.length === 0 && (
                        <li className="px-1.5 py-1 text-[13px] italic" style={{ color: "var(--t-ink-soft)" }}>
                          Empty — drag quests here.
                        </li>
                      )}
                      {g.ids.map((id, i) => (
                        <Row
                          key={id}
                          task={byId.get(id)!}
                          // A folder's first three are numbered too (owner, Nov 3).
                          n={i < NUMBERED ? i + 1 : null}
                          dividerBefore={i === NUMBERED}
                          onOpen={() => setEditing(byId.get(id)!)}
                          onSchedule={() => setScheduling(byId.get(id)!)}
                          onPlace={() => place2(byId.get(id)!)}
                          placing={carried?.id === id}
                          onMove={(x, y) => setMoving({ task: byId.get(id)!, x, y })}
                          onRemove={() => remove(id)}
                        />
                      ))}
                    </ol>
                  </SortableContext>
                )}
              </GroupZone>
            );
          })}
        </DndContext>

        {adding && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addFolder(String(new FormData(e.currentTarget).get("name") ?? ""));
            }}
            className="reveal flex items-center gap-1.5 px-1 pt-1"
          >
            <FolderGlyph open={false} />
            <input
              name="name"
              autoFocus
              placeholder="Folder name, e.g. Relationships"
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
              onBlur={(e) => addFolder(e.currentTarget.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[14.5px]"
              style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }}
            />
          </form>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* A floating window on every screen (owner, Nov 3): moved by its title, resized from its corner, minimized to a chip. */}
      {open && (
        <FloatingWindow
          storageKey="scheduling-window"
          width={wide ? 320 : 280}
          resizable
          minimized={min}
          onRestore={() => minimize(false)}
          chip={
            <>
              <span aria-hidden>✨</span>
              <span className="font-display tracking-wide">Auto-scheduler</span>
              {count + todayIds.length > 0 && <span className="tabular-nums opacity-80">{count + todayIds.length}</span>}
            </>
          }
        >
          {panel}
        </FloatingWindow>
      )}

      {moving && (
        <MoveMenu
          x={moving.x}
          y={moving.y}
          current={groupOf(moving.task.id)}
          folders={folders.map((f) => f.name)}
          onClose={() => setMoving(null)}
          onPick={(g) => place(moving.task.id, g)}
          onNew={(name) => {
            const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
            if (!n) return;
            if (!folders.some((f) => f.name === n)) setFolders([...folders, { name: n, open: true }]);
            const id = moving.task.id;
            setFiled((m) => ({ ...m, [id]: n }));
            run(() => moveSchedulingFolderAction(id, n), () => setFiled({}));
          }}
        />
      )}
      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
      {sched.value &&
        createPortal(
          <div className={`overlay-fade-in fixed inset-0 z-[60] flex items-center justify-center p-4${sched.leaving ? " overlay-fade-out pointer-events-none" : ""}`} style={{ background: "var(--t-overlay)" }} onClick={() => setScheduling(null)}>
            <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <TaskScheduleControl task={sched.value} theme={theme} startOpen onDone={() => setScheduling(null)} />
            </div>
          </div>,
          document.body
        )}
    </>
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
  onSchedule,
  onPlace,
  placing,
  onMove,
  onRemove,
}: {
  task: Task;
  n: number | null;
  dividerBefore: boolean;
  onOpen: () => void;
  onSchedule: () => void;
  onPlace: () => void;
  placing: boolean;
  onMove: (x: number, y: number) => void;
  onRemove: () => void;
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
          <span className="line-clamp-2 block text-[14.5px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
            {task.title}
          </span>
          {task.is_on_calendar && task.scheduled_start && (
            <span className="block text-[12px]" style={{ color: "#3f6a2c" }}>
              Scheduled {new Date(task.scheduled_start).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
            </span>
          )}
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
        <IconBtn label="Take it off the list" {...stop} onClick={onRemove}>
          <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </IconBtn>
      </div>
    </li>
  );
}

/** A quest in the day's part of the list: open it, or place it (tap, then a time; or drag it onto the calendar). */
function PlainRow({ task, placing, onOpen, onPlace }: { task: Task; placing: boolean; onOpen: () => void; onPlace: () => void }) {
  const art = (task.icon_source === "ai" || task.icon_source === "library") && task.icon_key ? task.icon_key : null;
  const carry = { id: task.id, title: task.title, minutes: Math.max(15, task.estimate_minutes ?? 60) };
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(QUEST_DRAG_TYPE, JSON.stringify(carry));
        e.dataTransfer.effectAllowed = "move";
        carryQuest(carry);
      }}
      className="flex items-center gap-1.5 rounded-xl px-1 py-1 hover:bg-black/[.04]"
    >
      <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full" style={{ border: "1.5px solid #a58c66", background: "#f3e6c8" }}>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element -- quest portrait
          <img src={art} alt="" className="h-full w-full object-cover" />
        ) : (
          <QuestMonogram id={task.id} title={task.title} size={32} />
        )}
      </span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left" title="Open this quest">
        <span className="line-clamp-2 block text-[14.5px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
          {task.title}
        </span>
        {task.estimate_minutes ? <span className="block text-[12px]" style={{ color: "var(--t-ink-soft)" }}>{task.estimate_minutes}m</span> : null}
      </button>
      <button
        type="button"
        onClick={onPlace}
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

function MoveMenu({ x, y, current, folders, onClose, onPick, onNew }: { x: number; y: number; current: string; folders: string[]; onClose: () => void; onPick: (g: string) => void; onNew: (name: string) => void }) {
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
  const top = Math.max(8, Math.min(y, window.innerHeight - 280));
  const opts: [string, string][] = [[LOOSE, "Main list (numbered)"], ...folders.map((f): [string, string] => [f, f])];
  return createPortal(
    <div ref={ref} role="menu" aria-label="Move to" className="parchment fixed z-[80] flex flex-col overflow-hidden py-1" style={{ left, top, width: W, borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 12px 30px rgba(0,0,0,.35)" }}>
      <p className="relative z-[1] m-0 px-3 pb-1 pt-1.5 text-[12.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
        Move to…
      </p>
      {opts.map(([key, label]) => (
        <button
          key={key || "loose"}
          type="button"
          role="menuitem"
          disabled={key === current}
          onClick={() => {
            onClose();
            onPick(key);
          }}
          className="relative z-[1] flex min-h-10 items-center gap-2 px-3 text-left text-[14px] hover:bg-black/[.06] disabled:opacity-50"
          style={{ color: "var(--t-ink)" }}
        >
          {key ? <FolderGlyph open={false} /> : <span className="w-[18px] text-center font-bold">#</span>}
          {label}
          {key === current && <span className="ml-auto text-[12px]">here</span>}
        </button>
      ))}
      {naming ? (
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
      )}
    </div>,
    document.body
  );
}
