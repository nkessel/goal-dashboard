"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { saveCheckInAction } from "@/app/actions";
import { DateField } from "@/components/ui/DateField";
import { useEscape } from "@/lib/use-escape";
import { TrackingChart } from "./TrackingChart";

type Reading = { metric: string; level: number; at: string };
type WinLite = { kind: string; at: string; xp: number; title?: string; icon?: string | null };

const DAY = 86_400_000;
const INK = "#3b2a14";
const INK_SOFT = "#6b5631";
const noop = () => () => {};
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Readings saved together (within a few minutes) make one check-in. */
function groupCheckIns(readings: Reading[]): { at: string; items: Reading[] }[] {
  const sorted = [...readings].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const out: { at: string; items: Reading[] }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && new Date(last.items[last.items.length - 1].at).getTime() - new Date(r.at).getTime() < 3 * 60_000 && !last.items.some((x) => x.metric === r.metric)) last.items.push(r);
    else out.push({ at: r.at, items: [r] });
  }
  return out;
}

/**
 * Under the fresh check-in at the top of Insights: every check-in from today
 * (newest first), then the tracking chart, with + to add an entry to it.
 */
export function CheckInHub({ readings, metrics, wins }: { readings: Reading[]; metrics: string[]; wins: WinLite[] }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [adding, setAdding] = useState(false);
  const today = mounted ? dayKey(new Date()) : null;
  const todays = today ? groupCheckIns(readings.filter((r) => dayKey(new Date(r.at)) === today)) : [];
  const order = (m: string) => {
    const i = metrics.indexOf(m);
    return i < 0 ? 99 : i;
  };

  return (
    <div className="flex flex-col gap-3">
      {todays.length > 0 && (
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-1.5">
          <h3 className="m-0 text-[12.5px] font-bold uppercase tracking-wide" style={{ color: "rgba(239,230,204,.7)" }}>
            Today&rsquo;s check-ins · {todays.length}
          </h3>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {todays.map((c) => (
              <li key={c.at} className="flex items-start gap-2.5 rounded-xl px-3 py-1.5" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(217,180,95,.3)" }}>
                <span className="w-[62px] shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums" style={{ color: "#f2d27e" }}>
                  {new Date(c.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 text-[13.5px]" style={{ color: "var(--t-cream)" }}>
                  {[...c.items]
                    .sort((a, b) => order(a.metric) - order(b.metric))
                    .map((r) => (
                      <span key={r.metric} className="whitespace-nowrap">
                        {r.metric} <b className="tabular-nums">{(Math.round(r.level * 10) / 10).toFixed(1)}</b>
                      </span>
                    ))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="parchment parchment-framed relative flex flex-col gap-2 rounded-2xl px-3 py-3" style={{ borderRadius: 16 }}>
        <TrackingChart metrics={metrics} readings={readings} wins={wins} onAdd={() => setAdding(true)} />
      </div>
      {adding && <AddEntry metrics={metrics} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Add a reading to the chart for any moment in the last three months. */
function AddEntry({ metrics, onClose }: { metrics: string[]; onClose: () => void }) {
  const router = useRouter();
  const now = new Date();
  const [day, setDay] = useState(dayKey(now));
  const [time, setTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [vals, setVals] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEscape(onClose, true);
  const min = dayKey(new Date(now.getTime() - 91 * DAY));
  const any = Object.keys(vals).length > 0;

  function save() {
    setError(null);
    const [y, m, d] = day.split("-").map(Number);
    const [hh, mm] = (time || "12:00").split(":").map(Number);
    const at = new Date(y, m - 1, d, hh || 0, mm || 0);
    if (at.getTime() > Date.now() + 60_000) return setError("Pick a time that has already happened.");
    const energy = vals.Energy ?? null;
    const rest = Object.entries(vals)
      .filter(([k]) => k !== "Energy")
      .map(([metric, level]) => ({ metric, level }));
    start(async () => {
      try {
        await saveCheckInAction(energy, rest, at.toISOString());
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that.");
      }
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/45 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Add an entry"
        onClick={(e) => e.stopPropagation()}
        className="card-pop-in parchment parchment-framed relative flex max-h-[88dvh] w-full max-w-[420px] flex-col gap-3 overflow-y-auto rounded-2xl p-4"
        style={{ color: INK, border: "1.5px solid #a88a3f", boxShadow: "0 18px 40px rgba(0,0,0,.45)" }}
      >
        <h3 className="font-display relative z-[1] m-0 text-[19px]">Add an entry</h3>
        <div className="relative z-[1] flex flex-wrap items-center gap-2">
          <DateField value={day} onChange={(v) => setDay(v || dayKey(new Date()))} min={min} max={dayKey(new Date())} ariaLabel="Day" className="h-9 rounded-lg border px-2.5 text-[14.5px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)" }} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" className="h-9 rounded-lg border px-2.5 text-[14.5px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: INK }} />
        </div>
        <ul className="relative z-[1] m-0 flex list-none flex-col gap-1 p-0">
          {metrics.map((m) => {
            const v = vals[m];
            return (
              <li key={m} className="flex min-h-10 items-center gap-2.5">
                <span className="w-[96px] shrink-0 truncate text-[14px] font-semibold">{m}</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={v ?? 5.5}
                  onChange={(e) => setVals((x) => ({ ...x, [m]: Number(e.target.value) }))}
                  aria-label={m}
                  className="gilded-range min-w-0 flex-1"
                  style={{ "--p": `${(((v ?? 5.5) - 1) / 9) * 100}%`, opacity: v === undefined ? 0.5 : 1 } as React.CSSProperties}
                />
                <span className="w-9 shrink-0 text-right text-[14px] font-bold tabular-nums" style={{ color: v === undefined ? INK_SOFT : INK }}>
                  {v === undefined ? "—" : v.toFixed(1)}
                </span>
                {v !== undefined && (
                  <button
                    type="button"
                    onClick={() =>
                      setVals((x) => {
                        const n = { ...x };
                        delete n[m];
                        return n;
                      })
                    }
                    aria-label={`Leave ${m} out`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[16px] leading-none hover:bg-black/[.06]"
                    style={{ color: INK_SOFT }}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="relative z-[1] m-0 text-[12.5px]" style={{ color: INK_SOFT }}>
          Slide only what you want to log; the rest stays out.
        </p>
        {error && (
          <p role="alert" className="relative z-[1] m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        <div className="relative z-[1] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-full px-4 text-[14px] font-semibold" style={{ border: "1px solid #b39a6a" }}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!any || pending} className="h-9 rounded-full px-4 text-[14px] font-bold disabled:opacity-50" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
            {pending ? "Adding…" : "Add to the chart"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
