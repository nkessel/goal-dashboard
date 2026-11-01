"use client";

import { useEffect, useState } from "react";
import { EnergyCheck } from "./EnergyCheck";
import { Fold } from "@/components/ui/Fold";
import { CheckinIcon } from "./CheckinIcon";
import { FX_DEFAULTS, checkinIconOf, checkinStyleOf, loadFx, type FxSettings } from "@/lib/celebration-fx";

/**
 * Today's check-in: a gilded Check in button that opens into the check-in
 * when tapped. Once you've checked in today, what you checked in with shows.
 */
export function TodayCheckIn(props: React.ComponentProps<typeof EnergyCheck>) {
  const [open, setOpen] = useState(false);
  const [fx, setFx] = useState<FxSettings>(FX_DEFAULTS);
  // The button's look lives in this browser's settings.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setFx(loadFx()), []);
  if (props.today != null) return <EnergyCheck {...props} />;
  // The button folds away as the check-in slides open (nothing below jumps).
  return (
    <div className="flex flex-col">
      <Fold open={!open}>
        <div className="flex justify-center">
          <button type="button" onClick={() => setOpen(true)} className="font-display hover-glow flex h-10 items-center gap-1.5 rounded-full px-5 text-[16px]" style={checkinStyleOf(fx).style}>
            <CheckinIcon icon={checkinIconOf(fx)} /> Check in
          </button>
        </div>
      </Fold>
      <Fold open={open}>
        <div className="relative">
          <EnergyCheck {...props} />
          {/* Not now: fold it back into the button. */}
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the check-in" title="Close" className="absolute -top-2 right-0 z-[2] flex h-7 w-7 items-center justify-center rounded-full text-[16px] leading-none" style={{ background: "rgba(20,26,19,.85)", border: "1px solid rgba(217,180,95,.6)", color: "var(--t-gold)" }}>
            ×
          </button>
        </div>
      </Fold>
    </div>
  );
}
