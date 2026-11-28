"use client";

import { TimeToken } from "@/components/xp/NightFields";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { saveOrQueue } from "@/lib/offline";
import { DateField } from "@/components/ui/DateField";
import { useEscape } from "@/lib/use-escape";
import { removeCheckInAction, replaceCheckInAction, starCheckInAction } from "@/app/actions";
import { TrackingChart } from "./TrackingChart";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { useFitAboveKeyboard } from "@/lib/use-fit-above-keyboard";

type Reading = { metric: string; level: number; at: string; /** "e:<id>" (energy) or "c:<id>" (another metric), for editing it. */ key?: string };
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
const CHART_KEY = "insights-chart";
/** "open:<height>" or "shut", for the server's first picture of the chart. */
function setChartCookie(v: string) {
  document.cookie = `${CHART_KEY}=${v}; path=/; max-age=31536000; samesite=lax`;
}

export function CheckInHub({ zone, readings, metrics, wins, starred = [], nights, chartOpen, chartHeight }: { zone?: string; readings: Reading[]; metrics: string[]; wins: WinLite[]; starred?: string[]; nights?: Record<string, { bed: string | null; wake: string | null }>; /** The `insights-chart` cookie, read by the server, so the first picture is the final one; browser storage is the fallback. */ chartOpen?: boolean; /** The open chart's last height on this device (same cookie): the space it takes before the browser draws it. */ chartHeight?: number }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ at: string; items: Reading[] } | null>(null);
  const [chartPick, setChartPick] = useState<boolean | null>(null);
  const savedChart = useSyncExternalStore(noop, () => {
    try {
      return localStorage.getItem(CHART_KEY) === "open";
    } catch {
      return false;
    }
  }, () => false);
  const chart = chartPick ?? chartOpen ?? savedChart;
  const showChart = (v: boolean) => {
    setChartPick(v);
    try {
      localStorage.setItem(CHART_KEY, v ? "open" : "shut");
    } catch {}
    setChartCookie(v ? `open:${Math.round(chartBox.current?.getBoundingClientRect().height || chartHeight || 0)}` : "shut");
  };
  // The chart draws in the browser only (its dates and times are the browser's); until then its space is kept.
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const chartBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chartBox.current;
    if (!chart || !inBrowser || !el) return;
    let last = 0;
    const ro = new ResizeObserver(() => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0 && Math.abs(h - last) > 2) setChartCookie(`open:${(last = h)}`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [chart, inBrowser]);
  // A choice made before the cookie existed: copy it over, so the next load draws it on the server.
  useEffect(() => {
    if (chartOpen === undefined && savedChart) setChartCookie("open");
  }, [chartOpen, savedChart]);

  return (
    <div className="flex flex-col gap-3">
      {/* Drawn by the server too, so the page doesn't jump when it arrives (UI check, Nov 20). */}
      <CheckInLog zone={zone} readings={readings} metrics={metrics} starred={starred} onEdit={setEditing} />
      {/* The chart waits behind a plain button (owner, Nov 9): it slides open, and stays open on this device once you've chosen it. */}
      <button
        type="button"
        onClick={() => showChart(!chart)}
        aria-expanded={chart}
        className="hover-glow mx-auto flex h-10 items-center gap-2 rounded-full px-4 text-[14.5px] font-semibold"
        style={{ border: "1.5px solid var(--ec-line, rgba(217,180,95,.45))", color: "var(--t-cream)", background: chart ? "rgba(217,180,95,.18)" : "var(--ec-chip, rgba(0,0,0,.2))" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 19h16M6 15l4-5 3 3 5-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {chart ? "Hide insights chart" : "Show insights chart"}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ transform: chart ? "rotate(180deg)" : undefined, transition: "transform 220ms ease", opacity: 0.7 }}>
          <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Fold open={chart}>
        <div ref={chartBox} className="parchment parchment-framed relative flex flex-col gap-2 rounded-2xl px-3 py-3" style={{ borderRadius: 16, height: inBrowser ? undefined : (chartHeight ?? 360) }}>
          {inBrowser && <TrackingChart metrics={metrics} readings={readings} wins={wins} nights={nights} onAdd={() => setAdding(true)} />}
        </div>
      </Fold>
      {adding && <AddEntry metrics={metrics} onClose={() => setAdding(false)} />}
      {editing && <AddEntry metrics={metrics} edit={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Add a reading to the chart for any moment in the last three months. */
function AddEntry({ metrics, onClose, edit }: { metrics: string[]; onClose: () => void; /** Change this check-in instead of adding one. */ edit?: { at: string; items: Reading[] } }) {
  const router = useRouter();
  const now = new Date();
  const was = edit ? new Date(edit.at) : now;
  const [day, setDay] = useState(dayKey(was));
  const [time, setTime] = useState(`${pad(was.getHours())}:${pad(was.getMinutes())}`);
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries((edit?.items ?? []).map((r) => [r.metric, r.level])));
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
        if (edit) await replaceCheckInAction(edit.items.map((r) => r.key).filter((k): k is string => !!k), energy, rest, at.toISOString());
        else await saveOrQueue("saveCheckIn", { energy, metrics: rest, at: at.toISOString() });
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that.");
      }
    });
  }

  const kb = useFitAboveKeyboard(true);
  return createPortal(
    <div data-kb-fit data-kb-self className={`fixed inset-0 z-[85] flex justify-center bg-black/45 p-3 ${kb ? "items-start" : "items-end sm:items-center"}`} style={kb ? { top: kb.top, height: kb.height, bottom: "auto" } : undefined} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={edit ? "Change this check-in" : "Add an entry"}
        onClick={(e) => e.stopPropagation()}
        className="card-pop-in parchment parchment-framed relative flex max-h-[88dvh] w-full max-w-[420px] flex-col gap-3 overflow-y-auto rounded-2xl p-4"
        style={{ color: INK, border: "1.5px solid #a88a3f", boxShadow: "0 18px 40px rgba(0,0,0,.45)", ...(kb ? { maxHeight: kb.height - 24 } : {}) }}
      >
        <h3 className="font-display relative z-[1] m-0 text-[19px]">{edit ? "Change this check-in" : "Add an entry"}</h3>
        <div className="relative z-[1] flex flex-wrap items-center gap-2">
          <DateField value={day} onChange={(v) => setDay(v || dayKey(new Date()))} min={min} max={dayKey(new Date())} ariaLabel="Day" className="h-9 rounded-lg border px-2.5 text-[14.5px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)" }} />
          <TimeToken value={time} onChange={setTime} label="Time" kind="any" compact />
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
                    <CloseIcon size={10} />
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
            {pending ? (edit ? "Saving…" : "Adding…") : edit ? "Save changes" : "Add to the chart"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** How far back the check-in log reaches (owner, Nov 10: "a log of check-ins for today, with a drop-down for longer ranges"). */
const RANGES: { days: number; label: string }[] = [
  { days: 1, label: "Today" },
  { days: 3, label: "Last 3 days" },
  { days: 7, label: "This week" },
  { days: 30, label: "Last 30 days" },
];
const RANGE_KEY = "checkin-log-range";

/**
 * The check-ins you've logged: today by default, or a longer range from the drop-down. Each one shows its time
 * and readings as small gauges, and its ⋯ has Star, Change and Remove (archive or delete) (owner, Nov 18).
 */
function CheckInLog({ zone, readings, metrics, starred, onEdit }: { zone?: string; readings: Reading[]; metrics: string[]; starred: string[]; onEdit: (c: { at: string; items: Reading[] }) => void }) {
  const router = useRouter();
  // The range kept on this device; the server's picture (and the first one in the browser) is "Today".
  const savedDays = useSyncExternalStore(noop, () => {
    try {
      const v = Number(localStorage.getItem(RANGE_KEY));
      return RANGES.some((r) => r.days === v) ? v : 1;
    } catch {
      return 1;
    }
  }, () => 1);
  const [pickedDays, setDays] = useState<number | null>(null);
  const days = pickedDays ?? savedDays;
  // Days and times in the app's time zone, the same on the server and in the browser, so the list doesn't
  // change (and the page doesn't jump) once the browser takes over (UI check, Nov 20).
  const keyIn = (d: Date) => (zone ? new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d) : dayKey(d));
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [stars, setStars] = useState<Set<string>>(() => new Set(starred));
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const [now] = useState(() => Date.now());
  const fromKey = keyIn(new Date(now - (days - 1) * DAY));
  const groups = groupCheckIns(readings.filter((r) => keyIn(new Date(r.at)) >= fromKey)).filter((g) => !gone.has(g.at));
  const order = (m: string) => {
    const i = metrics.indexOf(m);
    return i < 0 ? 99 : i;
  };
  const keysOf = (g: { items: Reading[] }) => g.items.map((r) => r.key).filter((k): k is string => !!k);
  const isStar = (g: { items: Reading[] }) => keysOf(g).some((k) => stars.has(k));
  const label = RANGES.find((r) => r.days === days)?.label ?? "Today";
  const today = keyIn(new Date(now));
  const yesterday = keyIn(new Date(now - DAY));
  const dayWords = (iso: string) => {
    const k = keyIn(new Date(iso));
    return k === today ? "Today" : k === yesterday ? "Yesterday" : new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: zone });
  };
  const pickRange = (d: number) => {
    setDays(d);
    setPicking(false);
    try {
      localStorage.setItem(RANGE_KEY, String(d));
    } catch {}
  };
  const star = (g: { at: string; items: Reading[] }) => {
    const on = !isStar(g);
    setStars((s) => {
      const n = new Set(s);
      for (const k of keysOf(g)) {
        if (on) n.add(k);
        else n.delete(k);
      }
      return n;
    });
    start(async () => {
      await starCheckInAction(keysOf(g), on).catch(() => {});
    });
  };
  const remove = (g: { at: string; items: Reading[] }, how: "archive" | "delete") => {
    setGone((s) => new Set(s).add(g.at));
    setAsking(null);
    setMenu(null);
    start(async () => {
      await removeCheckInAction(keysOf(g), how).catch(() => {});
      router.refresh();
    });
  };
  // "Edit check-in" (under the check-in, or from Today as /insights#edit-checkin) opens the latest one to change.
  useEffect(() => {
    const open = () => {
      const latest = groupCheckIns(readings)[0];
      if (latest) onEdit(latest);
    };
    if (window.location.hash === "#edit-checkin") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      open();
    }
    window.addEventListener("checkin-edit-latest", open);
    return () => window.removeEventListener("checkin-edit-latest", open);
  }, [readings, onEdit]);
  // A day heading above the first check-in of each day (longer ranges only).
  const heads = groups.map((g, i) => (days > 1 && (i === 0 || dayWords(groups[i - 1].at) !== dayWords(g.at)) ? dayWords(g.at) : null));
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-1.5" data-checkin-log>
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-[12.5px] font-bold uppercase tracking-wide" style={{ color: "var(--ec-soft, rgba(239,230,204,.7))" }}>
          Check-ins
        </h3>
        {/* Just the words and the caret, no pill (owner, Nov 19). */}
        <button type="button" onClick={() => setPicking((p) => !p)} aria-expanded={picking} className="flex h-7 items-center gap-1 px-1 text-[12.5px] font-semibold" style={{ color: "var(--t-cream)" }}>
          {label}
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden style={{ transform: picking ? "rotate(180deg)" : undefined, transition: "transform 200ms" }}>
            <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-[12.5px] tabular-nums" style={{ color: "var(--ec-soft, rgba(239,230,204,.7))" }}>
          {groups.length || ""}
        </span>
      </div>
      <Fold open={picking}>
        <div className="flex flex-wrap gap-1.5 pb-1" role="radiogroup" aria-label="Check-ins from">
          {RANGES.map((r) => (
            <button key={r.days} type="button" role="radio" aria-checked={r.days === days} onClick={() => pickRange(r.days)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={r.days === days ? { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" } : { border: "1px solid var(--ec-line, rgba(217,180,95,.4))", color: "var(--t-cream)" }}>
              {r.label}
            </button>
          ))}
        </div>
      </Fold>
      {groups.length === 0 ? (
        <p className="m-0 text-[13px] italic" style={{ color: "var(--ec-soft, rgba(239,230,204,.7))" }}>
          {days === 1 ? "None yet today." : "None in this time."}
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {groups.map((g, gi) => {
            const head = heads[gi];
            const starredNow = isStar(g);
            return (
              <li key={g.at} className="due-in flex flex-col gap-1">
                {head && (
                  <span suppressHydrationWarning className="mt-1 text-[12px] font-semibold" style={{ color: "var(--ec-soft, rgba(239,230,204,.7))" }}>
                    {head}
                  </span>
                )}
                <div className="relative rounded-xl px-3 pb-2 pt-1.5" style={{ background: "var(--ec-chip, rgba(0,0,0,.25))", border: `1px solid ${starredNow ? "#d9b45f" : "var(--ec-line, rgba(217,180,95,.3))"}` }}>
                  <div className="flex items-center gap-2">
                    <span suppressHydrationWarning className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--ec-gold, #f2d27e)" }}>
                      {new Date(g.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone })}
                    </span>
                    {starredNow && (
                      <span aria-label="Starred" title="Starred" style={{ color: "#c99a2e" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                          <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" />
                        </svg>
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Check-in options"
                      aria-expanded={menu === g.at}
                      onClick={() => (setMenu((m) => (m === g.at ? null : g.at)), setAsking(null))}
                      onContextMenu={(e) => (e.preventDefault(), setMenu(g.at))}
                      className="ml-auto flex h-7 w-8 items-center justify-center rounded-full hover:bg-black/[.06]"
                      style={{ color: "var(--ec-soft, rgba(239,230,204,.7))" }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                        <circle cx="5" cy="12" r="1.8" fill="currentColor" />
                        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                        <circle cx="19" cy="12" r="1.8" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-0.5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-1">
                    {[...g.items]
                      .sort((a, b) => order(a.metric) - order(b.metric))
                      .map((r) => (
                        <span key={r.metric} className="flex min-w-0 items-center gap-1.5 text-[13.5px]" style={{ color: "var(--t-cream)" }}>
                          <span className="min-w-0 flex-1 truncate">{r.metric}</span>
                          <span aria-hidden className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full" style={{ background: "rgba(120,90,40,.18)" }}>
                            <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, r.level * 10))}%`, background: "linear-gradient(90deg,#d9b45f,#a88a3f)" }} />
                          </span>
                          <b className="w-7 shrink-0 text-right tabular-nums">{(Math.round(r.level * 10) / 10).toFixed(1)}</b>
                        </span>
                      ))}
                  </div>
                  <Fold open={menu === g.at}>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 border-t pt-1.5" style={{ borderColor: "var(--ec-line, rgba(217,180,95,.3))" }} role="menu" aria-label="Check-in options">
                      {asking === g.at ? (
                        <>
                          <span className="w-full text-[13px]" style={{ color: "var(--t-cream)" }}>
                            Archive it (kept, out of the log and chart) or delete it for good?
                          </span>
                          <button type="button" role="menuitem" onClick={() => remove(g, "archive")} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}>
                            Archive
                          </button>
                          <button type="button" role="menuitem" onClick={() => remove(g, "delete")} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px solid rgba(155,44,26,.5)", color: "#9b2c1a" }}>
                            Delete for good
                          </button>
                          <button type="button" onClick={() => setAsking(null)} className="h-8 px-2 text-[13px] underline" style={{ color: "var(--ec-soft, rgba(239,230,204,.7))" }}>
                            Keep it
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" role="menuitem" onClick={() => star(g)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px solid var(--ec-line, rgba(217,180,95,.4))", color: "var(--t-cream)" }}>
                            {starredNow ? "Unstar" : "Star"}
                          </button>
                          <button type="button" role="menuitem" onClick={() => (setMenu(null), onEdit(g))} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px solid var(--ec-line, rgba(217,180,95,.4))", color: "var(--t-cream)" }}>
                            Change
                          </button>
                          <button type="button" role="menuitem" onClick={() => setAsking(g.at)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px solid rgba(155,44,26,.45)", color: "#9b2c1a" }}>
                            Remove…
                          </button>
                        </>
                      )}
                    </div>
                  </Fold>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
