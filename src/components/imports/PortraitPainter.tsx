"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { generateNextImportIconAction } from "@/app/actions";

/**
 * Paints any imported quest/reward portraits that are still missing, one at a
 * time in the background, then refreshes so they appear. Renders nothing.
 */
export function PortraitPainter({ missing }: { missing: number }) {
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    if (missing <= 0 || running.current) return;
    running.current = true;
    (async () => {
      let painted = 0;
      for (let i = 0; i < missing + 2; i++) {
        try {
          const res = await generateNextImportIconAction();
          if (res.done) break;
          painted++;
        } catch {
          break;
        }
      }
      running.current = false;
      if (painted > 0) router.refresh();
    })();
  }, [missing, router]);

  return null;
}
