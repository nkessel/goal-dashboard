"use client";

import { useEffect, useState } from "react";
import { EnergyCheck } from "./EnergyCheck";
import { Fold } from "@/components/ui/Fold";
import { CheckinIcon } from "./CheckinIcon";
import { FX_DEFAULTS, checkinIconOf, checkinStyleOf, loadFx, type FxSettings } from "@/lib/celebration-fx";

/** After a check-in the button rests a while before it's offered again (owner, Nov 25: "at least 15m"). */
const REST_MS = 15 * 60_000;
const REST_KEY = "today-checkin-rest-until";

function readRest(): number {
  try {
    return Number(window.localStorage.getItem(REST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/**
 * Today's check-in: a gilded Check in button that opens the check-in under it
 * and closes it again (owner, Nov 25: the button stays while the drawer is out).
 * Once you've checked in it goes away for 15 minutes. No chart here: that's on
 * Insights (owner, Nov 25).
 */
export function TodayCheckIn(props: React.ComponentProps<typeof EnergyCheck>) {
  const [open, setOpen] = useState(false);
  const [fx, setFx] = useState<FxSettings>(FX_DEFAULTS);
  const [now, setNow] = useState(0);
  const [restUntil, setRestUntil] = useState(0);
  const [justSaved, setJustSaved] = useState(false);
  // The button's look and the rest after a check-in live in this browser.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser settings are only readable after hydration */
    setFx(loadFx());
    setRestUntil(readRest());
    setNow(Date.now());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const lastAt = props.todayAt ? new Date(props.todayAt).getTime() : 0;
  const until = Math.max(restUntil, lastAt ? lastAt + REST_MS : 0);
  const resting = now > 0 && now < until;
  // Back once the rest is over.
  useEffect(() => {
    if (!resting) return;
    const t = setTimeout(() => setNow(Date.now()), until - now + 500);
    return () => clearTimeout(t);
  }, [resting, until, now]);

  function onSaved() {
    const t = Date.now() + REST_MS;
    try {
      window.localStorage.setItem(REST_KEY, String(t));
    } catch {
      /* storage unavailable */
    }
    setOpen(false);
    setJustSaved(true);
    setTimeout(() => {
      setJustSaved(false);
      setRestUntil(t);
      setNow(Date.now());
    }, 2600);
    props.onSaved?.();
  }

  const when = props.todayAt ? new Date(props.todayAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
  if (justSaved)
    return (
      <p className="confirm-pop m-0 text-center text-[13px] font-semibold" style={{ color: "var(--t-gold)" }}>
        ✓ Checked in
      </p>
    );
  if (resting && !open) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-center">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-display hover-glow flex h-10 items-center gap-1.5 rounded-full px-5 text-[16px]" style={checkinStyleOf(fx).style}>
          <CheckinIcon icon={checkinIconOf(fx)} /> Check in{when ? <span className="text-[13px] opacity-80">· ✓ {when}</span> : null}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="ml-0.5 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <Fold open={open}>
        <EnergyCheck {...props} today={null} todayAt={null} onSaved={onSaved} />
      </Fold>
    </div>
  );
}
