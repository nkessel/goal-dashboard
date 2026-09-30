"use client";

import { useRef, useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { reorderTasksAction, toggleManualPriorityAction } from "@/app/actions";
import { useFlip } from "@/lib/use-flip";
import { TaskRow } from "./TaskRow";
import { QuestPickerSheet } from "./QuestPickerSheet";

type ListName = "priority" | "other";
const MAX_PRIORITY = 3;

/** A task plus its resolved category pill (task -> goal -> board title).
 * Typed locally instead of importing TaskWithCategory from the ("server
 * only") data layer, which client components can't import from. */
type TaskWithCategory = Task & { categoryLabel?: string | null };

function sameOrder(a: TaskWithCategory[], b: TaskWithCategory[]) {
  return a.length === b.length && a.every((t, i) => t.id === b[i]?.id);
}
function sameIdSet(a: TaskWithCategory[], b: TaskWithCategory[]) {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((t) => t.id));
  return b.every((t) => ids.has(t.id));
}

/**
 * Today's Battle (pinned, max 3) and Additional Quests, combined into one
 * component so a quest can be dragged between the two lists — not just
 * reordered within one — with the same live-reflow + FLIP-animated slide
 * used elsewhere. Dropping into the other list toggles is_manual_priority;
 * dropping within a list reorders it (both persist via server actions).
 *
 * priority/other are derived from the server props (priorityTasks/otherTasks)
 * whenever nothing is in flight, so an edit, completion, or new quest added
 * elsewhere (via revalidatePath) shows up immediately. Only while a drag — or
 * its not-yet-confirmed commit — is in progress do we fork to a local
 * optimistic copy, released again once the server props catch up.
 */
