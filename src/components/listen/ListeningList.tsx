"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { completeTaskAction, createQuestAction, saveBoardOrderAction } from "@/app/actions";
import { addListenLinkAction, saveListenItemsAction, setListenOneDayAction, type ListenReflectConfig } from "@/app/listen-actions";
import { normalizeBoardOrder, orderQuests, type BoardOrder } from "@/lib/board-order";
import { newItemId, paceTo, readListen, rowUnits, type ListenData, type ListenItem } from "@/lib/listen";
import { Fold } from "@/components/ui/Fold";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import type { Task } from "@/lib/data/types";
import { ListenReflect } from "./ListenReflect";

/**
 * The Listening list (owner, Nov 20-21; review page https://claude.ai/artifact/VLoHfSQ9m9MsJztAo4vbjb).
 * One ranked list (drag to reorder; the top three are Up next), a band counting down to the course
 * deadline, rows that fold open to their own draggable list (a course's lessons, a podcast app's
 * shows, YouTube playlists, recordings), paste-a-link to add, a One day fold, and the reflect
 * screen under whatever was just finished.
 */

type Row = Task & { l: ListenData };
type Lessons = Record<string, { tasks: Task[]; order: unknown }>;
/** What was just finished: a row, or a thing inside it. */
type Finished = { rowId: string; itemId: string | null; title: string; xp: number } | null;

const INK = "#2a2418";
const SOFT = "#6b6252";
const GOLD = "#8a6116";

