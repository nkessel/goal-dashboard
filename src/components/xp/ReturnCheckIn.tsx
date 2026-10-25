"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EnergyCheck } from "./EnergyCheck";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { readStyle, useToucanStyle } from "@/lib/toucan-style-store";
import { voice } from "@/lib/toucan-style";
import { useEscape } from "@/lib/use-escape";

const AWAY_MS = 5 * 3_600_000;
const SHOWN_KEY = "checkin-popup-at";

/**
 * Back after five hours or more since your last check-in: a check-in pops up
 * (or, if you'd rather not have pop-ups, the toucan offers one). Once per
 * return; it won't ask again for another five hours.
 */
export function ReturnCheckIn({ lastAt, metrics, notesToday }: { lastAt: string | null; metrics: string[]; notesToday: { id: string; body: string; at?: string }[] }) {
  const style = useToucanStyle();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    if (!style.returnCheckIn) return;
    const t = setTimeout(() => {
      const now = Date.now();
      if (lastAt && now - Date.parse(lastAt) < AWAY_MS) return;
      try {
        if (now - Number(window.localStorage.getItem(SHOWN_KEY) || 0) < AWAY_MS) return;
        window.localStorage.setItem(SHOWN_KEY, String(now));
      } catch {
        return;
      }
      const st = readStyle();
      if (st.avoid.includes("popups")) {
        // No surprise pop-ups: the toucan asks, and the check-in opens only if you say so.
        const unseen = window.dispatchEvent(new CustomEvent("toucan-nudge", { cancelable: true, detail: { text: voice.welcomeBack(st), actions: [{ label: "Check in", run: () => setOpen(true) }, { label: "Later", run: () => {} }] } }));
        if (!unseen) return;
      }
      setOpen(true);
    }, 400);
    return () => clearTimeout(t);
  }, [lastAt, style.returnCheckIn]);

  useEscape(() => setOpen(false), open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[66] flex items-end justify-center bg-black/55 p-3 sm:items-center" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Check in"
        onClick={(e) => e.stopPropagation()}
        className="card-pop-in flex max-h-[88vh] w-full max-w-[520px] flex-col gap-2.5 overflow-y-auto rounded-3xl px-4 pb-4 pt-3.5"
        style={{ background: "linear-gradient(180deg, rgba(28,24,16,.98), rgba(18,16,11,.98))", border: "1.5px solid rgba(217,180,95,.5)", boxShadow: "0 14px 36px rgba(0,0,0,.55)" }}
      >
        <div className="flex items-center gap-2.5">
          <ToucanArt size={40} />
          <p className="m-0 flex-1 text-[16px] font-semibold leading-snug" style={{ color: "#f1ead2" }}>
            {thanks ? "Thank you. Noted." : voice.welcomeBack(style)}
          </p>
          <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-full px-3 text-[13.5px]" style={{ color: "rgba(241,234,210,.75)" }}>
            Not now
          </button>
        </div>
        <EnergyCheck
          full
          today={null}
          metrics={metrics}
          notesToday={notesToday}
          onSaved={() => {
            setThanks(true);
            router.refresh();
            setTimeout(() => setOpen(false), 900);
          }}
        />
      </div>
    </div>,
    document.body
  );
}
