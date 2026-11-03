"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { countTodayWithoutArtAction, paintNextTodayArtAction } from "@/app/actions";

/**
 * "Paint pictures": today's quests and your daily habits that have no picture
 * get one, one at a time, so every card on the calendar looks like a storybook
 * card (owner, Nov 3). Shown in the calendar's Display settings.
 */
export function PaintTodayArt() {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    countTodayWithoutArtAction().then(setLeft, () => setLeft(0));
  }, []);
  async function run() {
    setError(null);
    setBusy("…");
    try {
      for (let i = 0; i < 30; i++) {
        const r = await paintNextTodayArtAction();
        setLeft(r.left);
        if (!r.painted) break;
        setBusy(r.painted);
        router.refresh();
        if (r.left <= 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't paint that one.");
    } finally {
      setBusy(null);
    }
  }
  if (!left && !busy) return null;
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5">
      <button type="button" onClick={run} disabled={!!busy} className="hover-glow flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold disabled:opacity-70" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}>
        🎨 {busy ? `Painting… ${left ?? ""} to go` : `Paint pictures for ${left} without one`}
      </button>
      {busy && busy !== "…" && (
        <span className="truncate text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
          Just painted: {busy}
        </span>
      )}
      {error && (
        <span className="text-[12px]" style={{ color: "var(--t-warn)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
