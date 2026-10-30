"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { setEarlyBonusAction } from "@/app/actions";
import { useEscape } from "@/lib/use-escape";
import { useRouter } from "next/navigation";

/** A quest's early bonus: automatic (xp null), none (0), or your own XP, coins and extra XP per day early. */
export type EarlyBonus = { xp: number | null; coins: number | null; perDay: number | null };

const INK = "var(--t-ink)";
const SOFT = "var(--t-ink-soft)";

/** The choices, shared by the quest editor and the card's little popup. */
export function EarlyBonusFields({ value, onChange, chipBorder = "#b39a6a" }: { value: EarlyBonus; onChange: (v: EarlyBonus) => void; chipBorder?: string }) {
  const own = value.xp !== null && (value.xp > 0 || (value.coins ?? 0) > 0 || (value.perDay ?? 0) > 0);
  const pick = (on: boolean) => ({ border: `1px solid ${chipBorder}`, color: INK, background: on ? "rgba(217,180,95,.45)" : "rgba(255,250,235,.35)" });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => onChange({ xp: null, coins: null, perDay: null })} aria-pressed={value.xp === null} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={pick(value.xp === null)}>
          Automatic
        </button>
        <button type="button" onClick={() => onChange({ xp: 0, coins: 0, perDay: 0 })} aria-pressed={value.xp === 0 && !own} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={pick(value.xp === 0 && !own)}>
          None
        </button>
        <button type="button" onClick={() => onChange({ xp: value.xp || 10, coins: value.coins ?? 0, perDay: value.perDay ?? 0 })} aria-pressed={own} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={pick(own)}>
          My own
        </button>
      </div>
      {own && (
        <div className="reveal flex flex-col gap-1.5">
          <Stepper label="XP" value={value.xp ?? 0} step={5} onChange={(xp) => onChange({ ...value, xp })} color="var(--t-xp)" />
          <Stepper label="Coins" value={value.coins ?? 0} step={1} onChange={(coins) => onChange({ ...value, coins })} color="#8a6116" />
          <Stepper label="Each extra day early" suffix="XP" value={value.perDay ?? 0} step={1} onChange={(perDay) => onChange({ ...value, perDay })} color="var(--t-xp)" />
        </div>
      )}
      <span className="text-[12px]" style={{ color: SOFT }}>
        {value.xp === null
          ? "Automatic: half its XP when you finish 2 or more days early."
          : own
            ? `Finish before it's due: +${value.xp} XP${value.coins ? ` and ${value.coins} coins` : ""}${value.perDay ? `, plus ${value.perDay} XP for each full day early` : ""}.`
            : "No bonus for finishing early."}
      </span>
    </div>
  );
}

function Stepper({ label, value, step, onChange, color, suffix }: { label: string; value: number; step: number; onChange: (v: number) => void; color: string; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 text-[13px]" style={{ color: INK }}>
        {label}
      </span>
      <span className="flex h-8 items-center rounded-full border px-0.5" style={{ borderColor: "#c8b38a", background: "rgba(255,250,238,.7)" }}>
        <button type="button" onClick={() => onChange(Math.max(0, value - step))} aria-label={`Less: ${label}`} className="flex h-7 w-7 items-center justify-center text-[16px] leading-none" style={{ color: SOFT }}>
          −
        </button>
        <span className="min-w-[2.2em] text-center text-[14px] font-bold tabular-nums" style={{ color }}>
          {value}
          {suffix ? <span className="ml-0.5 text-[10.5px]">{suffix}</span> : null}
        </span>
        <button type="button" onClick={() => onChange(Math.min(1000, value + step))} aria-label={`More: ${label}`} className="flex h-7 w-7 items-center justify-center text-[16px] leading-none" style={{ color: SOFT }}>
          +
        </button>
      </span>
    </div>
  );
}

/** From a quest card's bonus pill: the same choices in a small popup, saved on Done. */
export function EarlyBonusPopup({ taskId, initial, onClose }: { taskId: string; initial: EarlyBonus; onClose: () => void }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const router = useRouter();
  useEscape(onClose);
  const save = () =>
    start(async () => {
      try {
        await setEarlyBonusAction(taskId, v);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "var(--t-overlay, rgba(10,8,4,.55))" }} onClick={(e) => (e.stopPropagation(), onClose())} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-label="Early-completion reward" className="card-pop-in parchment relative flex w-full max-w-[340px] flex-col gap-2.5 rounded-2xl p-4" style={{ background: "linear-gradient(180deg,#fbf3df,#f1e3c0)", border: "1.5px solid #a88a3f", boxShadow: "0 16px 40px rgba(0,0,0,.45)", color: "#2a1c10" }} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[20px] leading-none" style={{ color: SOFT }}>
          ×
        </button>
        <h3 className="m-0 font-display text-[18px]" style={{ color: "#2a1c10" }}>
          Early-completion reward
        </h3>
        <EarlyBonusFields value={v} onChange={setV} />
        {error && (
          <p role="alert" className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        <button type="button" onClick={save} disabled={saving} className="h-9 self-end rounded-full px-5 text-[14px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : "Done"}
        </button>
      </div>
    </div>,
    document.body
  );
}
