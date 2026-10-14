"use client";

import { useState, useTransition } from "react";
import { completeRiteAction, uncompleteRiteAction } from "@/app/actions";
import { GoldRule, Leaf } from "@/components/ui/Ornaments";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { RiteEditorDialog } from "./RiteEditorDialog";
import { Moon } from "./BeginEveningButton";
import { useFlipToEvening } from "./DayNightFlip";
import { useLocalDay } from "./evening-clock";
import { TomorrowQuests } from "./TomorrowQuests";
import type { Task } from "@/lib/data/types";

/** Client-side copy of a rite (the data module is server-only). */
export type RiteView = {
  id: string;
  title: string;
  description: string | null;
  is_core: boolean;
  xp_value: number;
};

/** A moon-and-check seal: empty ring until the rite is done tonight. */
function RiteSeal({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full"
      style={{
        background: done ? "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)" : "radial-gradient(circle at 35% 30%, rgba(255,255,255,.6), rgba(214,220,240,.25))",
        border: `2px solid ${done ? "#5a4520" : "#8e8aa8"}`,
        boxShadow: done ? "0 0 14px rgba(242,210,126,.65), inset 0 1px 0 rgba(255,255,255,.5)" : "inset 0 1px 3px rgba(0,0,0,.15)",
      }}
    >
      {done ? (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="qc-card-check">
          <path d="M4.5 12.8 L9.6 17.9 L19.6 6.6" stroke="#2a1c10" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <Moon size={24} />
      )}
    </span>
  );
}

/**
 * The evening side of Today's Quest. Non-negotiable rites sit where Today's
 * Battle does by day; Additional Mini-Quests are below, and any of them can be
 * promoted. Each rite earns its XP once per night.
 */
