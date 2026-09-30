"use client";

import type { MouseEvent, ReactNode, CSSProperties } from "react";
import { useViewTransitionNavigate } from "./ViewTransitionProvider";

/**
 * A Link that animates the navigation with the browser's native View
 * Transitions API when available (Chrome/Edge today) — gives board-detail
 * navigation a gentle "expand into" feel — and falls back to a plain
 * router.push everywhere else. Progressive enhancement only; never breaks
 * navigation in unsupported browsers. The actual transition timing is
 * handled by ViewTransitionProvider (see its comment for why that matters).
 */
export function ViewTransitionLink({
  href,
  className,
  style,
  children,
  draggable,
  ariaLabel,
}: {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  draggable?: boolean;
  ariaLabel?: string;
}) {
  const navigate = useViewTransitionNavigate();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let opens-in-new-tab work normally
    e.preventDefault();
    navigate(href);
  }

  return (
    <a href={href} onClick={handleClick} className={className} style={style} draggable={draggable} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
