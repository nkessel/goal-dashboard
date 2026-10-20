"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePaletteAction } from "@/app/actions";
import { PALETTES, type PaletteKey } from "@/lib/palettes";

/**
 * Colour themes for the Adventure look. Tapping one recolours the app at
 * once (so you see it straight away), then saves it to your account.
 */
export function PalettePicker({ current }: { current: PaletteKey }) {
  const router = useRouter();
  const [on, setOn] = useState<PaletteKey>(current);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function choose(key: PaletteKey) {
    setOn(key);
    setError(null);
    // Show it now: the app root and <body> both carry the colour theme.
    for (const el of [document.body, ...document.querySelectorAll<HTMLElement>('[data-theme="adventure"]')]) {
      if (key === "forest") el.removeAttribute("data-palette");
      else el.setAttribute("data-palette", key);
    }
    start(async () => {
      try {
        await savePaletteAction(key);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the colour theme.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        Colour theme: the same world, lit differently.
      </p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
        {PALETTES.map((p) => {
          const picked = on === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => choose(p.key)}
              aria-pressed={picked}
              title={p.blurb}
              className="hover-glow flex flex-col items-center gap-1 rounded-xl p-1.5"
              style={{ border: `1.5px solid ${picked ? "#8a6116" : "transparent"}`, background: picked ? "rgba(217,180,95,.3)" : "transparent" }}
            >
              <span
                aria-hidden
                className="relative flex h-12 w-full items-end justify-center overflow-hidden rounded-lg pb-1.5"
                style={{ background: `linear-gradient(180deg, ${p.sky[0]}, ${p.sky[1]})`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.25)" }}
              >
                <span className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full" style={{ background: p.accent, boxShadow: `0 0 8px ${p.accent}` }} />
                <span className="h-3 w-8 rounded-sm" style={{ background: "#eedcb8", boxShadow: "0 1px 2px rgba(0,0,0,.4)" }} />
              </span>
              <span className="text-[11.5px] font-semibold leading-tight" style={{ color: "var(--t-ink)" }}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p className="m-0 text-xs font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
