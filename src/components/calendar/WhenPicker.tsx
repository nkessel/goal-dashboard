"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { schedulerContextAction } from "@/app/actions";
import { habitBlocksOn } from "@/lib/timed-habits";
import { freeStretch } from "@/lib/auto-schedule";

type Busy = { start: number; end: number; title?: string; habit?: boolean };
export type PickedSlot = { start: string; end: string };

const PX15 = 13; // px per 15 minutes on the timeline: an hour is 52px
const DAYS = 7;

const hm = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?([AaPp])\.?\s?[Mm]\.?$/, (_, p: string) => p.toLowerCase());
const dayStartOf = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/**
 * Pick a time by seeing the day (owner: "the schedule button still doesn't show the calendar options
 * in a visual in-context way, pls fix app-wide"; asked 3+ times). Day chips across the top, the day's
 * hours below with what's already there (your calendars, quests, timed habits), and a gold block for
 * this quest: tap anywhere to put it there, nudge it by 15 minutes, or take one of the first free spots.
 */
export function WhenPicker({ minutes, title, isAdventure, initial, placing, onPick }: { minutes: number; title: string; isAdventure: boolean; initial?: string | null; placing?: boolean; onPick: (slot: PickedSlot) => void }) {
  const len = Math.max(15, Math.round(minutes / 15) * 15) * 60_000;
  const [now] = useState(() => Date.now());
  const today = useMemo(() => dayStartOf(new Date(now)), [now]);
  const [busy, setBusy] = useState<Busy[] | null>(null);
  const [range, setRange] = useState({ from: 7 * 60, to: 22 * 60 });
  const [error, setError] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(() => {
    if (!initial) return 0;
    const i = Math.round((dayStartOf(new Date(initial)).getTime() - today.getTime()) / 86_400_000);
    return i >= 0 && i < DAYS ? i : 0;
  });
  const [pick, setPick] = useState<number | null>(() => (initial ? Date.parse(initial) : null));

  useEffect(() => {
    let live = true;
    const to = new Date(today);
    to.setDate(to.getDate() + DAYS + 1);
    schedulerContextAction(new Date(now).toISOString(), to.toISOString())
      .then((ctx) => {
        if (!live) return;
        const list: Busy[] = [...ctx.busy];
        for (let i = 0; i < DAYS; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          for (const b of habitBlocksOn(ctx.habits ?? [], d, ctx.busy)) list.push({ start: b.start, end: b.end, title: b.habit.title, habit: true });
        }
        setBusy(list);
        const s = (ctx.settings ?? {}) as { dayStart?: number; dayEnd?: number };
        if (typeof s.dayStart === "number" && typeof s.dayEnd === "number" && s.dayEnd > s.dayStart) setRange({ from: Math.min(s.dayStart, 7 * 60), to: Math.max(s.dayEnd, 21 * 60) });
      })
      .catch((e) => live && (setBusy([]), setError(e instanceof Error ? e.message : "Couldn't read your calendar.")));
    return () => {
      live = false;
    };
  }, [now, today]);

  const day = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + dayIdx);
    return d;
  }, [today, dayIdx]);
  const t0 = day.getTime() + range.from * 60_000;
  const t1 = day.getTime() + range.to * 60_000;
  const height = ((range.to - range.from) / 15) * PX15;
  const yOf = (ms: number) => ((ms - t0) / 900_000) * PX15;
  const inDay = (busy ?? []).filter((b) => b.end > t0 && b.start < t1);
  const clash = pick !== null && inDay.some((b) => b.start < pick + len && b.end > pick);

  // The first free spots from now on (up to three, across the week).
  const suggestions = useMemo(() => {
    if (!busy) return [];
    const out: number[] = [];
    for (let i = 0; i < DAYS && out.length < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      let from = Math.max(now + 15 * 60_000, d.getTime() + range.from * 60_000);
      from = Math.ceil(from / 900_000) * 900_000;
      const to = d.getTime() + range.to * 60_000;
      while (out.length < 3) {
        const at = freeStretch(from, to, len / 60_000, busy);
        if (at === null) break;
        out.push(at);
        from = at + len + 60 * 60_000; // spread them out a little
      }
    }
    return out;
  }, [busy, today, now, range, len]);

  // Open on the chosen block, or the first free spot, or now.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !busy) return;
    const target = pick !== null && pick >= t0 && pick < t1 ? pick : dayIdx === 0 ? Math.max(t0, now) : (suggestions.find((s) => s >= t0 && s < t1) ?? t0 + 2 * 3600_000);
    el.scrollTo({ top: Math.max(0, yOf(target) - 60), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll when the day or the data changes, not on every pick
  }, [dayIdx, busy]);

  function tapAt(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - r.top;
    let at = t0 + Math.floor(y / PX15) * 900_000;
    at = Math.max(t0, Math.min(t1 - len, at));
    setPick(at);
  }
  const nudge = (d: number) => pick !== null && setPick(Math.max(t0, Math.min(t1 - len, pick + d * 900_000)));

  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  const gold = "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)";
  const hours: number[] = [];
  for (let m = Math.ceil(range.from / 60) * 60; m < range.to; m += 60) hours.push(m);
  const dayChip = (i: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return i === 0 ? "Today" : i === 1 ? "Tmrw" : d.toLocaleDateString(undefined, { weekday: "short" });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* First free spots, one tap each. */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-semibold" style={{ color: soft }}>
            Free:
          </span>
          {suggestions.map((s) => {
            const i = Math.round((dayStartOf(new Date(s)).getTime() - today.getTime()) / 86_400_000);
            const on = pick === s;
            return (
              <button key={s} type="button" onClick={() => (setDayIdx(i), setPick(s))} className="h-7 rounded-full px-2.5 text-[12.5px] font-semibold tabular-nums" style={on ? { background: gold, border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1px solid rgba(139,112,64,.5)", color: ink }}>
                {dayChip(i)} {hm(s)}
              </button>
            );
          })}
        </div>
      )}
      {/* The week, a chip per day. */}
      <div role="tablist" aria-label="Day" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {Array.from({ length: DAYS }, (_, i) => (
          <button key={i} type="button" role="tab" aria-selected={dayIdx === i} onClick={() => setDayIdx(i)} className="h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold" style={dayIdx === i ? { background: isAdventure ? "#2e3b26" : "var(--t-accent)", color: isAdventure ? "#f2d27e" : "#fff" } : { color: soft, border: "1px solid rgba(139,112,64,.35)" }}>
            {dayChip(i)}
          </button>
        ))}
      </div>
      {/* The day itself: tap where it should go. */}
      <div ref={scroller} className="relative max-h-[300px] overflow-y-auto overscroll-contain rounded-xl" style={{ background: isAdventure ? "rgba(255,250,238,.65)" : "var(--t-bg)", border: "1px solid rgba(139,112,64,.3)" }}>
        {busy === null ? (
          <p className="m-0 py-10 text-center text-[13.5px] italic" style={{ color: soft }}>
            Opening your day…
          </p>
        ) : (
          <div className="relative cursor-pointer select-none" style={{ height }} onClick={tapAt} aria-label={`Your ${dayChip(dayIdx)}: tap a time to put "${title}" there`}>
            {hours.map((m) => (
              <div key={m} className="pointer-events-none absolute inset-x-0 flex items-start" style={{ top: ((m - range.from) / 15) * PX15 }}>
                <span className="w-10 shrink-0 -translate-y-[7px] pr-1 text-right text-[10.5px] tabular-nums" style={{ color: soft }}>
                  {hm(day.getTime() + m * 60_000).replace(":00", "")}
                </span>
                <span className="h-px flex-1" style={{ background: "rgba(139,112,64,.18)" }} />
              </div>
            ))}
            {/* Before now on today: quietly greyed. */}
            {dayIdx === 0 && now > t0 && <div className="pointer-events-none absolute left-10 right-0 top-0" style={{ height: Math.min(height, yOf(now)), background: "repeating-linear-gradient(135deg, rgba(90,80,60,.06) 0 6px, transparent 6px 12px)" }} />}
            {inDay.map((b, i) => (
              <div
                key={i}
                className="pointer-events-none absolute left-11 right-1 overflow-hidden rounded-md px-1.5 text-[11px] leading-tight"
                style={{ top: Math.max(0, yOf(b.start)), height: Math.max(10, yOf(Math.min(b.end, t1)) - Math.max(0, yOf(b.start)) - 1), background: b.habit ? "rgba(92,138,70,.18)" : "rgba(90,80,60,.2)", border: b.habit ? "1px dashed rgba(63,106,44,.6)" : "1px solid rgba(90,80,60,.25)", color: "#3d3628" }}
                title={`${b.title ?? "Busy"} · ${hm(b.start)}–${hm(b.end)}`}
              >
                {b.title ?? "Busy"}
              </div>
            ))}
            {pick !== null && pick >= t0 && pick < t1 && (
              <div className="reveal pointer-events-none absolute left-11 right-1 z-[1] flex items-center overflow-hidden rounded-md px-2 text-[12px] font-bold" style={{ top: yOf(pick), height: Math.max(14, yOf(pick + len) - yOf(pick)), background: gold, border: `1.5px solid ${clash ? "#a3412a" : "#4a3913"}`, color: "#2a1c10", boxShadow: "0 2px 6px rgba(0,0,0,.25)" }}>
                <span className="truncate">
                  {hm(pick)}–{hm(pick + len)} · {title}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      {error && (
        <p className="m-0 text-[12.5px]" style={{ color: "var(--t-warn)" }}>
          {error} (the times shown are from the app alone)
        </p>
      )}
      <div className="flex items-center gap-1.5">
        {pick !== null ? (
          <>
            <button type="button" onClick={() => nudge(-1)} aria-label="15 minutes earlier" className="flex h-8 w-8 items-center justify-center rounded-full" style={{ border: "1px solid rgba(139,112,64,.5)", color: ink }}>
              ‹
            </button>
            <span className="min-w-0 flex-1 text-center text-[13px] font-semibold tabular-nums" style={{ color: clash ? "var(--t-warn)" : ink }}>
              {dayChip(dayIdx)} {hm(pick)}–{hm(pick + len)}
              {clash ? " · overlaps" : ""}
            </span>
            <button type="button" onClick={() => nudge(1)} aria-label="15 minutes later" className="flex h-8 w-8 items-center justify-center rounded-full" style={{ border: "1px solid rgba(139,112,64,.5)", color: ink }}>
              ›
            </button>
          </>
        ) : (
          <span className="flex-1 text-[13px] italic" style={{ color: soft }}>
            Tap a time, or pick a free spot above.
          </span>
        )}
        <button type="button" disabled={pick === null || placing} data-submit onClick={() => pick !== null && onPick({ start: new Date(pick).toISOString(), end: new Date(pick + len).toISOString() })} className="h-9 shrink-0 rounded-full px-4 text-[14px] font-bold disabled:opacity-50" style={{ background: gold, border: "1.5px solid #4a3913", color: "#2a1c10" }}>
          {placing ? "Placing…" : "Place it ✓"}
        </button>
      </div>
    </div>
  );
}
