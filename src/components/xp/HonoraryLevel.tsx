"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDisplayLevelAction } from "@/app/actions";

/**
 * The level badge for someone holding an honorary level: tap it to set your
 * level anywhere from 1 to 99.
 */
export function HonoraryLevel({ level, children }: { level: number; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(level);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  function save() {
    const n = Math.max(1, Math.min(99, Math.round(value)));
    setError(null);
    startTransition(async () => {
      try {
        await setDisplayLevelAction(n);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't change it.");
      }
    });
  }
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => (setValue(level), setOpen((o) => !o))} aria-expanded={open} title="Honorary level — tap to change it (1–99)">
        {children}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Set your level"
          className="fade-in parchment absolute left-1/2 top-full z-[40] mt-2 flex w-[230px] -translate-x-1/2 flex-col gap-2 p-3"
          style={{ borderRadius: 14, border: "1.5px solid #b39a6a", boxShadow: "0 12px 28px rgba(0,0,0,.45)" }}
        >
          <p className="font-display relative z-[1] m-0 text-center text-[16px]" style={{ color: "var(--t-ink)" }}>
            Honorary level
          </p>
          <div className="relative z-[1] flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={99}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              aria-label="Level"
              className="min-w-0 flex-1"
              style={{ accentColor: "#8a6116" }}
            />
            <input
              type="number"
              min={1}
              max={99}
              value={value}
              onChange={(e) => setValue(Number(e.target.value) || 1)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              aria-label="Level number"
              className="h-9 w-14 rounded-lg border px-1.5 text-center text-[16px] font-bold tabular-nums"
              style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }}
            />
          </div>
          <p className="relative z-[1] m-0 text-center text-[12px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
            Any level up to 99. Your XP and quests carry on as usual.
          </p>
          {error && (
            <p className="relative z-[1] m-0 text-center text-[12.5px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="relative z-[1] h-9 rounded-full text-[14px] font-bold disabled:opacity-60"
            style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}
          >
            {pending ? "…" : `Become level ${Math.max(1, Math.min(99, Math.round(value)))}`}
          </button>
        </div>
      )}
    </div>
  );
}