export function TodayTaskBoard({
  priorityTasks,
  otherTasks,
  theme = "calm",
}: {
  priorityTasks: TaskWithCategory[];
  otherTasks: TaskWithCategory[];
  theme?: "calm" | "adventure";
}) {
  const [localPriority, setLocalPriority] = useState<TaskWithCategory[] | null>(null);
  const [localOther, setLocalOther] = useState<TaskWithCategory[] | null>(null);
  const [seenPriorityTasks, setSeenPriorityTasks] = useState(priorityTasks);
  const [seenOtherTasks, setSeenOtherTasks] = useState(otherTasks);
  const priority = localPriority ?? priorityTasks;
  const other = localOther ?? otherTasks;

  const [otherOpen, setOtherOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const isAdventure = theme === "adventure";

  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef<{ id: string; from: ListName; moved: boolean } | null>(null);
  const registerPriority = useFlip(priority, (t) => t.id);
  const registerOther = useFlip(other, (t) => t.id);

  // Adjust local overrides in response to new server (revalidated) props —
  // done during render, React's recommended pattern for resetting state
  // from props, rather than in a useEffect (which would cost an extra
  // render after the one that already updated the props). Once the props
  // either match what we committed, or have changed in a way our local
  // copy can't know about (an item added/removed elsewhere), the props are
  // now the more correct source of truth than a stale local snapshot.
  // Gated on the `isDragging` state (not the `drag` ref, which isn't safe
  // to read during render) so an unrelated revalidation mid-drag can't yank
  // the live preview out from under the pointer.
  if (priorityTasks !== seenPriorityTasks) {
    setSeenPriorityTasks(priorityTasks);
    if (
      localPriority &&
      !isDragging &&
      (!sameIdSet(localPriority, priorityTasks) || sameOrder(localPriority, priorityTasks))
    ) {
      setLocalPriority(null);
    }
  }
  if (otherTasks !== seenOtherTasks) {
    setSeenOtherTasks(otherTasks);
    if (
      localOther &&
      !isDragging &&
      (!sameIdSet(localOther, otherTasks) || sameOrder(localOther, otherTasks))
    ) {
      setLocalOther(null);
    }
  }

  function listFor(name: ListName) {
    return name === "priority" ? priority : other;
  }
  function setListFor(name: ListName, next: TaskWithCategory[]) {
    if (name === "priority") setLocalPriority(next);
    else setLocalOther(next);
  }

  function start(id: string, from: ListName) {
    drag.current = { id, from, moved: false };
    setIsDragging(true);
    // Snapshot both lists so splices during the drag operate on a stable
    // local copy rather than racing with fresh server props.
    setLocalPriority(priority);
    setLocalOther(other);
  }

  function moveWithin(listName: ListName, overId: string) {
    const d = drag.current;
    if (!d || d.from !== listName || d.id === overId) return;
    const items = listFor(listName);
    const fromIndex = items.findIndex((t) => t.id === d.id);
    const toIndex = items.findIndex((t) => t.id === overId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setListFor(listName, next);
  }

  function moveAcross(targetList: ListName, atEnd: boolean, overId?: string) {
    const d = drag.current;
    if (!d || d.from === targetList) return;
    if (targetList === "priority" && priority.length >= MAX_PRIORITY) return; // full — no room to preview the move
    const sourceItems = listFor(d.from);
    const task = sourceItems.find((t) => t.id === d.id);
    if (!task) return;
    const nextSource = sourceItems.filter((t) => t.id !== d.id);
    const targetItems = listFor(targetList);
    const insertAt = atEnd ? targetItems.length : Math.max(0, targetItems.findIndex((t) => t.id === overId));
    const nextTarget = [...targetItems];
    nextTarget.splice(insertAt === -1 ? targetItems.length : insertAt, 0, task);
    setListFor(d.from, nextSource);
    setListFor(targetList, nextTarget);
    drag.current = { id: d.id, from: targetList, moved: true };
  }

  /**
   * @param committed Pass `false` from a cancelled drag (dropped outside any
   * valid target, or aborted via Escape) to discard the live preview instead
   * of persisting it — `onDragEnd` fires whether or not the drop was
   * actually accepted, so it passes `e.dataTransfer.dropEffect !== "none"`.
   */
  function finish(committed = true) {
    const d = drag.current;
    drag.current = null;
    setIsDragging(false);
    if (!d) return;
    if (!committed) {
      setLocalPriority(null);
      setLocalOther(null);
      return;
    }
    setDragError(null);

    const committedPriority = priority;
    const committedOther = other;

    startTransition(async () => {
      try {
        if (d.moved) {
          // d.from now holds the *destination* list (see moveAcross) since
          // we update it as the drag moves — pin true iff it landed in priority.
          await toggleManualPriorityAction(d.id, d.from === "priority");
        }
        await Promise.all([
          reorderTasksAction(committedPriority.map((t) => t.id)),
          reorderTasksAction(committedOther.map((t) => t.id)),
        ]);
        // Leave local* set — the release effects above clear them once fresh
        // server props (from the revalidation this triggers) match.
      } catch (e) {
        setDragError(e instanceof Error ? e.message : "Couldn't move that quest — try again.");
        // Roll back optimistic state to what the server actually has.
        setLocalPriority(null);
        setLocalOther(null);
      }
    });
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        {/* justify-center + the add button pinned via absolute right-0 keeps
            the title itself centered in the row (per the mockups' chapter-
            heading feel) while the action stays reachable at the trailing
            edge — the same "centered title, trailing button" split as a
            typical mobile nav bar. */}
        <div className="relative flex items-center justify-center gap-2.5">
          {isAdventure && (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 3l2 5 5 .5-3.8 3.4 1.1 5.1L12 14.7 7.7 17l1.1-5.1L5 8.5 10 8z" fill="var(--t-gold)" />
            </svg>
          )}
          <h2
            className={isAdventure ? "font-display text-xl" : "text-lg font-extrabold"}
            style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
          >
            {isAdventure ? "Today's Battle" : "Today's Focus"}
          </h2>
          <span className="text-sm" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.7 : 1 }}>
            {priority.length}/3
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label={isAdventure ? "Add to Today's Battle" : "Add to Today's Focus"}
            title={isAdventure ? "Add to Today's Battle" : "Add to Today's Focus"}
            className="hover-glow absolute right-0 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke={isAdventure ? "#2a1c10" : "#fff"} strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {pickerOpen && (
          <QuestPickerSheet otherTasks={other} theme={theme} onClose={() => setPickerOpen(false)} />
        )}
        {dragError && (
          <p className="text-xs" style={{ color: "var(--t-warn)" }}>
            {dragError}
          </p>
        )}

        {priority.length === 0 ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              moveAcross("priority", true);
            }}
            onDrop={(e) => {
              e.preventDefault();
              finish();
            }}
            className="rounded-xl border border-dashed p-4 text-sm"
            style={{
              borderColor: isAdventure ? "rgba(243,233,207,.4)" : "var(--t-ink-soft)",
              color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)",
              opacity: isAdventure ? 0.75 : 1,
            }}
          >
            {isAdventure
              ? "No monsters queued yet — drag a quest here (or join up to 3 below) to enter today's battle."
              : "Nothing pinned yet — drag a task here (or pin up to 3 below) to curate today's focus."}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {priority.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                theme={theme}
                categoryLabel={task.categoryLabel}
                draggable
                innerRef={registerPriority(task.id)}
                onDragStart={(e) => {
                  start(task.id, "priority");
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (drag.current?.from === "priority") moveWithin("priority", task.id);
                  else moveAcross("priority", false, task.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  finish();
                }}
                onDragEnd={(e) => finish(e.dataTransfer.dropEffect !== "none")}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        {/* hover-glow lives on the <summary> itself, not the whole <details>
            — putting it on <details> made its box-shadow glow wrap the
            *entire* element, revealed content included, once open, so
            hovering (or just having last clicked) the header drew a single
            fused glow around both the header bar and the quest card(s)
            underneath it. Scoping it to <summary> keeps the glow on just
            the clickable header, where it belongs. */}
        <details className="group rounded-xl" open={otherOpen} onToggle={(e) => setOtherOpen(e.currentTarget.open)}>
          <summary
            data-quest-dropzone="other"
            className="hover-glow relative flex cursor-pointer list-none items-center justify-center rounded-xl px-4 py-3"
            style={{
              background: isAdventure ? "rgba(0,0,0,.28)" : "var(--t-card)",
              border: isAdventure ? "1px solid rgba(243,233,207,.25)" : "1px solid var(--t-card-border)",
            }}
          >
            <span className="flex items-center gap-2.5 text-sm" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
              {isAdventure ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2 4 6v6c0 5 3.5 8.7 8 10 4.5-1.3 8-5 8-10V6z" stroke="var(--t-gold)" strokeWidth="1.6" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="4" stroke="var(--t-ink-soft)" strokeWidth="1.5" />
                  <path d="M8 12h8" stroke="var(--t-ink-soft)" strokeWidth="1.5" />
                </svg>
              )}
              {isAdventure ? "Other Quests" : "More tasks"} <span style={{ opacity: 0.6, fontWeight: 400 }}>({other.length})</span>
            </span>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              className="absolute right-4 transition-transform group-open:rotate-180"
            >
              <path d="M6 9l6 6 6-6" stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)"} strokeWidth="2" fill="none" />
            </svg>
          </summary>
          <div
            className="mt-3"
            onDragOver={(e) => {
              e.preventDefault();
              if (other.length === 0) moveAcross("other", true);
            }}
            onDrop={(e) => {
              e.preventDefault();
              finish();
            }}
          >
            {other.length === 0 ? (
              <p className="text-sm" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.7 : 1 }}>
                Nothing here — nice.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {other.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    theme={theme}
                    categoryLabel={task.categoryLabel}
                    draggable
                    innerRef={registerOther(task.id)}
                    onDragStart={(e) => {
                      start(task.id, "other");
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (drag.current?.from === "other") moveWithin("other", task.id);
                      else moveAcross("other", false, task.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      finish();
                    }}
                    onDragEnd={(e) => finish(e.dataTransfer.dropEffect !== "none")}
                  />
                ))}
              </ul>
            )}
          </div>
        </details>
      </section>
    </>
  );
}
