"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { createRiteAction, removeRiteAction, updateRiteAction } from "@/app/actions";
import type { RiteView } from "./EveningRites";
import { Moon } from "./BeginEveningButton";
import { useEscape } from "@/lib/use-escape";
import { usePortalTarget } from "@/components/ui/EmbedHost";

const XP_PRESETS = [0, 5, 10, 15, 25];

/**
 * Create or edit an evening rite (name, note, XP, whether it's non-negotiable)
 * or, with slot="day", a daily habit — the same thing on the day side.
 */
export function RiteEditorDialog({
  rite,
  defaultCore = true,
  slot = rite?.slot === "day" ? "day" : "evening",
  onClose,
}: {
  rite?: RiteView;
  defaultCore?: boolean;
  slot?: "evening" | "day";
  onClose: () => void;
}) {
  const isHabit = slot === "day";
  useEscape(() => close());
  const [title, setTitle] = useState(rite?.title ?? "");
  const [description, setDescription] = useState(rite?.description ?? "");
  const [xp, setXp] = useState(rite?.xp_value ?? 5);
  const [isCore, setIsCore] = useState(rite?.is_core ?? defaultCore);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [closing, setClosing] = useState(false);

  function close() {
    setClosing(true);
    setTimeout(onClose, 180);
  }

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        if (rite) await updateRiteAction(rite.id, { title, description, isCore: isHabit ? true : isCore, xpValue: xp });
        else await createRiteAction({ title, description, isCore: isHabit ? true : isCore, xpValue: xp, slot });
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function remove() {
    if (!rite) return;
    startSaving(async () => {
      try {
        await removeRiteAction(rite.id);
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't remove.");
      }
    });
  }

  const field = "rounded-lg border px-2.5";

  const portalTarget = usePortalTarget();
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${closing ? "overlay-fade-out" : "overlay-fade-in"}`}
      style={{ background: "rgba(6,8,22,.65)" }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rite ? "Edit rite" : "New rite"}
        onClick={(e) => e.stopPropagation()}
        className={`parchment parchment-framed ${isHabit ? "" : "moonlit"} flex w-full max-w-md flex-col gap-3 rounded-2xl p-5 shadow-2xl ${closing ? "sheet-minimize-out" : "sheet-slide-up-in"}`}
      >
        <div data-embed-hide className="relative z-[1] flex items-center justify-between">
          <h3 className="font-display flex items-center gap-2 text-lg">
            <Moon size={22} />
            {isHabit ? (rite ? "Edit habit" : "New daily habit") : rite ? "Edit rite" : isCore ? "New evening rite" : "New mini-quest"}
          </h3>
          <button type="button" onClick={close} aria-label="Close" className="h-8 w-8 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>

        <input
          autoFocus={!rite}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={isHabit ? "What's the habit? (e.g. Tell Tiffany what she's doing right)" : "What's the rite? (e.g. Lay out tomorrow's clothes)"}
          aria-label={isHabit ? "Habit" : "Rite"}
          className={`${field} relative z-[1] h-11 font-semibold`}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="A note to yourself (optional)"
          aria-label="Note"
          className={`${field} relative z-[1] resize-none py-1.5`}
        />

        <div className="relative z-[1] flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[14.5px] font-semibold">XP</span>
          {XP_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setXp(v)}
              className="h-8 min-w-9 rounded-full px-2.5 text-[13.5px] font-semibold tabular-nums"
              style={
                xp === v
                  ? { background: "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1px solid #5a4520" }
                  : { border: "1px solid #b39a6a", color: "var(--t-ink)" }
              }
            >
              {v}
            </button>
          ))}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={500}
            value={XP_PRESETS.includes(xp) ? "" : xp}
            placeholder="other"
            onChange={(e) => setXp(Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))))}
            aria-label="XP (any amount)"
            className="h-8 w-[60px] rounded-full border px-1.5 text-center text-[16px] font-semibold tabular-nums"
            style={{ borderColor: XP_PRESETS.includes(xp) ? "#b39a6a" : "#5a4520", background: XP_PRESETS.includes(xp) ? undefined : "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)" }}
          />
        </div>

        {!isHabit && (
        <label className="relative z-[1] flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5" style={{ background: "rgba(255,250,238,.5)", border: "1px solid #b39a6a" }}>
          <input
            type="checkbox"
            checked={isCore}
            onChange={(e) => setIsCore(e.target.checked)}
            className="mt-1 h-4 w-4"
            style={{ accentColor: "var(--t-gold-deep)" }}
          />
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold">Non-negotiable</span>
            <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
              Shown at the top of the evening side every night. Unchecked, it lives in Additional Mini-Quests.
            </span>
          </span>
        </label>
        )}

        {error && (
          <p className="relative z-[1] text-sm" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}

        <div className="relative z-[1] flex items-center justify-between gap-2 pt-1">
          {rite ? (
            !confirmingDelete ? (
              <button type="button" onClick={() => setConfirmingDelete(true)} className="text-sm underline" style={{ color: "var(--t-warn)" }}>
                {isHabit ? "Remove habit" : "Remove rite"}
              </button>
            ) : (
              <span className="flex items-center gap-2 text-sm">
                <button type="button" onClick={remove} disabled={isSaving} className="rounded-full px-3 py-1.5 font-semibold" style={{ background: "var(--t-warn)", color: "#fff" }}>
                  Yes, remove
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} style={{ color: "var(--t-ink-soft)" }}>
                  Keep
                </button>
              </span>
            )
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button type="button" onClick={close} className="h-10 rounded-full px-4 text-[15px]" style={{ color: "var(--t-ink-soft)" }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving || !title.trim()}
              className="hover-glow h-10 rounded-full px-5 text-[15px] disabled:opacity-50"
              style={{ background: "var(--t-gold)", color: "#2a1c10" }}
            >
              {isSaving ? "Saving…" : rite ? "Save" : isHabit ? "Add habit" : "Add rite"}
            </button>
          </span>
        </div>
      </div>
    </div>,
    portalTarget
  );
}
