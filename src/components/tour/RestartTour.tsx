"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restartTour } from "@/lib/tour-store";
import { TOUR_LOOKS, setTourLook, useTourLook } from "@/lib/tour-look";

/** Settings › Help: walk through the app again from the start, and choose how the guide's cards look. */
export function RestartTour() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const look = useTourLook();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => {
          restartTour();
          setDone(true);
          router.push("/");
        }}
        className="qe-fact h-9 self-start rounded-full px-4 text-[13.5px] font-semibold"
      >
        {done ? "✓ Starting…" : "✦ Take the walkthrough again"}
      </button>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="The guide's look">
        <span className="mr-1 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
          The guide&apos;s look
        </span>
        {TOUR_LOOKS.map((l) => (
          <button
            key={l.key}
            type="button"
            role="radio"
            aria-checked={look === l.key}
            title={l.hint}
            onClick={() => setTourLook(l.key)}
            className="qe-fact h-8 rounded-full px-3 text-[13px] font-semibold"
            data-open={look === l.key ? "true" : undefined}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
