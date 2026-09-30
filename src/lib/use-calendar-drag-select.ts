"use client";

import { useEffect, useRef, useState } from "react";

type Selection = { dayIndex: number; startRow: number; endRow: number };
type FinishedRange = { dayIndex: number; lowRow: number; highRow: number };

/**
 * Drag-to-select a range of hour rows on the Day/Week calendar grids, for
 * "drag the time range to add a quest". Deliberately hover-based (pointerenter
 * on each cell) rather than tracked-position math against the grid's pixel
 * geometry — the Week grid's row height is a fixed constant so pixel math
 * would work there, but the Day view's rows are auto-height, so a single
 * approach that works for both is worth the small mouse-only tradeoff
 * (no `setPointerCapture`, so sibling cells still receive their own
 * `pointerenter` as the cursor crosses into them — touch drag-select doesn't
 * really work this way, but tap-to-add-a-default-length-slot still does).
 *
 * `onFinish` fires once, on pointerup/pointercancel anywhere in the
 * document (not just within the grid), with the row range normalized so
 * `lowRow <= highRow` regardless of which direction the drag went.
 */
export function useCalendarDragSelect(onFinish: (range: FinishedRange) => void) {
  const dragRef = useRef<{ dayIndex: number; startRow: number } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const onFinishRef = useRef(onFinish);
  // Keep the latest callback without making `handleUp` (registered once,
  // below) capture a stale closure — assigning ref.current directly during
  // render trips the `react-hooks/refs` rule, so it happens in an effect
  // instead, which still runs well before any real pointerup can fire.
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  useEffect(() => {
    function handleUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      setSelection((sel) => {
        if (sel) {
          onFinishRef.current({
            dayIndex: drag.dayIndex,
            lowRow: Math.min(sel.startRow, sel.endRow),
            highRow: Math.max(sel.startRow, sel.endRow),
          });
        }
        return null;
      });
    }
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, []);

  function startDrag(dayIndex: number, row: number) {
    dragRef.current = { dayIndex, startRow: row };
    setSelection({ dayIndex, startRow: row, endRow: row });
  }
  function enterCell(dayIndex: number, row: number) {
    if (!dragRef.current || dragRef.current.dayIndex !== dayIndex) return;
    setSelection({ dayIndex, startRow: dragRef.current.startRow, endRow: row });
  }
  /** Whether (dayIndex, row) falls within the in-progress selection, for highlighting. */
  function isSelected(dayIndex: number, row: number) {
    if (!selection || selection.dayIndex !== dayIndex) return false;
    const lo = Math.min(selection.startRow, selection.endRow);
    const hi = Math.max(selection.startRow, selection.endRow);
    return row >= lo && row <= hi;
  }

  return { startDrag, enterCell, isSelected };
}