export function EveningRites({
  rites,
  completions,
  theme,
  tomorrow = null,
  openQuests = [],
}: {
  /** Null when the rites tables haven't been created yet. */
  rites: RiteView[] | null;
  completions: { rite_id: string; day: string }[];
  theme: "calm" | "adventure";
  /** Quests already planned for tomorrow (null before that database update). */
  tomorrow?: (Task & { categoryLabel?: string | null })[] | null;
  /** Open quests to plan tomorrow from. */
  openQuests?: (Task & { categoryLabel?: string | null })[];
}) {
  const flip = useFlipToEvening();
  const day = useLocalDay();
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<RiteView | { new: true; core: boolean } | null>(null);
  const [miniOpen, setMiniOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const doneTonight = (id: string) =>
    optimistic[id] ?? completions.some((c) => c.rite_id === id && c.day === day);
  const core = (rites ?? []).filter((r) => r.is_core);
  const mini = (rites ?? []).filter((r) => !r.is_core);
  const coreDone = core.filter((r) => doneTonight(r.id)).length;
  const allDone = core.length > 0 && coreDone === core.length;

  function toggle(r: RiteView) {
    if (!day) return;
    const next = !doneTonight(r.id);
    setError(null);
    setOptimistic((o) => ({ ...o, [r.id]: next }));
    startTransition(async () => {
      try {
        if (next) await completeRiteAction(r.id, day);
        else await uncompleteRiteAction(r.id, day);
      } catch (e) {
        setOptimistic((o) => ({ ...o, [r.id]: !next }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  function card(r: RiteView) {
    const done = doneTonight(r.id);
    return (
      <li key={r.id} className={`parchment moonlit relative flex items-center gap-3 rounded-2xl px-3 py-3 ${done ? "rite-done" : ""}`} style={{ borderRadius: 16 }}>
        <button type="button" onClick={() => toggle(r)} aria-pressed={done} aria-label={done ? `Undo ${r.title}` : `Complete ${r.title}`} className="relative z-[1] rounded-full">
          <RiteSeal done={done} />
        </button>
        <button type="button" onClick={() => setEditing(r)} title="Edit rite" className="relative z-[1] min-w-0 flex-1 text-left">
          <span className="block break-words text-[18px] font-semibold leading-tight" style={{ color: "var(--t-ink)", textDecoration: done ? "line-through" : undefined, textDecorationColor: "rgba(80,60,20,.45)" }}>
            {r.title}
          </span>
          {r.description && (
            <span className="mt-0.5 block break-words text-[14px] leading-snug" style={{ color: "#4d4535" }}>
              {r.description}
            </span>
          )}
        </button>
        <span className="relative z-[1] flex shrink-0 flex-col items-end gap-1">
          <span className="text-[18px] font-bold leading-none" style={{ color: "var(--t-xp)" }}>
            +{r.xp_value} XP
          </span>
        </span>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header, where Today's Battle sits by day */}
      <div className="flex flex-col items-center gap-1.5 pt-1 text-center">
        <div className="flex w-full items-center gap-2">
          <span className="h-8 w-8 shrink-0" aria-hidden />
          <span className="hidden flex-1 sm:flex">
            <GoldRule dir="left" />
          </span>
          <span className="flex-1 sm:hidden" />
          <Leaf flip />
          <h2 className="font-display m-0 whitespace-nowrap text-[23px] leading-none sm:text-[27px]" style={{ color: "#f1ead2", textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>
            Evening Rites
            <span className="ml-2 align-middle text-[14px] font-normal" style={{ color: "var(--t-gold)" }}>
              {coreDone}/{core.length}
            </span>
          </h2>
          <Leaf />
          <span className="hidden flex-1 sm:flex">
            <GoldRule dir="right" />
          </span>
          <span className="flex-1 sm:hidden" />
          <button
            type="button"
            onClick={() => setEditing({ new: true, core: true })}
            aria-label="Add a rite"
            title="Add a rite"
            className="hover-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="#2a1c10" strokeWidth="2.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="m-0 text-[15px]" style={{ color: "#d9d2bd", opacity: 0.85 }}>
          The non-negotiables, before the day is done.
        </p>
      </div>

      {rites === null ? (
        <p className="parchment moonlit rounded-2xl p-5 text-center text-[16px]" style={{ color: "var(--t-ink)" }}>
          The evening rites need a quick database update before they can be saved. Once it&apos;s run, your rites appear here.
        </p>
      ) : (
        <>
          {error && (
            <p className="rounded-lg px-3 py-2 text-center text-[14.5px] font-semibold" style={{ background: "var(--t-warn-bg)", color: "var(--t-warn)" }}>
              {error}
            </p>
          )}

          <ul className="flex flex-col gap-3">{core.map(card)}</ul>

          {allDone && (
            <div className="rest-well flex items-center justify-center gap-2.5 rounded-2xl px-5 py-3 text-center text-[18px]" style={{ color: "#f8e3a0" }}>
              ✨ <span className="font-display">All rites complete — rest well.</span>
            </div>
          )}

          <TomorrowQuests queued={tomorrow} candidates={openQuests} theme={theme} />

          {/* Additional Mini-Quests */}
          <section>
            <button
              type="button"
              onClick={() => setMiniOpen((v) => !v)}
              aria-expanded={miniOpen}
              className="hover-glow evening-bar relative flex min-h-[58px] w-full items-center justify-center rounded-2xl px-4 py-2.5"
            >
              <span className="font-display flex items-center gap-3 text-[21px]" style={{ color: "#f1ead2" }}>
                <Moon size={26} />
                Additional Mini-Quests
                <span className="text-[15px] font-normal" style={{ color: "var(--t-gold)" }}>
                  {mini.length}
                </span>
              </span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="absolute right-5 transition-transform" style={{ transform: miniOpen ? "rotate(180deg)" : undefined }}>
                <path d="M5.5 9l6.5 6.5L18.5 9" stroke="#f1ead2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {miniOpen && (
              <div className="mt-3 flex flex-col gap-3">
                <ul className="flex flex-col gap-3">{mini.map(card)}</ul>
                <button
                  type="button"
                  onClick={() => setEditing({ new: true, core: false })}
                  className="hover-glow flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-[16px]"
                  style={{ borderColor: "rgba(217,180,95,.45)", background: "rgba(8,10,26,.3)", color: "#f1ead2" }}
                >
                  <span className="text-xl leading-none" style={{ color: "var(--t-gold)" }}>
                    +
                  </span>
                  Add a mini-quest
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <button
        type="button"
        onClick={() => flip(false)}
        className="hover-glow day-cta flex min-h-[54px] w-full items-center justify-center gap-3 rounded-2xl px-5 text-[19px]"
      >
        <span aria-hidden className="text-[22px]">
          ☀
        </span>
        <span className="font-display">Return to the day</span>
      </button>

      <AddTaskForm theme={theme} initial="rite" />

      {editing && (
        <RiteEditorDialog
          rite={"new" in editing ? undefined : editing}
          defaultCore={"new" in editing ? editing.core : true}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
