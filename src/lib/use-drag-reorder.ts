"use client";

import { useState } from "react";

function sameOrder<T>(a: T[], b: T[], getId: (item: T) => string) {
  return a.length === b.length && a.every((item, i) => getId(item) === getId(b[i]));
}
function sameIdSet<T>(a: T[], b: T[], getId: (item: T) => string) {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map(getId));
  return b.every((item) => ids.has(getId(item)));
}

/**
 * Shared drag-to-reorder behavior for the boards grid, the goals list within
 * a board, and the task lists on the Today view. Reordering happens live —
 * as the dragged item passes over another, the two swap places immediately
 * (a real reflow, not just a drop-target highlight) — and the final order is
 * persisted once, when the drag ends.
 *
 * `items` renders from the caller's `source` prop whenever nothing is in
 * flight, so an edit/add/delete elsewhere (via revalidatePath) shows up
 * immediately instead of being masked by stale local state — the previous
 * version forked into local state on mount and never looked at `source`
 * again, which is what made lists go stale and reorders commit against
 * outdated data after any other change.
 */
export function useDragReorder<T>({
  items: source,
  getId,
  onCommit,
}: {
  items: T[];
  getId: (item: T) => string;
  onCommit: (orderedIds: string[]) => void | Promise<void>;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<T[] | null>(null);
  const [seenSource, setSeenSource] = useState(source);

  // Adjust the local override in response to a new `source` — done during
  // render, React's recommended pattern for resetting state from props,
  // rather than in a useEffect (which would cost an extra render after the
  // one that already updated `source`). Once `source` either confirms the
  // order we committed, or has changed in a way our snapshot can't reflect
  // (an item added/removed elsewhere), `source` is the better truth than a
  // stale local copy. Gated on `draggingId === null` (state, not a ref, so
  // it's safe to read during render) so an unrelated revalidation mid-drag
  // can't yank the live preview out from under the pointer.
  if (source !== seenSource) {
    setSeenSource(source);
    if (
      localItems &&
      draggingId === null &&
      (!sameIdSet(localItems, source, getId) || sameOrder(localItems, source, getId))
    ) {
      setLocalItems(null);
    }
  }

  const items = localItems ?? source;

  function start(id: string) {
    setDraggingId(id);
    // Snapshot to edit from, so drag math doesn't race fresh props — but if
    // a previous drag's commit is still in flight (localItems already holds
    // its not-yet-confirmed result), build on top of that instead of
    // `source`, which is still the pre-commit order at this point. Starting
    // a second drag before the first's revalidation lands used to reset the
    // list back to the stale order, silently undoing the first drag.
    setLocalItems((prev) => prev ?? source);
  }

  function moveOver(overId: string) {
    setLocalItems((prev) => {
      const base = prev ?? source;
      if (draggingId === null || draggingId === overId) return base;
      const fromIndex = base.findIndex((item) => getId(item) === draggingId);
      const toIndex = base.findIndex((item) => getId(item) === overId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return base;
      const next = [...base];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  /**
   * @param committed Pass `false` from a cancelled drag (dropped outside any
   * valid target, or aborted via Escape) to discard the live preview instead
   * of persisting it. `onDrop` handlers (a real, successful drop) can omit
   * this — it defaults to true — but `onDragEnd` fires unconditionally
   * whether or not the drop was accepted, so callers should pass
   * `e.dataTransfer.dropEffect !== "none"` there.
   */
  function finish(committed = true) {
    setDraggingId(null);
    if (!committed) {
      setLocalItems(null); // cancelled — revert to server truth, don't persist the preview
      return;
    }
    const current = localItems;
    if (!current || sameOrder(current, source, getId)) {
      setLocalItems(null); // no-op drag — nothing to persist
      return;
    }
    Promise.resolve(onCommit(current.map(getId))).catch((err) => {
      console.error("Reorder failed:", err);
      setLocalItems(null); // revert to server truth
    });
    // Otherwise leave localItems set; the effect above releases it once
    // `source` (refreshed by onCommit's revalidation) matches.
  }

  return { items, draggingId, start, moveOver, finish };
}
