"use client";

import { useState, useTransition } from "react";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { CoinIcon } from "@/components/ui/Icons";
import { buyToucanAddonAction, equipToucanAction } from "@/app/actions";
import { TOUCAN_ADDONS, TOUCAN_SLOTS, announceToucan, cleanToucan, type ToucanAddon, type ToucanSlot, type ToucanState } from "@/lib/toucan";

/**
 * The toucan spirit's wardrobe: a live preview, then one row per slot
 * (headwear, eyewear, pendant, aura, bill). Owned add-ons can be worn or
 * taken off for free; the rest cost coins — a tap shows the price, a second
 * tap buys it. Trying one on previews it before you buy.
 */
export function ToucanWorkshop({ initial, coins: startCoins }: { initial: unknown; coins: number }) {
  const [state, setState] = useState<ToucanState>(() => cleanToucan(initial));
  const [coins, setCoins] = useState(startCoins);
  const [slot, setSlot] = useState<ToucanSlot>("head");
  const [trying, setTrying] = useState<ToucanAddon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flying, setFlying] = useState(false);
  const [pending, start] = useTransition();

  const preview = trying ? { ...state.equipped, [trying.slot]: trying.id } : state.equipped;
  const items = TOUCAN_ADDONS.filter((a) => a.slot === slot);
  const worn = state.equipped[slot] ?? null;

  function apply(next: ToucanState) {
    setState(next);
    announceToucan(next);
  }
  function wear(a: ToucanAddon | null) {
    const before = state;
    const next: ToucanState = { ...state, equipped: { ...state.equipped } };
    if (a) next.equipped[a.slot] = a.id;
    else delete next.equipped[slot];
    setError(null);
    setTrying(null);
    apply(next);
    start(async () => {
      try {
        apply(await equipToucanAction(slot, a ? a.id : null));
      } catch (e) {
        apply(before);
        setError(e instanceof Error ? e.message : "Couldn't change that.");
      }
    });
  }
  function buy(a: ToucanAddon) {
    setError(null);
    start(async () => {
      try {
        const res = await buyToucanAddonAction(a.id);
        apply(res.state);
        setCoins(res.coins);
        setTrying(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't buy that.");
      }
    });
  }

  const gold = { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", color: "#2a1c10", border: "1.5px solid #8a6116" };

  return (
    <div className="flex flex-col gap-3">
      {/* Preview */}
      <div className="relative flex flex-col items-center overflow-hidden rounded-2xl pb-3 pt-10" style={{ background: "radial-gradient(circle at 50% 40%, #1d2a3a, #0b0f18 75%)", border: "1.5px solid rgba(217,180,95,.45)" }}>
        <div className="toucan-preview" style={{ transform: "scale(2.2)", transformOrigin: "50% 100%", marginTop: 96 }}>
          <ToucanArt equipped={preview} flying={flying} />
        </div>
        <div className="mt-6 flex items-center gap-3 text-[13px]" style={{ color: "#e9dcb8" }}>
          <span className="flex items-center gap-1 font-semibold">
            <CoinIcon size={15} /> {coins.toLocaleString()} coins
          </span>
          <button type="button" onClick={() => setFlying((f) => !f)} className="rounded-full px-2.5 py-1 underline-offset-2 hover:underline" style={{ color: "#f2d27e" }}>
            {flying ? "Perch" : "Fly"}
          </button>
        </div>
        {trying && !state.owned.includes(trying.id) && (
          <p className="fade-in m-0 mt-1 px-3 text-center text-[12.5px] italic" style={{ color: "rgba(233,220,184,.8)" }}>
            Trying on: {trying.name}
          </p>
        )}
      </div>

      {/* Slots */}
      <div role="tablist" aria-label="Add-on slots" className="flex flex-wrap gap-1.5">
        {TOUCAN_SLOTS.map((s) => (
          <button
            key={s.slot}
            type="button"
            role="tab"
            aria-selected={slot === s.slot}
            onClick={() => {
              setSlot(s.slot);
              setTrying(null);
            }}
            className="h-8 rounded-full px-3 text-[13px] font-semibold"
            style={slot === s.slot ? gold : { border: "1px solid rgba(139,112,64,.4)", color: "var(--t-ink)" }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        <li>
          <button
            type="button"
            onClick={() => wear(null)}
            disabled={!worn || pending}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14.5px] disabled:opacity-60"
            style={{ background: !worn ? "rgba(217,180,95,.25)" : "rgba(70,50,20,.06)", color: "var(--t-ink)" }}
          >
            <span className="flex-1">None</span>
            {!worn && <span className="text-[12.5px] font-semibold">Wearing</span>}
          </button>
        </li>
        {items.map((a) => {
          const owned = state.owned.includes(a.id);
          const on = worn === a.id;
          const isTrying = trying?.id === a.id;
          const short = coins < a.price;
          return (
            <li key={a.id}>
              <div className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-1.5" style={{ background: on ? "rgba(217,180,95,.25)" : isTrying ? "rgba(126,240,220,.14)" : "rgba(70,50,20,.06)" }}>
                <button type="button" onClick={() => (owned ? wear(a) : setTrying(isTrying ? null : a))} className="min-w-0 flex-1 text-left" style={{ color: "var(--t-ink)" }}>
                  <span className="block text-[14.5px] font-semibold">{a.name}</span>
                  <span className="block text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                    {a.blurb}
                  </span>
                </button>
                {owned ? (
                  on ? (
                    <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
                      Wearing
                    </span>
                  ) : (
                    <button type="button" onClick={() => wear(a)} disabled={pending} className="h-8 shrink-0 rounded-full px-3 text-[13px] font-bold" style={gold}>
                      Wear
                    </button>
                  )
                ) : isTrying ? (
                  <button
                    type="button"
                    onClick={() => buy(a)}
                    disabled={pending || short}
                    title={short ? `You need ${a.price - coins} more coins` : undefined}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-bold disabled:opacity-50"
                    style={gold}
                  >
                    {short ? "Not enough" : pending ? "…" : <>Buy · <CoinIcon size={13} /> {a.price.toLocaleString()}</>}
                  </button>
                ) : (
                  <button type="button" onClick={() => setTrying(a)} className="flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink)" }}>
                    <CoinIcon size={13} /> {a.price.toLocaleString()}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="m-0 text-[13.5px] font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <p className="m-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
        Tap a price to try it on, then Buy. Hold the owl to summon the spirit; it shows in the Adventure theme.
      </p>
    </div>
  );
}
