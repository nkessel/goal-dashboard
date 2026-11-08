"use client";

import { useEffect, useState } from "react";
import { EnergyCheck } from "./EnergyCheck";
import { TrackingChart } from "@/components/insights/TrackingChart";
import { checkInChartAction } from "@/app/actions";
import { Fold } from "@/components/ui/Fold";
import { CheckinIcon } from "./CheckinIcon";
import { FX_DEFAULTS, checkinIconOf, checkinStyleOf, loadFx, type FxSettings } from "@/lib/celebration-fx";
import { CloseIcon } from "@/components/ui/Icons";

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
  // Already checked in today: no past check-in on show (owner, Nov 3), just a button that opens the chart, and logging another.
  if (props.today != null) return <CheckedIn props={props} fx={fx} />;
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
            <CloseIcon size={10} />
          </button>
        </div>
      </Fold>
    </div>
  );
}

type ChartData = Awaited<ReturnType<typeof checkInChartAction>>;

function CheckedIn({ props, fx }: { props: React.ComponentProps<typeof EnergyCheck>; fx: FxSettings }) {
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const [data, setData] = useState<ChartData | null>(null);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) setLogging(false);
    if (next && !data) checkInChartAction().then(setData).catch(() => setData({ metrics: [], readings: [], wins: [] }));
  };
  const when = props.todayAt ? new Date(props.todayAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-center">
        <button type="button" onClick={toggle} aria-expanded={open} className="font-display hover-glow flex h-10 items-center gap-1.5 rounded-full px-5 text-[16px]" style={checkinStyleOf(fx).style}>
          <CheckinIcon icon={checkinIconOf(fx)} /> Check-ins{when ? <span className="text-[13px] opacity-80">· ✓ {when}</span> : null}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="ml-0.5 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <Fold open={open}>
        <div className="flex flex-col gap-2">
          <div className="parchment parchment-framed relative flex min-h-[120px] flex-col gap-2 rounded-2xl px-3 py-3" style={{ borderRadius: 16 }}>
            {data ? <TrackingChart metrics={data.metrics} readings={data.readings} wins={data.wins} /> : <p className="relative z-[1] m-0 py-6 text-center text-[13px] italic" style={{ color: "#6b5631" }}>Opening…</p>}
          </div>
          {!logging ? (
            <div className="flex justify-center">
              <button type="button" onClick={() => setLogging(true)} className="h-9 rounded-full px-4 text-[14px] font-semibold" style={{ border: "1px solid rgba(217,180,95,.6)", color: "var(--t-cream)" }}>
                + Log a check-in now
              </button>
            </div>
          ) : (
            <EnergyCheck {...props} today={null} todayAt={null} />
          )}
        </div>
      </Fold>
    </div>
  );
}
