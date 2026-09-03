"use client";

import { useEffect, useState, useTransition } from "react";
import { setTaskIconAction } from "@/app/actions";
import { MONSTER_ICONS } from "@/lib/monster-icons";

type EmojiEntry = { emoji: string; keywords: string[] };

export function IconPicker({
  taskId,
  currentIcon,
  currentSource,
}: {
  taskId: string;
  currentIcon: string | null;
  currentSource: "monster" | "library";
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"monsters" | "search">("monsters");
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<EmojiEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (tab === "search" && !library) {
      // Lazy-loaded so the ~250KB keyword dataset only ships to whoever
      // actually opens the search tab, not every Priority-view visitor.
      import("emojilib").then((mod) => {
        const raw = (mod.default ?? mod) as Record<string, string[]>;
        setLibrary(Object.entries(raw).map(([emoji, keywords]) => ({ emoji, keywords })));
      });
    }
  }, [tab, library]);

  function pick(iconKey: string | null, iconSource: "monster" | "library") {
    startTransition(async () => {
      await setTaskIconAction(taskId, iconKey, iconSource);
      setOpen(false);
    });
  }

  const currentEmoji =
    currentSource === "monster"
      ? MONSTER_ICONS.find((m) => m.key === currentIcon)?.emoji
      : currentIcon;

  const results =
    library && query.trim()
      ? library.filter((e) => e.keywords.some((k) => k.includes(query.trim().toLowerCase()))).slice(0, 30)
      : [];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Choose a monster icon"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-zinc-300 text-sm hover:border-zinc-400 dark:border-zinc-700"
      >
        {currentEmoji || "➕"}
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-20 w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-2 flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setTab("monsters")}
              className={`rounded-full px-2 py-1 ${tab === "monsters" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500"}`}
            >
              Monsters
            </button>
            <button
              type="button"
              onClick={() => setTab("search")}
              className={`rounded-full px-2 py-1 ${tab === "search" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500"}`}
            >
              Search any icon
            </button>
            {currentIcon && (
              <button
                type="button"
                onClick={() => pick(null, "monster")}
                disabled={isPending}
                className="ml-auto text-zinc-400 hover:text-red-600"
              >
                Clear
              </button>
            )}
          </div>

          {tab === "monsters" ? (
            <div className="grid grid-cols-6 gap-1">
              {MONSTER_ICONS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  title={m.label}
                  disabled={isPending}
                  onClick={() => pick(m.key, "monster")}
                  className="flex h-8 w-8 items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {m.emoji}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. chicken, fire, trophy…"
                className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
              />
              {!library && <p className="text-xs text-zinc-400">Loading icon library…</p>}
              {library && query.trim() && (
                <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto">
                  {results.map((e) => (
                    <button
                      key={e.emoji}
                      type="button"
                      title={e.keywords[0]}
                      disabled={isPending}
                      onClick={() => pick(e.emoji, "library")}
                      className="flex h-8 w-8 items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      {e.emoji}
                    </button>
                  ))}
                  {results.length === 0 && <p className="col-span-6 text-xs text-zinc-400">No matches</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