export function ListeningList({ boardId, tasks, order: savedOrder, lessons, reflect, theme }: { boardId: string; tasks: Task[]; order?: unknown; lessons: Lessons; reflect: ListenReflectConfig; theme: "calm" | "adventure" }) {
  const router = useRouter();
  const rows: Row[] = useMemo(() => tasks.filter((t) => t.board_id === boardId).map((t) => ({ ...t, l: readListen(t.listen) })), [tasks, boardId]);
  const [order, setOrder] = useState<BoardOrder>(() => {
    const o = normalizeBoardOrder(savedOrder);
    return o.by === "mine" ? o : { by: "mine" };
  });
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<Finished>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [oneDayOpen, setOneDayOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  const open = orderQuests(rows.filter((r) => r.status === "open" && !r.is_aspiration), order);
  const oneDay = rows.filter((r) => r.status === "open" && r.is_aspiration);
  const done = rows.filter((r) => r.status === "completed").sort((a, b) => Date.parse(b.completed_at ?? b.updated_at) - Date.parse(a.completed_at ?? a.updated_at));

  // The band: the nearest deadline among open rows, and everything inside the rows due then.
  const band = useMemo(() => {
    const dated = rows.filter((r) => r.due_at && !r.is_aspiration);
    if (!dated.length) return null;
    const next = dated.filter((r) => r.status === "open").map((r) => r.due_at!).sort()[0];
    if (!next) return null;
    const day = next.slice(0, 10);
    const sameDay = dated.filter((r) => r.due_at!.slice(0, 10) === day);
    let d = 0;
    let n = 0;
    for (const r of sameDay) {
      const u = rowUnits(r, r.l.lessonsBoard ? lessons[r.l.lessonsBoard]?.tasks : undefined);
      d += u.done;
      n += u.total;
    }
    const pace = paceTo(next, n - d);
    const when = new Date(next).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const source = sameDay.map((r) => r.l.source).find(Boolean);
    return { when, done: d, total: n, ...pace, source };
  }, [rows, lessons]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = open.map((t) => t.id);
    const next: BoardOrder = { by: "mine", ids: arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))) };
    const before = order;
    setOrder(next);
    start(() => void saveBoardOrderAction(boardId, next).catch(() => (setOrder(before), setError("Couldn't save the new order."))));
  }

  function finishRow(r: Row) {
    setError(null);
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("taskId", r.id);
        await completeTaskAction(fd);
        if (opensFor(reflect, r)) setFinished({ rowId: r.id, itemId: null, title: r.title, xp: r.xp_value });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  const upNext = open.slice(0, 3);
  const rest = open.slice(3);
  const rowProps = { lessons, reflect, finished, setFinished, onEdit: setEditing, onFinish: finishRow, onError: setError, boardId };

  return (
    <div className="listen-list flex flex-col gap-4" data-listen-list>
      {band && (
        <section className="listen-band" aria-label="Deadline">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-[13px] uppercase tracking-[0.12em]" style={{ color: GOLD }}>
              {band.source ? `${band.source} · ` : ""}by {band.when}
            </span>
            <span className="text-[13.5px]" style={{ color: SOFT }}>
              {band.days} {band.days === 1 ? "day" : "days"} left
            </span>
          </div>
          <div className="mt-1 text-[15.5px]" style={{ color: INK }}>
            {band.done} of {band.total} done{band.total - band.done > 0 ? ` · about ${band.perWeek} a week` : " · all done"}
          </div>
          <div className="listen-track mt-1.5" role="img" aria-label={`${band.done} of ${band.total} done`}>
            <i style={{ width: `${band.total ? Math.round((band.done / band.total) * 100) : 0}%` }} />
          </div>
        </section>
      )}

      <section className="listen-sheet" aria-label="Listening list">
        {open.length === 0 ? (
          <p className="m-0 py-2 text-[15px] italic" style={{ color: SOFT }}>
            Nothing on the list yet. Paste a link below to add something.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={open.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <h2 className="listen-head">Up next</h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {upNext.map((r, i) => (
                  <SortableRow key={r.id} row={r} rank={i + 1} {...rowProps} />
                ))}
              </ul>
              {rest.length > 0 && (
                <>
                  <h2 className="listen-head mt-3">Then</h2>
                  <ul className="m-0 flex list-none flex-col p-0">
                    {rest.map((r, i) => (
                      <SortableRow key={r.id} row={r} rank={i + 4} {...rowProps} />
                    ))}
                  </ul>
                </>
              )}
            </SortableContext>
          </DndContext>
        )}
        {open.length > 1 && <p className="m-0 mt-1 text-[13.5px] italic" style={{ color: SOFT }}>Hold a row and drag it to change its place.</p>}
        <AddField boardId={boardId} onError={setError} />
        {error && (
          <p role="alert" className="m-0 mt-2 text-[14px]" style={{ color: "#9b2c1f" }}>
            {error}
          </p>
        )}
      </section>

      {oneDay.length > 0 && (
        <section className="listen-sheet" aria-label="One day">
          <button type="button" className="listen-fold-btn" aria-expanded={oneDayOpen} onClick={() => setOneDayOpen((v) => !v)}>
            One day <span style={{ color: SOFT }}>({oneDay.length})</span> <Chevron open={oneDayOpen} />
          </button>
          <Fold open={oneDayOpen}>
            <ul className="m-0 flex list-none flex-col p-0 pt-1">
              {oneDay.map((r) => (
                <ListenRow key={r.id} row={r} {...rowProps} />
              ))}
            </ul>
          </Fold>
        </section>
      )}

      {done.length > 0 && (
        <section className="listen-sheet" aria-label="Finished">
          <button type="button" className="listen-fold-btn" aria-expanded={doneOpen} onClick={() => setDoneOpen((v) => !v)}>
            Finished <span style={{ color: SOFT }}>({done.length})</span> <Chevron open={doneOpen} />
          </button>
          <Fold open={doneOpen || done.some((r) => finished?.rowId === r.id)}>
            <ul className="m-0 flex list-none flex-col p-0 pt-1">
              {done.map((r) => (
                <ListenRow key={r.id} row={r} {...rowProps} />
              ))}
            </ul>
          </Fold>
        </section>
      )}

      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => (setEditing(null), router.refresh())} />}
    </div>
  );
}

/** Whether the reflect screen opens after finishing this (its gear: every item · only courses · never). */
function opensFor(reflect: ListenReflectConfig, r: Row) {
  const when = reflect.openWhen ?? "every";
  return when === "every" || (when === "courses" && r.l.kind === "course");
}

type RowProps = {
  row: Row;
  rank?: number;
  boardId: string;
  lessons: Lessons;
  reflect: ListenReflectConfig;
  finished: Finished;
  setFinished: (f: Finished) => void;
  onEdit: (t: Task) => void;
  onFinish: (r: Row) => void;
  onError: (m: string | null) => void;
  drag?: { attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined; style: React.CSSProperties; setRef: (el: HTMLElement | null) => void; dragging: boolean };
};

