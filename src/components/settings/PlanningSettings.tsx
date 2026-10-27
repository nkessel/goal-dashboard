"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { PLANS } from "@/lib/menu-layouts";
import { PROMPT_DEFAULT, readPromptAt, savePromptAt, setEveningMode } from "@/components/evening/evening-clock";
import { OneMenu } from "./MenuLayoutSettings";

const TIMES = [16, 17, 18, 19, 20, 21].map((h) => h * 60);
const label = (m: number) => `${m / 60 - 12}pm`;

const subscribe = (cb: () => void) => {
  window.addEventListener("evening-prompt-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("evening-prompt-change", cb);
    window.removeEventListener("storage", cb);
  };
};

/** Settings › Planning & evening: when the evening routine invites you, and the steps of each planning walk. */
export function PlanningSettings({ isAdventure, withPair }: { isAdventure: boolean; withPair: boolean }) {
  const router = useRouter();
  const at = useSyncExternalStore(subscribe, readPromptAt, () => PROMPT_DEFAULT);
  const head = isAdventure ? "font-display text-[15px]" : "text-sm font-bold";
  const chip = (on: boolean) => (on ? { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" } : { border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink)" });
  return (
    <div className="flex flex-col gap-2">
      <h4 className={`m-0 ${head}`}>Evening routine</h4>
      <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        It sits at the top of Today from this time (in place of a planning invitation), with a small &ldquo;hide&rdquo;.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {TIMES.map((m) => (
          <button key={m} type="button" aria-pressed={at === m} onClick={() => savePromptAt(m)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={chip(at === m)}>
            {label(m)}
          </button>
        ))}
        <button type="button" aria-pressed={at === "off"} onClick={() => savePromptAt("off")} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={chip(at === "off")}>
          Off
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          setEveningMode(true);
          router.push("/");
        }}
        className="self-start text-[13px] underline underline-offset-2"
        style={{ color: "var(--t-ink)" }}
      >
        Edit your evening rites →
      </button>
      <h4 className={`m-0 mt-2 ${head}`}>Planning walks</h4>
      <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        Drag steps into your order (hold on a phone); swipe one left to skip it.
      </p>
      {PLANS.filter((p) => withPair || p.id !== "plan-pair").map((p) => (
        <details key={p.id} className="rounded-xl px-3 py-2" style={{ border: "1px solid rgba(139,112,64,.3)" }}>
          <summary className={`cursor-pointer ${head}`}>{p.title}</summary>
          <p className="mb-2 mt-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
            {p.hint}
          </p>
          <OneMenu menu={p} />
        </details>
      ))}
    </div>
  );
}
