"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { addToTopOfTodayAction, listTakeoffQuestsAction, logEnergyAction } from "@/app/actions";
import { BoltIcon } from "@/components/ui/Icons";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { useEscape } from "@/lib/use-escape";

type Takeoff = Awaited<ReturnType<typeof listTakeoffQuestsAction>>[number];

const LOW = 5;

/**
 * Energy check-in under the boss line: drag 1–10 in half steps and save it
 * to the energy log. At 5 or below, a Power-ups button offers light quests
 * to drop straight onto the top of Today's Quests.
 */
export function EnergyCheck({ today }: { /** Today's latest check-in, if any. */ today: number | null }) {
  const [value, setValue] = useState(today ?? 6);
  const [saved, setSaved] = useState<number | null>(today);
  const [editing, setEditing] = useState(saved === null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        const entry = await logEnergyAction(value);
        setSaved(entry.level);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  const shown = editing ? value : (saved ?? value);
  const low = shown <= LOW;
  const hue = Math.round(((shown - 1) / 9) * 110); // red → green

  return (
    <div className="mx-auto flex w-full max-w-[420px] items-center gap-2 px-1">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {editing ? (
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--t-cream)" }}>
              Energy
            </span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              aria-label="Energy level, 1 to 10"
              className="energy-range min-w-0 flex-1"
              style={{ "--energy-pct": `${((value - 1) / 9) * 100}%`, "--energy-color": `hsl(${hue} 60% 48%)` } as React.CSSProperties}
            />
            <span className="w-8 shrink-0 text-right font-display text-[18px] tabular-nums" style={{ color: `hsl(${hue} 70% 68%)` }}>
              {value % 1 ? value.toFixed(1) : value}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={isSaving}
              className="hover-glow h-8 shrink-0 rounded-full px-3 text-[13px] font-bold disabled:opacity-60"
              style={{ background: "var(--t-gold)", color: "#2a1c10" }}
            >
              {isSaving ? "…" : "Save"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[13.5px]" style={{ color: "var(--t-cream)" }}>
            <span>
              Energy <b className="font-display text-[17px] tabular-nums" style={{ color: `hsl(${hue} 70% 68%)` }}>{saved! % 1 ? saved!.toFixed(1) : saved}</b>
              <span style={{ opacity: 0.7 }}>/10 saved</span>
            </span>
            <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-2" style={{ color: "var(--t-gold)" }}>
              Check in again
            </button>
          </div>
        )}
        {error && (
          <span className="text-[12.5px] font-semibold" style={{ color: "#f3b39f" }}>
            {error}
          </span>
        )}
      </div>
      {low && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="hover-glow flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-bold"
          style={{ background: "rgba(14,18,10,.5)", border: "1px solid var(--t-gold)", color: "var(--t-gold)" }}
          title="Light quests to get going"
        >
          <BoltIcon size={16} /> Power-ups
        </button>
      )}
      {picking && <TakeoffSheet onClose={() => setPicking(false)} />}
    </div>
  );
}

/** Power-ups and light quests, each with "Add to today" (to the top of Today's Quests). */
function TakeoffSheet({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  const [rows, setRows] = useState<Takeoff[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  useEffect(() => {
    listTakeoffQuestsAction()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        setError(e instanceof Error ? e.message : "Couldn't load them.");
      });
  }, []);

  function add(id: string) {
    setError(null);
    setAdded((s) => new Set(s).add(id));
    startTransition(async () => {
      try {
        await addToTopOfTodayAction(id);
      } catch (e) {
        setAdded((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        setError(e instanceof Error ? e.message : "Couldn't add it.");
      }
    });
  }

  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[52] flex items-end justify-center sm:items-center sm:p-4" style={{ background: "var(--t-overlay)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Power-ups"
        onClick={(e) => e.stopPropagation()}
        className="create-sheet-in parchment parchment-framed flex max-h-[80svh] w-full max-w-md flex-col gap-2 rounded-t-3xl p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-3xl"
        style={{ color: "var(--t-ink)" }}
      >
        <div className="relative z-[1] flex items-center gap-2">
          <BoltIcon size={22} />
          <h3 className="font-display m-0 flex-1 text-[20px]">Power-ups to get going</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>
        <p className="relative z-[1] m-0 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
          Low energy is fine. Pick one small win; it goes to the top of Today&apos;s Quests.
        </p>
        <ul className="relative z-[1] m-0 flex min-h-0 list-none flex-col overflow-y-auto p-0">
          {rows === null && <li className="py-3 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>Loading…</li>}
          {rows?.length === 0 && !error && <li className="py-3 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>No light quests yet. Mark quick ones as power-ups in the quest editor.</li>}
          {rows?.map((t) => {
            const art = (t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? t.icon_key : null;
            const isAdded = added.has(t.id) || t.is_manual_priority;
            return (
              <li key={t.id} className="flex min-h-14 items-center gap-3 border-t py-2 first:border-t-0" style={{ borderColor: "rgba(139,112,64,.3)" }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ border: "2px solid #8a6c2c", background: "#f3e6c8" }}>
                  {art ? (
                    // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                    <img src={art} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <QuestMonogram id={t.id} title={t.title} size={40} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15.5px] font-semibold leading-snug">
                    {t.is_power_up && <span aria-hidden className="mr-1">⚡</span>}
                    {t.title}
                  </span>
                  <span className="block text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                    {[t.estimate_minutes != null ? `${t.estimate_minutes}m` : null, `+${t.xp_value} XP`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={isAdded}
                  onClick={() => add(t.id)}
                  className="h-9 shrink-0 rounded-full px-3 text-[13px] font-bold disabled:opacity-70"
                  style={isAdded ? { color: "var(--t-ink-soft)" } : { background: "var(--t-gold)", color: "#2a1c10" }}
                >
                  {isAdded ? "Added ✓" : "Add to today"}
                </button>
              </li>
            );
          })}
        </ul>
        {error && (
          <p className="relative z-[1] m-0 text-[13.5px] font-semibold" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