function SortableRow(p: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.row.id });
  return (
    <ListenRow
      {...p}
      drag={{
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: listeners as Record<string, unknown> | undefined,
        style: { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined, position: "relative" },
        setRef: setNodeRef,
        dragging: isDragging,
      }}
    />
  );
}

function ListenRow({ row, rank, lessons, reflect, finished, setFinished, onEdit, onFinish, onError, drag }: RowProps) {
  const router = useRouter();
  const l = row.l;
  const lessonBoard = l.lessonsBoard ? lessons[l.lessonsBoard] : null;
  const hasInside = !!lessonBoard || (l.items?.length ?? 0) > 0 || l.kind !== "item";
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [, start] = useTransition();
  const units = rowUnits(row, lessonBoard?.tasks);
  const isDone = row.status === "completed";
  const showReflect = finished?.rowId === row.id;

  // Play opens the next thing that isn't done, in his order.
  const lessonTasks = lessonBoard ? orderQuests(lessonBoard.tasks, normalizeBoardOrder(lessonBoard.order)) : [];
  const nextLink = lessonBoard
    ? linkIn(lessonTasks.find((t) => t.status === "open")?.description ?? null) ?? l.url
    : ((l.items ?? []).find((i) => !i.done && i.url)?.url ?? l.url ?? linkIn(row.description));
  const meta = [
    l.source,
    units.total > 1 ? `${units.done} of ${units.total}${l.kind === "course" ? (lessonBoard ? " weeks" : " lessons") : ""}` : null,
    l.kind === "app" ? `${l.items?.length ?? 0} ${l.app === "podcasts" ? "shows" : "links"}` : null,
    row.due_at && !isDone ? `by ${new Date(row.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : null,
  ].filter(Boolean);

  return (
    <li ref={drag?.setRef} style={drag?.style} className={`listen-row ${drag?.dragging ? "is-dragging" : ""}`} data-listen-row={row.id}>
      <div className="listen-row-main" {...(drag?.attributes ?? {})} {...(drag?.listeners ?? {})}>
        {rank ? <span className="listen-rank">{rank}</span> : <span className="listen-rank" aria-hidden />}
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            {!hasInside || l.kind === "item" ? (
              <RoundTick checked={isDone} label={isDone ? `${row.title} is finished` : `Mark ${row.title} finished`} onChange={(v) => v && !isDone && onFinish(row)} />
            ) : null}
            <span dir="auto" className="user-text text-[16.5px] leading-snug" style={{ color: isDone ? SOFT : INK }}>
              {row.title}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]" style={{ color: SOFT }}>
            {meta.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
            {hasInside && (
              <button type="button" className="listen-pill" aria-expanded={open} onClick={(e) => (e.stopPropagation(), setOpen((v) => !v))} onPointerDown={(e) => e.stopPropagation()}>
                {open ? "close" : "open"} <Chevron open={open} />
              </button>
            )}
            <button type="button" className="listen-pill quiet" aria-expanded={menu} aria-label={`More for ${row.title}`} onClick={(e) => (e.stopPropagation(), setMenu((v) => !v))} onPointerDown={(e) => e.stopPropagation()}>
              ⋯
            </button>
          </div>
          {units.total > 1 && (
            <div className="listen-track mt-1.5" role="img" aria-label={`${units.done} of ${units.total}`}>
              <i style={{ width: `${Math.round((units.done / units.total) * 100)}%` }} />
            </div>
          )}
        </div>
        {nextLink ? (
          <a href={nextLink} target="_blank" rel="noreferrer" className="listen-play" aria-label={`Play ${row.title}`} title="Open the next one" onPointerDown={(e) => e.stopPropagation()}>
            <PlayIcon />
          </a>
        ) : (
          <span className="listen-play is-off" aria-hidden>
            <PlayIcon />
          </span>
        )}
      </div>

      <Fold open={menu}>
        <div className="flex flex-wrap gap-2 pb-2 pl-9 pt-1">
          <button type="button" className="listen-pill" onClick={() => (setMenu(false), onEdit(row))}>
            ✎ Edit
          </button>
          {!isDone && (
            <button
              type="button"
              className="listen-pill"
              onClick={() => {
                setMenu(false);
                start(async () => {
                  try {
                    await setListenOneDayAction(row.id, !row.is_aspiration);
                    router.refresh();
                  } catch (e) {
                    onError(e instanceof Error ? e.message : "Couldn't move it.");
                  }
                });
              }}
            >
              {row.is_aspiration ? "Back on the list" : "Move to One day"}
            </button>
          )}
          {!isDone && hasInside && l.kind !== "item" && (
            <button type="button" className="listen-pill" onClick={() => (setMenu(false), onFinish(row))}>
              Mark it all finished
            </button>
          )}
          {isDone && (
            <button type="button" className="listen-pill" onClick={() => (setMenu(false), setFinished({ rowId: row.id, itemId: null, title: row.title, xp: 0 }))}>
              Reflect
            </button>
          )}
        </div>
      </Fold>

      {hasInside && (
        <Fold open={open}>
          {lessonBoard ? (
            <LessonBoardList row={row} boardTasks={lessonTasks} lessonsBoardId={l.lessonsBoard!} onEdit={onEdit} onError={onError} onFinished={(t) => opensFor(reflect, row) && setFinished({ rowId: row.id, itemId: t.id, title: t.title, xp: t.xp_value })} />
          ) : (
            <InnerList row={row} onError={onError} onFinished={(i) => opensFor(reflect, row) && setFinished({ rowId: row.id, itemId: i.id, title: i.title, xp: 0 })} onReflect={(i) => setFinished({ rowId: row.id, itemId: i.id, title: i.title, xp: 0 })} />
          )}
        </Fold>
      )}

      {showReflect && finished && (
        <ListenReflect
          key={`${finished.rowId}:${finished.itemId ?? "row"}`}
          taskId={row.id}
          itemKey={finished.itemId ? (lessonBoard ? `lesson:${finished.itemId}` : finished.itemId) : null}
          title={finished.title}
          xp={finished.xp}
          saved={l.reflections?.[finished.itemId ? (lessonBoard ? `lesson:${finished.itemId}` : finished.itemId) : "row"] ?? null}
          config={reflect}
          onClose={() => setFinished(null)}
        />
      )}
    </li>
  );
}

/** The first link written in a quest's description, if any. */
function linkIn(text: string | null | undefined): string | null {
  const m = /https?:\/\/[^\s)]+/.exec(text ?? "");
  return m ? m[0] : null;
}

/** A row's own list (lessons, shows, playlists, recordings): drag by the handle, ✎ to rename or relink, tick, + add. */
function InnerList({ row, onError, onFinished, onReflect }: { row: Row; onError: (m: string | null) => void; onFinished: (i: ListenItem) => void; onReflect: (i: ListenItem) => void }) {
  const router = useRouter();
  const [items, setItems] = useState<ListenItem[]>(row.l.items ?? []);
  const [edit, setEdit] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const word = row.l.kind === "course" ? "lesson" : row.l.app === "podcasts" ? "show" : row.l.app === "youtube" ? "playlist or video" : "recording";

  function save(next: ListenItem[], after?: () => void) {
    const before = items;
    setItems(next);
    onError(null);
    start(async () => {
      try {
        setItems(await saveListenItemsAction(row.id, next));
        after?.();
        router.refresh();
      } catch (e) {
        setItems(before);
        onError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = items.map((i) => i.id);
    save(arrayMove(items, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  }

  return (
    <div className="listen-inner">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ol className="m-0 list-none p-0">
            {items.map((it, idx) => (
              <InnerItem
                key={it.id}
                item={it}
                index={idx + 1}
                editing={edit === it.id}
                onEdit={() => setEdit(edit === it.id ? null : it.id)}
                onTick={(done) => save(items.map((x) => (x.id === it.id ? { ...x, done } : x)), done ? () => onFinished(it) : undefined)}
                onSave={(title, url) => (setEdit(null), save(items.map((x) => (x.id === it.id ? { ...x, title, url } : x))))}
                onRemove={() => (setEdit(null), save(items.filter((x) => x.id !== it.id)))}
                onReflect={() => onReflect(it)}
                reflected={!!row.l.reflections?.[it.id]}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {adding ? (
        <ItemFields word={word} onCancel={() => setAdding(false)} onSave={(title, url) => (setAdding(false), save([...items, { id: newItemId(), title, url }]))} />
      ) : (
        <button type="button" className="listen-add" onClick={() => setAdding(true)}>
          + Add a {word}
        </button>
      )}
    </div>
  );
}

function InnerItem({ item, index, editing, onEdit, onTick, onSave, onRemove, onReflect, reflected }: { item: ListenItem; index: number; editing: boolean; onEdit: () => void; onTick: (done: boolean) => void; onSave: (title: string, url: string | null) => void; onRemove: () => void; onReflect: () => void; reflected: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 5 : undefined }} className={`listen-lesson ${item.done ? "is-done" : ""} ${isDragging ? "is-dragging" : ""}`}>
      <div className="listen-lesson-line">
        <button type="button" ref={setActivatorNodeRef} className="listen-grip" aria-label={`Drag ${item.title} to reorder`} {...attributes} {...listeners}>
          <GripIcon />
        </button>
        <RoundTick small checked={!!item.done} label={item.done ? `Unmark ${item.title}` : `Mark ${item.title} done`} onChange={onTick} />
        <span className="min-w-0 flex-1">
          <span className="listen-num">{index}</span>{" "}
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="user-text listen-link" dir="auto">
              {item.title}
            </a>
          ) : (
            <span className="user-text" dir="auto">
              {item.title}
            </span>
          )}
          {item.done && (
            <button type="button" className="listen-mini" onClick={onReflect}>
              {reflected ? "· reflection" : "· reflect"}
            </button>
          )}
        </span>
        <button type="button" className="listen-pen" aria-label={`Edit ${item.title}`} aria-expanded={editing} onClick={onEdit}>
          ✎
        </button>
      </div>
      <Fold open={editing}>{editing && <ItemFields initial={item} onCancel={onEdit} onSave={onSave} onRemove={onRemove} />}</Fold>
    </li>
  );
}

function ItemFields({ initial, word = "one", onSave, onCancel, onRemove }: { initial?: ListenItem; word?: string; onSave: (title: string, url: string | null) => void; onCancel: () => void; onRemove?: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const ok = title.trim().length > 0;
  return (
    <form
      className="listen-fields"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave(title.trim(), url.trim() || null);
      }}
    >
      <input className="listen-input" aria-label="Name" placeholder={`Name of the ${word}`} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <input className="listen-input" aria-label="Link" placeholder="Link (optional)" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="listen-btn" disabled={!ok}>
          Save
        </button>
        <button type="button" className="listen-btn quiet" onClick={onCancel}>
          Cancel
        </button>
        {onRemove && (
          <button type="button" className="listen-btn quiet ml-auto" style={{ color: "#9b2c1f" }} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </form>
  );
}

/** A course whose lessons are quests on its own board (Mastering Facilitation Skills): the same quests, so a tick or a move here changes that board too. */
function LessonBoardList({ row, boardTasks, lessonsBoardId, onEdit, onError, onFinished }: { row: Row; boardTasks: Task[]; lessonsBoardId: string; onEdit: (t: Task) => void; onError: (m: string | null) => void; onFinished: (t: Task) => void }) {
  const router = useRouter();
  const [list, setList] = useState<Task[]>(boardTasks);
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = list.map((t) => t.id);
    const next = arrayMove(list, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    const before = list;
    setList(next);
    start(() => void saveBoardOrderAction(lessonsBoardId, { by: "mine", ids: next.map((t) => t.id) }).catch(() => (setList(before), onError("Couldn't save the new order."))));
  }
  function tick(t: Task) {
    if (t.status === "completed") return;
    setList((ls) => ls.map((x) => (x.id === t.id ? { ...x, status: "completed" } : x)));
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("taskId", t.id);
        await completeTaskAction(fd);
        onFinished(t);
        router.refresh();
      } catch (e) {
        setList(boardTasks);
        onError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  const xp = boardTasks.map((t) => t.xp_value).sort((a, b) => a - b)[Math.floor(boardTasks.length / 2)] ?? 15;
  return (
    <div className="listen-inner">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ol className="m-0 list-none p-0">
            {list.map((t, i) => (
              <LessonQuest key={t.id} task={t} index={i + 1} onTick={() => tick(t)} onEdit={() => onEdit(t)} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {adding ? (
        <ItemFields
          word="lesson"
          onCancel={() => setAdding(false)}
          onSave={(title, url) => {
            setAdding(false);
            start(async () => {
              try {
                await createQuestAction({ title, description: url ?? undefined, importance: 3, urgency: 3, xpValue: xp, boardId: lessonsBoardId, placement: "none" });
                router.refresh();
              } catch (e) {
                onError(e instanceof Error ? e.message : "Couldn't add it.");
              }
            });
          }}
        />
      ) : (
        <button type="button" className="listen-add" onClick={() => setAdding(true)}>
          + Add a lesson
        </button>
      )}
      <a href={`/boards/${lessonsBoardId}`} className="listen-mini ml-0 block pt-1">
        Open the {row.title} board
      </a>
    </div>
  );
}

function LessonQuest({ task, index, onTick, onEdit }: { task: Task; index: number; onTick: () => void; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const done = task.status === "completed";
  const link = linkIn(task.description);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 5 : undefined }} className={`listen-lesson ${done ? "is-done" : ""} ${isDragging ? "is-dragging" : ""}`}>
      <div className="listen-lesson-line">
        <button type="button" ref={setActivatorNodeRef} className="listen-grip" aria-label={`Drag ${task.title} to reorder`} {...attributes} {...listeners}>
          <GripIcon />
        </button>
        <RoundTick small checked={done} label={done ? `${task.title} is done` : `Mark ${task.title} done`} onChange={(v) => v && onTick()} />
        <span className="min-w-0 flex-1">
          <span className="listen-num">{index}</span>{" "}
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="user-text listen-link" dir="auto">
              {task.title}
            </a>
          ) : (
            <span className="user-text" dir="auto">
              {task.title}
            </span>
          )}
        </span>
        <button type="button" className="listen-pen" aria-label={`Edit ${task.title}`} onClick={onEdit}>
          ✎
        </button>
      </div>
    </li>
  );
}

/** Paste a link (YouTube and podcast links join their app's row) or type a name. */
function AddField({ boardId, onError }: { boardId: string; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="listen-addbar"
      onSubmit={(e) => {
        e.preventDefault();
        const v = text.trim();
        if (!v) return;
        onError(null);
        start(async () => {
          try {
            const res = await addListenLinkAction(boardId, v);
            setText("");
            setNote(res.to === "app" ? `Added "${res.title}" inside its row.` : `Added "${res.title}" at the bottom.`);
            router.refresh();
          } catch (err) {
            onError(err instanceof Error ? err.message : "Couldn't add it.");
          }
        });
      }}
    >
      <input className="listen-input flex-1" aria-label="Paste a link or type a name" placeholder="Paste a link or type a name" value={text} onChange={(e) => (setText(e.target.value), setNote(null))} />
      <button type="submit" className="listen-btn" disabled={pending || !text.trim()}>
        Add
      </button>
      {note && (
        <p className="m-0 w-full text-[13.5px] italic" style={{ color: SOFT }} role="status">
          {note}
        </p>
      )}
    </form>
  );
}

/** The app's gold round tick (GoldCheck's look), smaller for things inside a row. */
export function RoundTick({ checked, label, onChange, small = false }: { checked: boolean; label: string; onChange: (v: boolean) => void; small?: boolean }) {
  const size = small ? 18 : 22;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => (e.stopPropagation(), onChange(!checked))}
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-[2px] flex shrink-0 items-center justify-center rounded-full transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#8a6116]"
      style={{
        width: size,
        height: size,
        ...(checked
          ? { background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "1.5px solid #4a3913", boxShadow: "0 0 8px rgba(242,210,126,.55), inset 0 1px 0 rgba(255,255,255,.6)" }
          : { background: "rgba(255,250,238,.85)", border: "1.5px solid #b39a6a", boxShadow: "inset 0 1px 2px rgba(0,0,0,.12)" }),
      }}
    >
      {checked && (
        <svg width={size - 8} height={size - 8} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#3a2a08" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .2s" }}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 5.5v13l10.5-6.5L8 5.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden>
      {[3, 8, 13].map((y) => (
        <g key={y}>
          <circle cx="3.5" cy={y} r="1.3" />
          <circle cx="8.5" cy={y} r="1.3" />
        </g>
      ))}
    </svg>
  );
}

