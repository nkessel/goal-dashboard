"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Reward } from "@/lib/data/types";
import { createRewardAction, deleteRewardAction, updateRewardAction } from "@/app/actions";
import { IconPicker } from "@/components/tasks/IconPicker";
import { CoinIcon, DiamondIcon } from "@/components/ui/Icons";

const PRICE_PRESETS = [0, 5, 10, 25, 50, 100];

/** Create or edit a reward: portrait, name, an optional note, and its price in coins. */
export function RewardEditorDialog({
  reward,
  theme = "adventure",
  onClose,
  onSaved,
  review,
}: {
  /** Omit to create a new reward. */
  reward?: Reward;
  theme?: "calm" | "adventure";
  onClose: () => void;
  onSaved?: () => void;
  review?: { index: number; total: number; onLater: () => void };
}) {
  const isAdventure = theme === "adventure";
  const [title, setTitle] = useState(reward?.title ?? "");
  const [description, setDescription] = useState(reward?.description ?? "");
  const [icon, setIcon] = useState<string | null>(reward?.icon_key ?? null);
  // Portrait finished generating while this was open: show it.
  const [seenIcon, setSeenIcon] = useState(reward?.icon_key ?? null);
  if ((reward?.icon_key ?? null) !== seenIcon) {
    setSeenIcon(reward?.icon_key ?? null);
    if (!icon) setIcon(reward?.icon_key ?? null);
  }
  const [price, setPrice] = useState<number>(reward?.cost_coins ?? 10);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [closing, setClosing] = useState(false);

  const fieldStyle: React.CSSProperties = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };

  function close() {
    setClosing(true);
    setTimeout(onClose, 180);
  }

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        if (reward) {
          await updateRewardAction(reward.id, { title, description, iconKey: icon, costCoins: price, confirmImport: Boolean(review) });
        } else {
          await createRewardAction({ title, description, iconKey: icon, costCoins: price });
        }
        if (onSaved) onSaved();
        else close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function remove() {
    if (!reward) return;
    startSaving(async () => {
      try {
        await deleteRewardAction(reward.id);
        if (onSaved) onSaved();
        else close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete.");
      }
    });
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${closing ? "overlay-fade-out" : "overlay-fade-in"}`}
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={reward ? "Edit reward" : "New reward"}
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-md flex-col gap-3 rounded-2xl p-4 parchment parchment-framed shadow-2xl ${closing ? "sheet-minimize-out" : "sheet-slide-up-in"}`}
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `2px solid ${isAdventure ? "var(--t-gold)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className={`flex items-center gap-2 ${isAdventure ? "font-display text-lg" : "text-lg font-bold"}`}>
            <DiamondIcon size={22} />
            {review ? `Review import ${review.index} of ${review.total}` : reward ? "Edit reward" : "New reward"}
          </h3>
          <button type="button" onClick={close} aria-label="Close" className="h-8 w-8 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <IconPicker
              currentIcon={icon}
              currentSource={icon ? "library" : "monster"}
              taskTitle={title}
              theme={theme}
              size={72}
              emptyContent={<span className="text-3xl">🎁</span>}
              showEditHint
              artStyle="treasure"
              onDraftChange={(url) => setIcon(url)}
            />
            <span className="text-[10.5px]" style={{ color: "var(--t-ink-soft)" }}>
              Portrait
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the reward?"
              aria-label="Reward"
              autoFocus={!reward}
              className="h-10 rounded-lg border px-2.5 text-[15px] font-semibold"
              style={fieldStyle}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Notes (optional) — where to get it, budget…"
              aria-label="Notes"
              className="resize-none rounded-lg border px-2.5 py-1.5 text-[13.5px]"
              style={fieldStyle}
            />
          </div>
        </div>

        {/* Price in coins */}
        <div
          className="flex flex-col gap-2.5 rounded-xl px-3.5 py-3"
          style={{
            background: isAdventure ? "linear-gradient(180deg, rgba(48,38,18,.9), rgba(30,24,12,.92))" : "var(--t-bg)",
            border: `1.5px solid ${isAdventure ? "#a88a3f" : "var(--t-card-border)"}`,
            boxShadow: isAdventure ? "inset 0 1px 0 rgba(255,235,180,.15), inset 0 -6px 12px rgba(0,0,0,.3)" : undefined,
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-semibold" style={{ color: isAdventure ? "#f3e7cb" : "var(--t-ink)" }}>
              Price
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Lower price"
                onClick={() => setPrice((p) => Math.max(0, p - (p > 50 ? 10 : p > 10 ? 5 : 1)))}
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold leading-none"
                style={{ background: "rgba(255,235,180,.12)", color: "#f2d27e", border: "1px solid rgba(217,180,95,.45)" }}
              >
                −
              </button>
              <label
                className="flex h-10 items-center gap-1.5 rounded-full px-3"
                style={{ background: "rgba(0,0,0,.35)", border: "1.5px solid #d9b45f" }}
              >
                <CoinIcon size={20} />
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  aria-label="Price in coins"
                  className="price-input w-12 bg-transparent text-center text-[19px] font-bold tabular-nums outline-none"
                  style={{ color: "#f8e3a0" }}
                />
              </label>
              <button
                type="button"
                aria-label="Raise price"
                onClick={() => setPrice((p) => p + (p >= 50 ? 10 : p >= 10 ? 5 : 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold leading-none"
                style={{ background: "rgba(255,235,180,.12)", color: "#f2d27e", border: "1px solid rgba(217,180,95,.45)" }}
              >
                +
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRICE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrice(p)}
                className="h-8 rounded-full px-3 text-[13.5px] font-semibold tabular-nums"
                style={
                  price === p
                    ? { background: "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1px solid #5a4520" }
                    : { background: "rgba(255,235,180,.08)", color: "#e9dcb8", border: "1px solid rgba(217,180,95,.35)" }
                }
              >
                {p === 0 ? "Free" : p}
              </button>
            ))}
          </div>
          <p className="m-0 text-[13px]" style={{ color: isAdventure ? "rgba(243,231,203,.75)" : "var(--t-ink-soft)" }}>
            {price === 0
              ? "Free — claim it any time you finish a quest."
              : `About ${(price * 10).toLocaleString("en-US")} XP of quests (you earn 1 coin per 10 XP).`}
          </p>
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {reward ? (
            !confirmingDelete ? (
              <button type="button" onClick={() => setConfirmingDelete(true)} className="text-sm underline" style={{ color: "var(--t-warn)" }}>
                Delete reward
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={remove}
                  disabled={isSaving}
                  className="rounded-full px-3 py-1.5 font-semibold disabled:opacity-50"
                  style={{ background: "var(--t-warn)", color: "#fff" }}
                >
                  Yes, delete
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} style={{ color: "var(--t-ink-soft)" }}>
                  Keep
                </button>
              </div>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {review ? (
              <button type="button" onClick={review.onLater} className="h-10 rounded-full px-3 text-[14px]" style={{ color: "var(--t-ink-soft)" }}>
                Save the rest for later
              </button>
            ) : (
              <button type="button" onClick={close} className="h-10 rounded-full px-4 text-[15px]" style={{ color: "var(--t-ink-soft)" }}>
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={isSaving || !title.trim()}
              className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold disabled:opacity-50"
              style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
            >
              {isSaving ? "Saving…" : review ? "Confirm" : reward ? "Save" : "Add reward"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
