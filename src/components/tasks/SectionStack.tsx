"use client";

import { useEffect, useRef, useState } from "react";

type Drag = { id: string; dy: number; target: number; h: number };

const GAP = 24; // matches gap-6

function readOrder(key: string, ids: string[], fallback: string[]): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const saved = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(saved)) {
      const known = saved.filter((x): x is string => typeof x === "string" && ids.includes(x));
      return [...known, ...fallback.filter((id) => !known.includes(id))];
    }
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

/**
 * Sections stacked one above another that can be put in any order: press a
 * closed section's header and drag it up or down (touch: hold it a moment
 * first, so scrolling still works). Alt + ↑/↓ on a closed header moves it
 * too. The order is remembered on this device. Open sections stay put, so
 * dragging never fights with what's inside them.
 */
export function SectionStack({
  sections,
  defaultOrder,
  storageKey,
  className = "flex flex-col gap-6",
}: {
  sections: { id: string; node: React.ReactNode }[];
  defaultOrder: string[];
  storageKey: string;
  className?: string;
}) {
  const ids = sections.map((s) => s.id);
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const [drag, setDrag] = useState<Drag | null>(null);
  const slots = useRef(new Map<string, HTMLDivElement>());
  const swallowClick = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
    setOrder(readOrder(storageKey, sections.map((s) => s.id), defaultOrder));
    // Read once; the section list itself doesn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const live = [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id))];

  function save(next: string[]) {
    setOrder(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  /** A closed section's header (its toggle reports aria-expanded="false"). */
  function closedHeader(target: EventTarget | null, slot: HTMLElement): boolean {
    const el = (target as HTMLElement | null)?.closest?.("[aria-expanded]");
    return !!el && slot.contains(el) && el.getAttribute("aria-expanded") === "false";
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, id: string) {
    if (e.button !== 0 || !closedHeader(e.target, e.currentTarget)) return;
    const startY = e.clientY;
    const startX = e.clientX;
    const touch = e.pointerType === "touch";
    // Where every section sits now, to work out where the dragged one lands.
    const rects = live.map((sid) => ({ id: sid, r: slots.current.get(sid)?.getBoundingClientRect() }));
    const me = rects.find((x) => x.id === id)?.r;
    if (!me) return;
    const from = live.indexOf(id);
    let active = false;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    const targetFor = (dy: number) => {
      const center = me.top + me.height / 2 + dy;
      let t = 0;
      for (const x of rects) {
        if (x.id === id || !x.r) continue;
        if (x.r.top + x.r.height / 2 < center) t++;
      }
      return t;
    };
    const begin = () => {
      active = true;
      navigator.vibrate?.(12);
      setDrag({ id, dy: 0, target: from, h: me.height });
    };
    const stopScroll = (ev: TouchEvent) => {
      if (active) ev.preventDefault();
    };
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!active) {
        const moved = Math.hypot(ev.clientX - startX, dy);
        if (touch) {
          // Moving before the hold completes means a scroll.
          if (moved > 8) end();
          return;
        }
        if (moved < 6) return;
        begin();
      }
      setDrag({ id, dy, target: targetFor(dy), h: me.height });
    };
    const end = () => {
      if (holdTimer) clearTimeout(holdTimer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", stopScroll);
    };
    const up = (ev: PointerEvent) => {
      end();
      if (!active) return;
      const t = targetFor(ev.clientY - startY);
      setDrag(null);
      // The release isn't also a tap that opens the section.
      swallowClick.current = true;
      setTimeout(() => (swallowClick.current = false), 0);
      if (t !== from) {
        const next = live.filter((x) => x !== id);
        next.splice(t, 0, id);
        save(next);
      }
    };
    const cancel = () => {
      end();
      if (active) setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", stopScroll, { passive: false });
    if (touch) holdTimer = setTimeout(begin, 280);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>, id: string) {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown") || !closedHeader(e.target, e.currentTarget)) return;
    e.preventDefault();
    const i = live.indexOf(id);
    const j = e.key === "ArrowUp" ? i - 1 : i + 1;
    if (j < 0 || j >= live.length) return;
    const next = [...live];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  }

  // While dragging, the sections it passes slide out of its way.
  function shiftFor(id: string): number {
    if (!drag || id === drag.id) return 0;
    const from = live.indexOf(drag.id);
    const i = live.indexOf(id);
    if (from < i && i <= drag.target) return -(drag.h + GAP);
    if (drag.target <= i && i < from) return drag.h + GAP;
    return 0;
  }

  return (
    <div className={className}>
      {sections.map((s) => {
        const isDragged = drag?.id === s.id;
        return (
          <div
            key={s.id}
            ref={(el) => {
              if (el) slots.current.set(s.id, el);
              else slots.current.delete(s.id);
            }}
            data-section={s.id}
            onPointerDown={(e) => onPointerDown(e, s.id)}
            onKeyDown={(e) => onKeyDown(e, s.id)}
            onClickCapture={(e) => {
              if (swallowClick.current) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            style={{
              order: live.indexOf(s.id),
              position: "relative",
              zIndex: isDragged ? 20 : undefined,
              transform: isDragged ? `translateY(${drag!.dy}px) scale(1.015)` : drag ? `translateY(${shiftFor(s.id)}px)` : undefined,
              transition: isDragged ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)",
              filter: isDragged ? "drop-shadow(0 12px 18px rgba(0,0,0,.4))" : undefined,
              cursor: isDragged ? "grabbing" : undefined,
            }}
          >
            {s.node}
          </div>
        );
      })}
    </div>
  );
}
