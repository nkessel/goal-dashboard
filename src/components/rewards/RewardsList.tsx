"use client";

import { useState, useTransition } from "react";
import type { Reward } from "@/lib/data/types";
import { claimRewardAction, completeRewardAction, unclaimRewardAction, uncompleteRewardAction } from "@/app/actions";
import { RewardEditorDialog } from "./RewardEditorDialog";
import { CoinIcon } from "@/components/ui/Icons";

/** The Treasure Chest: rewards to buy with coins, plus what you've claimed. */
export function RewardsList({ rewards, coins, theme }: { rewards: Reward[]; coins: number; theme: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const [editing, setEditing] = useState<Reward | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const available = rewards.filter((r) => r.status === "available");
  const accepted = rewards.filter((r) => r.status === "claimed");
  const completed = rewards.filter((r) => r.status === "completed");
  const [paid, setPaid] = useState<{ id: string; text: string } | null>(null);

  function complete(r: Reward) {
    setError(null);
    setBusy(r.id);
    startTransition(async () => {
      try {
        const res = await completeRewardAction(r.id);
        const parts = [
          res.bonusXp > 0 ? `+${res.bonusXp} XP` : null,
          res.bonusCoins + res.bonusCoinsFromXp > 0 ? `+${res.bonusCoins + res.bonusCoinsFromXp} coins` : null,
        ].filter(Boolean);
        setPaid({ id: r.id, text: parts.length ? `Well done! ${parts.join(" · ")}` : "Well done!" });
        setTimeout(() => setPaid(null), 3200);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't complete that.");
      } finally {
        setBusy(null);
      }
    });
  }

  function redeem(r: Reward) {
    setError(null);
    setBusy(r.id);
    startTransition(async () => {
      try {
        await claimRewardAction(r.id, null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't redeem that.");
      } finally {
        setBusy(null);
      }
    });
  }

  const portrait = (r: Reward, size: number) => (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        border: `2px solid ${isAdventure ? "#8a6c2c" : "var(--t-card-border)"}`,
        background: isAdventure ? "radial-gradient(circle, #fff3c9, #d9b45f 70%, #8a6c2c)" : "var(--t-bg)",
        boxShadow: isAdventure ? "0 0 0 3px rgba(217,180,95,.35), 0 0 18px rgba(242,210,126,.35), 0 3px 8px rgba(0,0,0,.3)" : undefined,
      }}
    >
      {r.icon_key ? (
        // eslint-disable-next-line @next/next/no-img-element -- generated portrait
        <img src={r.icon_key} alt="" className="h-full w-full object-cover" />
      ) : (
        "🎁"
      )}
    </span>
  );

  const priceChip = (cost: number, dim = false) => (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[14px] font-semibold tabular-nums"
      style={{
        background: dim ? "rgba(107,98,82,.14)" : "rgba(42,28,16,.85)",
        color: dim ? "var(--t-ink-soft)" : "#f2d27e",
        border: dim ? "1px solid rgba(107,98,82,.3)" : "1px solid #a88a3f",
      }}
    >
      <CoinIcon size={15} />
      {cost === 0 ? "Free" : cost}
    </span>
  );

  return (
    <>
      {error && (
        <p className="rounded-lg px-3 py-2 text-center text-[14.5px] font-semibold" style={{ background: "var(--t-warn-bg)", color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {available.map((r) => {
          const cost = r.cost_coins ?? 0;
          const short = Math.max(0, cost - coins);
          return (
            <div
              key={r.id}
              className={`relative flex flex-col items-center gap-2 rounded-2xl px-4 pb-4 pt-5 text-center ${isAdventure ? "parchment parchment-framed" : ""}`}
              style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
            >
              {r.needs_review && (
                <span className="absolute right-3 top-3 z-[1] rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: "rgba(209,161,60,.3)", color: "var(--t-ink)" }}>
                  new
                </span>
              )}
              <button type="button" onClick={() => setEditing(r)} title="Edit reward" className="relative z-[1] flex flex-col items-center gap-2">
                {portrait(r, 96)}
                <span className="text-[19px] font-semibold leading-tight" style={{ color: "var(--t-ink)" }}>
                  {r.title}
                </span>
                {r.description && (
                  <span className="line-clamp-2 text-[14px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
                    {r.description}
                  </span>
                )}
              </button>
              {((r.bonus_xp ?? 0) > 0 || (r.bonus_coins ?? 0) > 0) && (
                <span className="relative z-[1] text-[13px] font-semibold" style={{ color: "var(--t-xp)" }}>
                  Complete it for{(r.bonus_xp ?? 0) > 0 ? ` +${r.bonus_xp} XP` : ""}
                  {(r.bonus_coins ?? 0) > 0 ? ` +${r.bonus_coins} coins` : ""}
                </span>
              )}
              <div className="relative z-[1] mt-1 flex items-center gap-2">
                {priceChip(cost)}
                <button
                  type="button"
                  disabled={short > 0 || busy === r.id}
                  onClick={() => redeem(r)}
                  className="hover-glow h-9 rounded-full px-4 text-[14.5px] disabled:cursor-not-allowed disabled:opacity-60"
                  style={short > 0 ? { border: "1px solid var(--t-card-border)", color: "var(--t-ink-soft)" } : { background: "var(--t-gold)", color: "#2a1c10" }}
                >
                  {busy === r.id ? "…" : short > 0 ? `Need ${short} more` : "Accept"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {available.length === 0 && (
        <p className={`rounded-2xl p-5 text-center text-[16px] italic ${isAdventure ? "parchment" : ""}`} style={{ color: "var(--t-ink-soft)" }}>
          Your chest is empty — add something to look forward to.
        </p>
      )}

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="hover-glow flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-[17px]"
        style={{
          borderColor: isAdventure ? "rgba(217,180,95,.5)" : "var(--t-card-border)",
          background: isAdventure ? "rgba(10,14,9,.25)" : undefined,
          color: isAdventure ? "var(--t-cream)" : "var(--t-ink)",
        }}
      >
        <span className="text-xl leading-none" style={{ color: "var(--t-gold)" }}>
          +
        </span>{" "}
        Add a reward
      </button>

      {accepted.length > 0 && (
        <section className={`flex flex-col rounded-2xl px-5 py-4 ${isAdventure ? "parchment parchment-framed" : ""}`} style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}>
          <h2 className="font-display relative z-[1] m-0 text-[20px]" style={{ color: "var(--t-ink)" }}>
            Accepted
          </h2>
          <p className="relative z-[1] m-0 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
            Mark each one complete once you&apos;ve actually done it.
          </p>
          <ul className="relative z-[1] mt-1 flex flex-col">
            {accepted.map((r, i) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 py-2.5"
                style={i === 0 ? undefined : { borderTop: `1px solid ${isAdventure ? "rgba(139,112,64,.32)" : "var(--t-card-border)"}` }}
              >
                {portrait(r, 48)}
                <span className="min-w-0 flex-1">
                  <span className="block text-[16.5px] leading-snug" style={{ color: "var(--t-ink)" }}>
                    {r.title}
                  </span>
                  <span className="block text-[13px]" style={{ color: paid?.id === r.id ? "var(--t-xp)" : "var(--t-ink-soft)", fontWeight: paid?.id === r.id ? 600 : 400 }}>
                    {paid?.id === r.id
                      ? paid.text
                      : `Accepted ${r.claimed_at ? new Date(r.claimed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}${
                          (r.bonus_xp ?? 0) > 0 || (r.bonus_coins ?? 0) > 0
                            ? ` · completing gives${(r.bonus_xp ?? 0) > 0 ? ` +${r.bonus_xp} XP` : ""}${(r.bonus_coins ?? 0) > 0 ? ` +${r.bonus_coins} coins` : ""}`
                            : ""
                        }`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startTransition(() => unclaimRewardAction(r.id))}
                    className="text-[13px] underline"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    Put back{(r.coins_spent ?? 0) > 0 ? ` (+${r.coins_spent})` : ""}
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => complete(r)}
                    className="hover-glow h-9 rounded-full px-4 text-[14.5px] disabled:opacity-60"
                    style={{ background: "var(--t-gold)", color: "#2a1c10" }}
                  >
                    {busy === r.id ? "…" : "✓ Complete"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {completed.length > 0 && (
        <section className={`flex flex-col rounded-2xl px-5 py-4 ${isAdventure ? "parchment parchment-framed" : ""}`} style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}>
          <h2 className="font-display relative z-[1] m-0 text-[20px]" style={{ color: "var(--t-ink)" }}>
            Completed
          </h2>
          <ul className="relative z-[1] flex flex-col">
            {completed.map((r, i) => (
              <li
                key={r.id}
                className="flex items-center gap-3 py-2.5"
                style={i === 0 ? undefined : { borderTop: `1px solid ${isAdventure ? "rgba(139,112,64,.32)" : "var(--t-card-border)"}` }}
              >
                {portrait(r, 40)}
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] leading-snug" style={{ color: "var(--t-ink)" }}>
                    ✓ {r.title}
                  </span>
                  <span className="block text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                    Done {r.completed_at ? new Date(r.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => startTransition(() => uncompleteRewardAction(r.id))}
                  className="shrink-0 text-[13px] underline"
                  style={{ color: "var(--t-ink-soft)" }}
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <RewardEditorDialog reward={editing === "new" ? undefined : editing} theme={theme} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
