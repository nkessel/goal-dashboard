"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BoardWithStats } from "@/lib/data/boards";
import { createDreamBoardAction } from "@/app/actions";
import { BoardGrid } from "./BoardGrid";

/** Puffs along the cloud's top and bottom edges: [left %, size px]. */
const TOP_PUFFS: [number, number][] = [[3, 84], [12, 118], [22, 96], [32, 128], [42, 104], [52, 132], [62, 100], [72, 124], [81, 98], [90, 116], [97, 80]];
const BOTTOM_PUFFS: [number, number][] = [[6, 72], [18, 92], [31, 78], [44, 96], [57, 80], [70, 94], [83, 76], [94, 70]];

/**
 * The dreams cloud at the foot of the Boards page: dream boards float here,
 * under all the scrolls. Each opens like any other board; "New dream" makes
 * one straight in the cloud.
 */
export function DreamCloud({ boards, theme }: { boards: BoardWithStats[]; theme: "calm" | "adventure" }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function create() {
    if (!title.trim()) return;
    setError(null);
    startSaving(async () => {
      try {
        await createDreamBoardAction(title);
        setTitle("");
        setAdding(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't make that dream.");
      }
    });
  }

  return (
    <section aria-labelledby="dreams-heading" className="dream-cloud relative mx-1 mb-10 mt-14 sm:mx-3">
      {TOP_PUFFS.map(([left, size], i) => (
        <span key={`t${i}`} aria-hidden className="dream-puff top" style={{ left: `clamp(${size / 2 + 6}px, ${left}%, calc(100% - ${size / 2 + 6}px))`, width: size, height: size, top: -size * 0.42, marginLeft: -size / 2 }} />
      ))}
      {BOTTOM_PUFFS.map(([left, size], i) => (
        <span key={`b${i}`} aria-hidden className="dream-puff bottom" style={{ left: `clamp(${size / 2 + 6}px, ${left}%, calc(100% - ${size / 2 + 6}px))`, width: size, height: size, bottom: -size * 0.36, marginLeft: -size / 2 }} />
      ))}
      <span aria-hidden className="dream-sparkle" style={{ left: "46%", top: 6 }}>✦</span>
      <span aria-hidden className="dream-sparkle" style={{ right: "10%", top: 30, animationDelay: "1.4s" }}>✧</span>
      <span aria-hidden className="dream-sparkle" style={{ right: "26%", bottom: 14, animationDelay: "2.6s" }}>✦</span>

      <div className="relative z-[1] flex flex-col gap-3 px-3 pb-5 pt-1 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="dreams-heading" className={`m-0 ${theme === "adventure" ? "font-display text-[24px]" : "text-[20px] font-bold"}`} style={{ color: "#4a4470" }}>
              Dreams
            </h2>
            <p className="m-0 text-[13px]" style={{ color: "#6f6a92" }}>
              The someday things, kept close.
            </p>
          </div>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="dream-btn flex h-9 items-center gap-1 rounded-full px-3.5 text-[14px] font-semibold"
            >
              <span className="text-[17px] leading-none" aria-hidden>
                +
              </span>
              New dream
            </button>
          )}
        </div>

        {adding && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
              placeholder="Name your dream, e.g. Dream house"
              aria-label="Dream board name"
              className="h-10 min-w-0 flex-1 rounded-full border px-4 text-[15px]"
              style={{ borderColor: "rgba(120,110,190,.4)", background: "rgba(255,255,255,.85)", color: "#3d3760" }}
            />
            <button type="submit" disabled={saving || !title.trim()} className="dream-btn h-10 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50">
              {saving ? "Dreaming…" : "Add"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="h-10 rounded-full px-3 text-[14px]" style={{ color: "#6f6a92" }}>
              Cancel
            </button>
            {error && (
              <p className="m-0 w-full text-[13px]" style={{ color: "var(--t-warn)" }}>
                {error}
              </p>
            )}
          </form>
        )}

        {boards.length === 0 ? (
          <p className="m-0 rounded-2xl border border-dashed px-4 py-3 text-[14px]" style={{ borderColor: "rgba(120,110,190,.35)", color: "#6f6a92" }}>
            No dreams here yet. Add one, or move a board here from its menu (right-click, or the pencil › Dream board).
          </p>
        ) : (
          <BoardGrid boards={boards} theme={theme} dream />
        )}
      </div>
    </section>
  );
}
