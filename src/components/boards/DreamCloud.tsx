"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BoardWithStats } from "@/lib/data/boards";
import { createDreamBoardAction } from "@/app/actions";
import { BoardGrid } from "./BoardGrid";

/** Billows along the cloud's top and bottom edges: [left %, size px]. */
const TOP_PUFFS: [number, number][] = [[3, 84], [12, 118], [22, 96], [32, 128], [42, 104], [52, 132], [62, 100], [72, 124], [81, 98], [90, 116], [97, 80]];
const BOTTOM_PUFFS: [number, number][] = [[4, 86], [14, 108], [25, 92], [36, 116], [47, 98], [58, 112], [69, 94], [80, 110], [90, 96], [97, 80]];
/** A softer, bluer row of billows behind the front ones, for depth. */
const BACK_PUFFS: [number, number][] = [[8, 96], [26, 120], [47, 110], [67, 126], [86, 104]];

const at = (left: number, size: number) => `clamp(${size / 2 + 6}px, ${left}%, calc(100% - ${size / 2 + 6}px))`;

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
    <section aria-labelledby="dreams-heading" className="dream-cloud relative mx-1 mb-10 mt-20 sm:mx-3">
      {BACK_PUFFS.map(([left, size], i) => (
        <span key={`k${i}`} aria-hidden className="dream-puff back" style={{ left: at(left, size), width: size, height: size, top: -size * 0.62, marginLeft: -size / 2, animationDelay: `${-i * 2.3}s` }} />
      ))}
      {TOP_PUFFS.map(([left, size], i) => (
        <span key={`t${i}`} aria-hidden className="dream-puff top" style={{ left: at(left, size), width: size, height: size, top: -size * 0.42, marginLeft: -size / 2 }} />
      ))}
      {BOTTOM_PUFFS.map(([left, size], i) => (
        <span key={`b${i}`} aria-hidden className="dream-puff bottom" style={{ left: at(left, size), width: size, height: size, bottom: -size * 0.3, marginLeft: -size / 2 }} />
      ))}
      <span aria-hidden className="dream-body" />
      <span aria-hidden className="dream-sparkle" style={{ left: "46%", top: 4 }}>✦</span>
      <span aria-hidden className="dream-sparkle" style={{ right: "9%", top: 26, animationDelay: "1.4s" }}>✧</span>
      <span aria-hidden className="dream-sparkle" style={{ right: "28%", bottom: 10, animationDelay: "2.6s" }}>✦</span>

      <div className="relative z-[3] flex flex-col gap-3 px-3 pb-5 pt-1 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="dreams-heading" className={`m-0 ${theme === "adventure" ? "font-display text-[24px]" : "text-[20px] font-bold"}`} style={{ color: "#3f5272" }}>
              Dreams
            </h2>
            <p className="m-0 text-[13px]" style={{ color: "#6a7d99" }}>
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
              style={{ borderColor: "rgba(120,150,190,.45)", background: "rgba(255,255,255,.85)", color: "#34465f" }}
            />
            <button type="submit" disabled={saving || !title.trim()} className="dream-btn h-10 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50">
              {saving ? "Dreaming…" : "Add"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="h-10 rounded-full px-3 text-[14px]" style={{ color: "#6a7d99" }}>
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
          <p className="m-0 rounded-2xl border border-dashed px-4 py-3 text-[14px]" style={{ borderColor: "rgba(120,150,190,.4)", color: "#6a7d99" }}>
            No dreams here yet. Add one, or move a board here from its menu (right-click, or the pencil › Dream board).
          </p>
        ) : (
          <BoardGrid boards={boards} theme={theme} dream />
        )}
      </div>
    </section>
  );
}
