"use client";

import { useEffect, useState } from "react";

/**
 * A fold that slides open and closed (the app's drawer), for any in-flow part
 * that used to appear with `{open && …}` and vanish at once. Its contents
 * mount on first open and stay, so closing animates too.
 */
export function Fold({ open, children, className = "", innerClassName = "" }: { open: boolean; children: React.ReactNode; className?: string; innerClassName?: string }) {
  const [seen, setSeen] = useState(open);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount the contents the first time it opens, then keep them so it can slide closed
  useEffect(() => void (open && !seen && setSeen(true)), [open, seen]);
  return (
    <div className={`drawer-body fold ${className}`} data-open={open ? "true" : "false"}>
      <div className={`drawer-inner ${innerClassName}`} inert={!open}>
        {(seen || open) && children}
      </div>
    </div>
  );
}

/**
 * Keeps a popup on screen a moment after it closes so it can fade out.
 * `shown` says whether to render it; `leaving` is true while it plays its exit
 * (use `card-pop-out` / `overlay-fade-out` then).
 */
export function useLinger(open: boolean, ms = 180) {
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- show at once when it opens
      setShown(true);
      return;
    }
    const t = setTimeout(() => setShown(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { shown: open || shown, leaving: !open && shown };
}
