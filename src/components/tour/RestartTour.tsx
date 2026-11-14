"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restartTour } from "@/lib/tour-store";

/** Settings › Help: walk through the app again from the start. */
export function RestartTour() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  return (
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
  );
}
