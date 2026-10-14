"use client";

import { useRouter } from "next/navigation";
import { setEveningMode } from "@/components/evening/evening-clock";
import { Moon } from "@/components/evening/BeginEveningButton";

/** Settings shortcut: flip Today to its evening side and go there. */
export function EveningRoutineTile({ isAdventure }: { isAdventure: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        setEveningMode(true);
        router.push("/");
      }}
      className={`hover-glow flex items-center gap-2.5 px-3.5 py-3 text-left ${isAdventure ? "parchment" : ""}`}
      style={isAdventure ? { borderRadius: 14 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 14 }}
    >
      <Moon size={22} />
      <span className="flex flex-col leading-tight">
        <span className="text-[16px] font-semibold" style={{ color: "var(--t-ink)" }}>
          Evening routine
        </span>
        <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
          Rites &amp; wind-down
        </span>
      </span>
    </button>
  );
}
