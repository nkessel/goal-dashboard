"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Fold } from "@/components/ui/Fold";
import { useLongPress } from "@/lib/use-long-press";
import { CloseIcon } from "@/components/ui/Icons";

const HIDE_KEY = "imports-hidden-until";
const readHidden = () => {
  try {
    return Number(window.localStorage.getItem(HIDE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
};
const tomorrowMorning = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  return d.getTime();
};

/**
 * On Today (and in Settings): things brought in, waiting to be sorted. One tap opens the cards.
 * Right-click or hold it to hide it for a while (owner, Nov 4): 30 min, until tomorrow, or other.
 */
export function ImportsWaiting({ count, hideable = false }: { count: number; /** Today's button can be hidden for a while; Settings' stays. */ hideable?: boolean }) {
  const [hiddenUntil, setHiddenUntil] = useState(0);
  const [asking, setAsking] = useState(false);
  const [other, setOther] = useState(false);
  useEffect(() => {
    if (!hideable) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- saved on this device, only readable in the browser
    setHiddenUntil(readHidden());
  }, [hideable]);
  // Back by itself once the time is up.
  useEffect(() => {
    if (!hiddenUntil) return;
    const left = hiddenUntil - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => setHiddenUntil(0), Math.min(left, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [hiddenUntil]);
  const { handlers, wasLong } = useLongPress(() => hideable && setAsking(true));
  const hideFor = (until: number) => {
    try {
      window.localStorage.setItem(HIDE_KEY, String(until));
    } catch {
      /* storage unavailable */
    }
    setAsking(false);
    setOther(false);
    setHiddenUntil(until);
  };
  // eslint-disable-next-line react-hooks/purity -- compared only to decide whether it's hidden right now
  if (count <= 0 || (hideable && hiddenUntil > Date.now())) return null;
  const chip = "h-8 rounded-full px-3 text-[13px] font-semibold";
  const chipStyle = { background: "linear-gradient(180deg,#f8ecc9,#ecd9a8)", border: "1px solid #b39a6a", color: "#2a1c10" };
  return (
    <div className="flex flex-col">
      <Link
        href="/import"
        {...(hideable ? handlers : {})}
        onClick={(e) => {
          if (hideable && wasLong()) e.preventDefault();
        }}
        className="hover-glow parchment flex items-center gap-3 rounded-2xl px-4 py-2.5 [-webkit-touch-callout:none]"
        style={{ border: "1.5px solid #a88a3f", background: "linear-gradient(180deg,#fbf3df,#f1e3c0)", color: "#2a1c10", boxShadow: "0 0 0 2px rgba(242,210,126,.35), 0 4px 12px rgba(0,0,0,.2)" }}
        title={hideable ? "Right-click or hold to hide it for a while" : undefined}
      >
        <span aria-hidden className="text-[20px]">
          📜
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-[16.5px] leading-tight">{count === 1 ? "1 item to sort" : `${count} items to sort`}</span>
          <span className="text-[12.5px]" style={{ color: "#6b5631" }}>
            One card at a time: import, snooze or skip
          </span>
        </span>
        <span aria-hidden className="text-[20px]" style={{ color: "#8a6116" }}>
          ›
        </span>
      </Link>
      {hideable && (
        <Fold open={asking}>
          <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1.5 text-[13px]" style={{ color: "var(--t-ink, #2a1c10)" }}>
            <span className="font-semibold">Hide it for</span>
            <button type="button" onClick={() => hideFor(Date.now() + 30 * 60_000)} className={chip} style={chipStyle}>
              30 min
            </button>
            <button type="button" onClick={() => hideFor(tomorrowMorning())} className={chip} style={chipStyle}>
              Until tomorrow
            </button>
            {other ? (
              <>
                <button type="button" onClick={() => hideFor(Date.now() + 2 * 3_600_000)} className={chip} style={chipStyle}>
                  2 hours
                </button>
                <button type="button" onClick={() => hideFor(Date.now() + 4 * 3_600_000)} className={chip} style={chipStyle}>
                  4 hours
                </button>
                <button type="button" onClick={() => hideFor(tomorrowMorning() + 2 * 86_400_000)} className={chip} style={chipStyle}>
                  3 days
                </button>
                <button type="button" onClick={() => hideFor(tomorrowMorning() + 6 * 86_400_000)} className={chip} style={chipStyle}>
                  A week
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setOther(true)} className={chip} style={chipStyle}>
                Other…
              </button>
            )}
            <button type="button" onClick={() => (setAsking(false), setOther(false))} aria-label="Keep it showing" className="ml-auto flex h-8 w-8 items-center justify-center text-[17px]" style={{ color: "var(--t-ink-soft, #6b5631)" }}>
              <CloseIcon size={10} />
            </button>
          </div>
        </Fold>
      )}
    </div>
  );
}
