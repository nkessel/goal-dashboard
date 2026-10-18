"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { saveCalendarPrefsAction } from "@/app/actions";
import type { GoogleCalendarSource } from "@/lib/google-calendar";
import type { CalendarPrefs } from "@/lib/data/calendar-sources";

const OPEN_KEY = "calendar-sources-open";
const LOOSE = "";
const ZONE = "zone:";

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
 * Every Google calendar, each with an on/off box, grouped into collapsible
 * folders you drag calendars into. A column on the left on wide screens, a
 * slide-out from the left edge on phones.
 */
export function CalendarSources({ calendars, prefs: initial, theme }: { calendars: GoogleCalendarSource[]; prefs: CalendarPrefs; theme: "calm" | "adventure" }) {
  const router = useRouter();
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (seen !== initial) {
    setSeen(initial);
    setPrefs(initial);
  }
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(OPEN_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      setOpen(v === null ? window.matchMedia("(min-width: 1024px)").matches : v === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  function toggleOpen(next = !open) {
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }

  /** Save, then reload the calendar so newly shown calendars' events arrive. */
  function save(next: CalendarPrefs, refetch: boolean) {
    const prev = prefs;
    setPrefs(next);
    setError(null);
    startTransition(async () => {
      try {
        await saveCalendarPrefsAction(next);
        if (refetch) router.refresh();
      } catch (e) {
        setPrefs(prev);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  const isOn = (c: GoogleCalendarSource) => prefs.on[c.id] ?? c.selected;
  const folderOf = (c: GoogleCalendarSource) => {
    const f = prefs.placement[c.id];
    return f && prefs.folders.some((x) => x.name === f) ? f : LOOSE;
  };
  const groups = [{ name: LOOSE, open: true }, ...prefs.folders].map((f) => ({ ...f, cals: calendars.filter((c) => folderOf(c) === f.name) }));

  function setOn(ids: string[], value: boolean) {
    save({ ...prefs, on: { ...prefs.on, ...Object.fromEntries(ids.map((id) => [id, value])) } }, true);
  }
  function moveTo(calId: string, folder: string) {
    const placement = { ...prefs.placement };
    if (folder) placement[calId] = folder;
    else delete placement[calId];
    save({ ...prefs, placement }, false);
  }
  function addFolder(name: string) {
    setAdding(false);
    const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!n || prefs.folders.some((f) => f.name.toLowerCase() === n.toLowerCase())) return;
    save({ ...prefs, folders: [...prefs.folders, { name: n, open: true }] }, false);
  }
  function renameFolder(from: string, to: string) {
    setRenaming(null);
    const n = to.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!n || n === from || prefs.folders.some((f) => f.name === n)) return;
    const placement = Object.fromEntries(Object.entries(prefs.placement).map(([k, v]) => [k, v === from ? n : v]));
    save({ ...prefs, folders: prefs.folders.map((f) => (f.name === from ? { ...f, name: n } : f)), placement }, false);
  }
  function removeFolder(name: string) {
    const placement = Object.fromEntries(Object.entries(prefs.placement).filter(([, v]) => v !== name));
    save({ ...prefs, folders: prefs.folders.filter((f) => f.name !== name), placement }, false);
  }
  function setFolderOpen(name: string, value: boolean) {
    save({ ...prefs, folders: prefs.folders.map((f) => (f.name === name ? { ...f, open: value } : f)) }, false);
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const over = String(e.over.id);
    if (!over.startsWith(ZONE)) return;
    const cal = calendars.find((c) => c.id === String(e.active.id));
    const target = over.slice(ZONE.length);
    if (cal && folderOf(cal) !== target) moveTo(cal.id, target);
  }

  const isAdventure = theme === "adventure";
  const onCount = calendars.filter(isOn).length;

  const tab = (
    <button
      type="button"
      onClick={() => toggleOpen(true)}
      aria-label={`Show the calendars list (${onCount} of ${calendars.length} on)`}
      title="Calendars"
      className={`flex flex-col items-center gap-2 py-3 ${wide ? "w-10" : "w-8 opacity-90"}`}
      style={{
        background: isAdventure ? "linear-gradient(180deg, #2b3524, #1c2418)" : "var(--t-card)",
        border: `1.5px solid ${isAdventure ? "#a88a3f" : "var(--t-card-border)"}`,
        borderLeft: wide ? undefined : "none",
        borderRadius: wide ? 14 : "0 14px 14px 0",
        color: isAdventure ? "var(--t-cream)" : "var(--t-ink)",
        boxShadow: "0 6px 16px rgba(0,0,0,.3)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[15px]" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
        Calendars
      </span>
      <span className="text-[12px] tabular-nums" style={{ opacity: 0.75 }}>
        {onCount}/{calendars.length}
      </span>
    </button>
  );

  const panel = (
    <aside
      aria-label="Calendars"
      className={`flex max-h-full min-h-0 flex-col ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={{
        borderRadius: wide ? 16 : "0 16px 16px 0",
        ...(isAdventure ? {} : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }),
        ...(wide ? {} : { height: "100%" }),
      }}
    >
      <div className="relative z-[1] flex min-h-12 items-center gap-2 px-3">
        <span className={`flex-1 ${isAdventure ? "font-display text-[18px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
          Calendars
        </span>
        <button type="button" onClick={() => setAdding(true)} className="h-8 rounded-full px-2.5 text-[12.5px] font-semibold hover:bg-black/[.06]" style={{ color: "var(--t-ink)", border: "1px solid #b39a6a" }} title="Add a folder">
          + Folder
        </button>
        <button type="button" onClick={() => toggleOpen(false)} aria-label="Hide the calendars list" title="Slide away" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "var(--t-ink)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 pb-3">
        {error && (
          <p className="m-0 px-1 text-[13px]" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        <DndContext id="dnd-CalendarSources" sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
          {groups.map((g) => {
            const allOn = g.cals.length > 0 && g.cals.every(isOn);
            const someOn = g.cals.some(isOn);
            return (
              <Zone key={g.name || "loose"} id={g.name}>
                {g.name && (
                  <div className="flex items-center gap-1 rounded-lg px-1 py-0.5">
                    <button
                      type="button"
                      onClick={() => setFolderOpen(g.name, !g.open)}
                      aria-expanded={g.open}
                      className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 text-left"
                      style={{ color: "var(--t-ink)" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform duration-150" style={{ transform: g.open ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft)" }}>
                        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {renaming === g.name ? (
                        <input
                          autoFocus
                          defaultValue={g.name}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") renameFolder(g.name, e.currentTarget.value);
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          onBlur={(e) => renameFolder(g.name, e.currentTarget.value)}
                          className="h-8 min-w-0 flex-1 rounded-md border px-2 text-[14.5px]"
                          style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }}
                        />
                      ) : (
                        <span className="truncate text-[14.5px] font-semibold" onDoubleClick={() => setRenaming(g.name)} title="Double-click to rename">
                          {g.name}
                        </span>
                      )}
                      <span className="shrink-0 text-[12.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                        ({g.cals.length})
                      </span>
                    </button>
                    {g.cals.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => {
                          if (el) el.indeterminate = someOn && !allOn;
                        }}
                        onChange={() => setOn(g.cals.map((c) => c.id), !allOn)}
                        aria-label={`Show every calendar in ${g.name}`}
                        className="h-4 w-4 shrink-0 accent-[#8a6c2c]"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeFolder(g.name)}
                      aria-label={`Remove the ${g.name} folder (keeps its calendars)`}
                      title="Remove folder (keeps its calendars)"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[17px] leading-none hover:bg-black/[.06]"
                      style={{ color: "var(--t-ink-soft)" }}
                    >
                      ×
                    </button>
                  </div>
                )}
                {(g.open || !g.name) && (
                  <ul className={`m-0 flex list-none flex-col p-0 ${g.name ? "ml-4 border-l border-dashed pl-1.5" : ""}`} style={{ borderColor: "rgba(139,112,64,.4)" }}>
                    {g.cals.length === 0 && (
                      <li className="px-1.5 py-1 text-[12.5px] italic" style={{ color: "var(--t-ink-soft)" }}>
                        {g.name ? "Empty — drag calendars here." : "Drag a calendar out of a folder to put it here."}
                      </li>
                    )}
                    {g.cals.map((c) => (
                      <CalendarRow key={c.id} cal={c} on={isOn(c)} onToggle={() => setOn([c.id], !isOn(c))} />
                    ))}
                  </ul>
                )}
              </Zone>
            );
          })}
        </DndContext>
        {adding && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addFolder(String(new FormData(e.currentTarget).get("name") ?? ""));
            }}
            className="flex items-center gap-1.5 px-1 pt-1"
          >
            <input
              name="name"
              autoFocus
              placeholder="Folder name, e.g. Family"
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
              onBlur={(e) => addFolder(e.currentTarget.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[16px]"
              style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }}
            />
          </form>
        )}
        <p className="m-0 px-1 pt-2 text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
          Hold and drag a calendar to file it in a folder.
        </p>
      </div>
    </aside>
  );

  return wide ? (
    <div className="sticky top-4 flex shrink-0 self-start" style={{ maxHeight: "calc(100vh - 140px)" }}>
      {open ? <div className="flex min-h-0 w-[260px]">{panel}</div> : tab}
    </div>
  ) : (
    <>
      {!open && <div className="fixed left-0 top-[22%] z-[35]">{tab}</div>}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[46]" onClick={() => toggleOpen(false)} style={{ background: "rgba(10,8,4,.35)" }}>
            <div className="slide-in-left absolute bottom-0 left-0 top-0 w-[min(320px,86vw)] py-3" onClick={(e) => e.stopPropagation()}>
              {panel}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function Zone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: ZONE + id });
  return (
    <div ref={setNodeRef} className="rounded-xl transition-colors" style={{ background: isOver ? "rgba(217,180,95,.22)" : undefined, outline: isOver ? "2px dashed rgba(168,138,63,.7)" : undefined }}>
      {children}
    </div>
  );
}

function CalendarRow({ cal, on, onToggle }: { cal: GoogleCalendarSource; on: boolean; onToggle: () => void }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: cal.id });
  const color = cal.color ?? "#46688a";
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="board-sortable flex min-h-10 cursor-grab touch-manipulation items-center gap-2 rounded-lg px-1.5 active:cursor-grabbing"
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        zIndex: isDragging ? 10 : undefined,
        background: isDragging ? "rgba(243,230,200,.95)" : undefined,
        boxShadow: isDragging ? "0 8px 18px rgba(0,0,0,.3)" : undefined,
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={`Show ${cal.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggle}
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded"
        style={{ background: on ? color : "transparent", border: `2px solid ${color}` }}
      >
        {on && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: "var(--t-ink)", opacity: on ? 1 : 0.6 }} title={cal.name}>
        {cal.name}
      </span>
    </li>
  );
}
