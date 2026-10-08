"use client";

import { useEffect, useState } from "react";
import { FloatingActionButton } from "./FloatingActionButton";
import { useEscape } from "@/lib/use-escape";

export type FabChoice = { key: string; label: string; icon: React.ReactNode; onPick: () => void };

/** The main + button as a small speed dial (New quest / New reward / …). */
export function FabSpeedDial({ choices, theme = "calm", label }: { choices: FabChoice[]; theme?: "calm" | "adventure"; label: string }) {
  const [open, setOpen] = useState(false);
  const isAdventure = theme === "adventure";

  useEscape(() => setOpen(false), open);

  return (
    <>
      {open && <div className="overlay-fade-in fixed inset-0 z-[39]" style={{ background: "rgba(10,8,4,.35)" }} onClick={() => setOpen(false)} />}
      {open && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[148px] z-40 mx-auto flex w-full max-w-md flex-col items-center gap-2 sm:max-w-lg">
          {choices.map((c, i) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setOpen(false);
                c.onPick();
              }}
              className={`fab-choice pointer-events-auto flex h-12 min-w-[200px] items-center gap-3 rounded-full pl-2 pr-5 text-[16px] font-semibold ${isAdventure ? "parchment" : ""}`}
              style={{
                animationDelay: `${(choices.length - 1 - i) * 40}ms`,
                ...(isAdventure ? { borderRadius: 9999 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", color: "var(--t-ink)" }),
              }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: isAdventure ? "rgba(42,28,16,.85)" : "var(--t-accent-soft)" }}>
                {c.icon}
              </span>
              {c.label}
            </button>
          ))}
        </div>
      )}
      <FloatingActionButton onClick={() => setOpen((v) => !v)} label={label} theme={theme} expanded={open} />
    </>
  );
}
