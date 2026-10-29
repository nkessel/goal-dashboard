"use client";

import { useEffect, useState } from "react";
import { EnergyCheck } from "./EnergyCheck";
import { FX_DEFAULTS, checkinLabelOf, checkinStyleOf, loadFx, type FxSettings } from "@/lib/celebration-fx";

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
  if (open || props.today != null) return <EnergyCheck {...props} />;
  const label = checkinLabelOf(fx);
  return (
    <div className="flex justify-center">
      <button type="button" onClick={() => setOpen(true)} className="font-display hover-glow flex h-10 items-center gap-1.5 rounded-full px-5 text-[16px]" style={checkinStyleOf(fx).style}>
        <span aria-hidden>{label.icon}</span> {label.text}
      </button>
    </div>
  );
}
