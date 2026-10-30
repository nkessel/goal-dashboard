"use client";

import { NumberInput } from "@/components/ui/NumberInput";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Reward } from "@/lib/data/types";
import { createRewardAction, deleteRewardAction, updateRewardAction } from "@/app/actions";
import { IconPicker } from "@/components/tasks/IconPicker";
import { CoinIcon, DiamondIcon } from "@/components/ui/Icons";
import { useEscape } from "@/lib/use-escape";
import { usePortalTarget } from "@/components/ui/EmbedHost";
import { coinsForXp } from "@/lib/coins";


/** Slider position (0–100) ↔ price: 1-coin steps to 20, then 5s to 100, then 25s to 500. */
function sliderToPrice(v: number): number {
  if (v <= 40) return Math.round(v / 2);
  if (v <= 72) return 20 + Math.round((v - 40) / 2) * 5;
  return Math.min(500, 100 + Math.round((v - 72) * (400 / 28) / 25) * 25);
}
function priceToSlider(p: number): number {
  if (p <= 20) return p * 2;
  if (p <= 100) return 40 + ((p - 20) / 5) * 2;
  return Math.min(100, 72 + ((p - 100) / 400) * 28);
}

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
  useEscape(() => close());
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
  const [price, setPrice] = useState<number>(reward?.cost_coins ?? 3);
  const [prereq, setPrereq] = useState(reward?.prereq_title ?? "");
  const [prereqXp, setPrereqXp] = useState<number>(reward?.prereq_xp ?? 10);
  // Parts of the quest (its steps once accepted); an empty one at the end is the "add" field.
  const [parts, setParts] = useState<string[]>(reward?.prereq_steps ?? []);
  const setPart = (i: number, v: string) => setParts((ps) => (i >= ps.length ? [...ps, v] : ps.map((p, j) => (j === i ? v : p))));
  const dropPart = (i: number) => setParts((ps) => ps.filter((_, j) => j !== i));
  const [bonusXp, setBonusXp] = useState<number>(reward?.bonus_xp ?? 0);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [prereqOpen, setPrereqOpen] = useState(false);
  const [bonusCoins, setBonusCoins] = useState<number>(reward?.bonus_coins ?? 0);
  // Only send bonus fields once the database has them (or when they're set).
  const bonusFields = (r?: Reward) => ({
    ...(r?.bonus_xp !== undefined || bonusXp || bonusCoins ? { bonusXp, bonusCoins } : {}),
    ...(r?.prereq_xp !== undefined || prereq.trim() ? { prereqTitle: prereq, prereqXp, prereqSteps: parts.filter((p) => p.trim()) } : {}),
  });
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
          await updateRewardAction(reward.id, { title, description, iconKey: icon, costCoins: price, ...bonusFields(reward), confirmImport: Boolean(review) });
        } else {
          await createRewardAction({ title, description, iconKey: icon, costCoins: price, ...bonusFields() });
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

  const portalTarget = usePortalTarget();
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
        className={`flex max-h-[94vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl p-4 parchment parchment-framed shadow-2xl ${closing ? "sheet-minimize-out" : "sheet-slide-up-in"}`}
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `2px solid ${isAdventure ? "var(--t-gold)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
        }}
      >
        <div data-embed-hide className="flex items-center justify-between">
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
              emptyContent={<DiamondIcon size={36} />}
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

        {/* Prerequisite quest: a button until you want one. */}
        {!prereqOpen && !prereq.trim() ? (
          <button type="button" onClick={() => setPrereqOpen(true)} className="flex h-10 items-center gap-1.5 self-start rounded-full px-4 text-[14px] font-semibold" style={{ border: "1.5px solid #b39a6a", color: "var(--t-ink)", background: "rgba(255,250,238,.6)" }}>
            <span aria-hidden className="text-[16px] leading-none" style={{ color: "#8a6116" }}>+</span>
            Add a quest to do first
          </button>
        ) : (
        <div className="reveal flex flex-col gap-1.5 rounded-xl px-3.5 py-3" style={{ background: "rgba(255,250,238,.5)", border: "1.5px solid #b39a6a" }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold">First, a quest</span>
            <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
              unlocks the reward
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={prereq}
              onChange={(e) => setPrereq(e.target.value)}
              placeholder="e.g. Completely empty the car of all things"
              aria-label="Prerequisite quest"
              className="h-10 min-w-0 flex-1 rounded-lg border px-2.5 text-[14.5px]"
              style={fieldStyle}
            />
            {prereq.trim() && (
              <label className="flex h-10 shrink-0 items-center gap-1 rounded-lg border px-2" style={fieldStyle}>
                <span className="text-[12px] font-bold" style={{ color: "var(--t-xp)" }}>
                  XP
                </span>
                <NumberInput
                  min={0}
                  value={prereqXp}
                  onValueChange={setPrereqXp}
                  aria-label="Prerequisite XP"
                  className="price-input w-9 bg-transparent text-center text-[15px] font-bold tabular-nums outline-none"
                />
              </label>
            )}
          </div>
          {prereq.trim() && (
            <div className="flex flex-col gap-1 pl-1">
              {[...parts, ""].map((part, i) => (
                <div key={i} className={`flex items-center gap-1.5 ${i < parts.length ? "reveal" : ""}`}>
                  <span aria-hidden className="w-4 shrink-0 text-center text-[12px]" style={{ color: "#8a6116" }}>
                    {i < parts.length ? "◆" : "+"}
                  </span>
                  <input
                    value={part}
                    onChange={(e) => setPart(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !part && i < parts.length) {
                        e.preventDefault();
                        dropPart(i);
                      }
                    }}
                    placeholder={i < parts.length ? "" : parts.length ? "Add another part" : "Add a part (optional)"}
                    aria-label={i < parts.length ? `Part ${i + 1}` : "Add a part"}
                    className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-[13.5px]"
                    style={{ ...fieldStyle, borderStyle: i < parts.length ? "solid" : "dashed" }}
                  />
                  {i < parts.length && (
                    <button type="button" onClick={() => dropPart(i)} aria-label={`Remove part ${i + 1}`} className="flex h-8 w-6 shrink-0 items-center justify-center rounded text-[15px] opacity-50 hover:opacity-100" style={{ color: "var(--t-ink-soft)" }}>
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {prereq.trim() && (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
              Accepting puts both in Today&apos;s Quests: this quest in front (its parts as steps), the reward locked behind it until it&apos;s done.
            </p>
          )}
        </div>
        )}

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
              Reward cost
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
                <NumberInput
                  min={0}
                  value={price}
                  onValueChange={setPrice}
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
          {/* Slide to set the price: fine steps low down, bigger ones higher up. */}
          <div className="relative h-6">
            <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full" style={{ background: "#141a13", border: "1.5px solid #8a6c2c", boxShadow: "inset 0 2px 4px rgba(0,0,0,.6)" }}>
              <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${(priceToSlider(price) / 100) * 100}%`, background: "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)", boxShadow: "0 0 8px rgba(242,210,126,.5)" }} />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={priceToSlider(price)}
              onChange={(e) => setPrice(sliderToPrice(Number(e.target.value)))}
              aria-label="Price slider"
              className="progress-range absolute inset-0 w-full cursor-pointer"
            />
          </div>
          <p className="m-0 text-[13px]" style={{ color: isAdventure ? "rgba(243,231,203,.75)" : "var(--t-ink-soft)" }}>
            {price === 0
              ? "Free — yours any time you finish a quest."
              : `Buy it for ${price} coin${price === 1 ? "" : "s"} from your treasure (about ${(price * 10).toLocaleString("en-US")} XP of quests).`}
          </p>
        </div>

        {/* Completion bonus: behind a button until wanted. */}
        {!bonusOpen && !bonusXp && !bonusCoins ? (
          <button type="button" onClick={() => setBonusOpen(true)} className="flex h-10 items-center gap-1.5 self-start rounded-full px-4 text-[14px] font-semibold" style={{ border: "1.5px solid #b39a6a", color: "var(--t-ink)", background: "rgba(255,250,238,.6)" }}>
            <span aria-hidden className="text-[16px] leading-none" style={{ color: "#8a6116" }}>+</span>
            Add a completion bonus
          </button>
        ) : (
        <div className="reveal flex flex-col gap-2 rounded-xl px-3.5 py-3" style={{ background: "rgba(255,250,238,.5)", border: "1.5px solid #b39a6a" }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold">Completion bonus</span>
            <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
              paid when you complete it
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {(
              [
                { label: "XP", value: bonusXp, set: setBonusXp, step: 5, icon: <span className="text-[13px] font-bold" style={{ color: "var(--t-xp)" }}>XP</span> },
                { label: "coins", value: bonusCoins, set: setBonusCoins, step: 1, icon: <CoinIcon size={17} /> },
              ] as const
            ).map((f) => (
              <div key={f.label} className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Less bonus ${f.label}`}
                  onClick={() => f.set(Math.max(0, f.value - f.step))}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold leading-none"
                  style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}
                >
                  −
                </button>
                <label className="flex h-9 items-center gap-1.5 rounded-full px-3" style={{ background: "rgba(255,251,240,.8)", border: "1.5px solid #b39a6a" }}>
                  {f.icon}
                  <NumberInput
                    min={0}
                    value={f.value}
                    onValueChange={f.set}
                    aria-label={`Bonus ${f.label}`}
                    className="price-input w-10 bg-transparent text-center text-[16px] font-bold tabular-nums outline-none"
                    style={{ color: "var(--t-ink)" }}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`More bonus ${f.label}`}
                  onClick={() => f.set(f.value + f.step)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold leading-none"
                  style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}
                >
                  +
                </button>
              </div>
            ))}
          </div>
          {(bonusXp > 0 || bonusCoins > 0) && (
            <p className="m-0 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
              Completing it gives{bonusXp > 0 ? ` +${bonusXp} XP` : ""}
              {bonusXp > 0 && bonusCoins > 0 ? " and" : ""}
              {bonusCoins > 0 ? ` +${bonusCoins} coin${bonusCoins === 1 ? "" : "s"}` : ""}
              {bonusXp > 0 ? ` (plus ${coinsForXp(bonusXp)} from the XP)` : ""}.
            </p>
          )}
        </div>
        )}

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
              data-submit
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
    portalTarget
  );
}
