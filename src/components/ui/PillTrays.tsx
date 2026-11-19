"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A row of `.qe-fact` pills whose trays open right under the open pill's own line, with a small
 * point aimed at that pill (owner, Nov 19: "weird to have a button that reveals a section so far
 * away from the button"; picked B, "The pointer!!").
 *
 * Children: the pill row (give it `contents` so its pills join this row) and the trays, each marked
 * `data-pill-tray` (full width). The tray's box gets `pill-tray-box` (a solid panel with the point).
 * Everything after the open pill's line moves below the tray, using `order`, so the JSX stays as it is.
 */
export function PillTrays({ open, className = "", children, ...rest }: { open: boolean; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  useLayoutEffect(() => {
    openRef.current = open;
  });

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The row's items: its own children, and the pills of a `contents` row inside it.
    const items = () => [...box.querySelectorAll<HTMLElement>(":scope > *, :scope > .contents > *")];
    const reset = () => {
      for (const el of items()) el.style.order = "";
    };
    const place = () => {
      if (!openRef.current) return;
      const isTray = (el: Element) => !!el.closest("[data-pill-tray]");
      const lit = [...box.querySelectorAll<HTMLElement>('[aria-expanded="true"]')].filter((el) => !isTray(el));
      const pill = lit[lit.length - 1];
      if (!pill) return;
      reset();
      // The flex item that holds the open pill (the pill itself, or a full-width fold of more pills).
      let item: HTMLElement | null = pill;
      while (item && item.parentElement !== box) {
        const up: HTMLElement | null = item.parentElement;
        // A `contents` row isn't a box of its own: its pills are the items.
        if (up && up !== box && getComputedStyle(up).display === "contents" && up.parentElement === box) break;
        item = up;
      }
      if (!item) return;
      const line = item.getBoundingClientRect().top;
      for (const el of items()) {
        if (el.matches("[data-pill-tray]")) el.style.order = "1";
        else if (getComputedStyle(el).display !== "contents" && el.getBoundingClientRect().top > line + 4) el.style.order = "2";
      }
      const p = pill.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      box.style.setProperty("--tray-x", `${Math.round(p.left + p.width / 2 - b.left)}px`);
    };
    if (open) place();
    // Closing: the tray slides shut where it is, then the pills settle back.
    else timer = setTimeout(reset, 360);
    let width = box.clientWidth;
    const ro = new ResizeObserver(() => {
      if (box.clientWidth === width) return;
      width = box.clientWidth;
      place();
    });
    ro.observe(box);
    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
    };
  });

  return (
    <div ref={ref} className={`pill-trays flex flex-wrap items-center gap-1.5 ${className}`} {...rest}>
      {children}
    </div>
  );
}
