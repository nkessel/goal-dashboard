"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Task } from "@/lib/data/types";
import {
  getDayPlanAction,
  getQuickEventsAction,
  planQuestAtAction,
  planQuickEventAction,
  saveQuickEventsAction,
  unscheduleTaskAction,
  type DayPlan,
  type QuickEvent,
} from "@/app/actions";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";

type TaskWithCategory = Task & { categoryLabel?: string | null };
type Carry =
  | { kind: "quest"; id: string; title: string; minutes: number }
  | { kind: "move"; id: string; title: string; minutes: number }
  | { kind: "quick"; label: string; emoji: string; minutes: number };

const FIRST_HOUR = 6;
const LAST_HOUR = 23;
const HOUR_PX = 48;
const SNAP_MIN = 15;
const GUTTER = 46;

const pad = (n: number) => String(n).padStart(2, "0");
function addDays(key: string, n: number) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function minutesOf(iso: string, dayStart: Date) {
  return Math.round((new Date(iso).getTime() - dayStart.getTime()) / 60_000);
}
function hourLabel(h: number) {
  return `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
}
function timeLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

/** Side-by-side lanes for overlapping items. */
function lanes<T extends { start: number; end: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number; lanes: number })[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = n));
    out.push(...cluster);
    cluster = [];
  };
  for (const it of sorted) {
    if (it.start >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.end > it.start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

/**
 * The evening's "Plan tomorrow's day": tomorrow's hours, with what's already
 * there (Google appointments, faint; quests, bold). Tap a quest or a quick
 * event above, then tap a time to place it — on a computer the card follows
 * the pointer. Tap something placed to move it or take it off.
 */
export function DayPlanner({ day, chosen, theme }: { /** This evening's day key. */ day: string | null; /** Tomorrow's chosen quests. */ chosen: TaskWithCategory[]; theme: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const tomorrow = day ? addDays(day, 1) : null;
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [quick, setQuick] = useState<QuickEvent[] | null>(null);
  const [carry, setCarry] = useState<Carry | null>(null);
  const [ghost, setGhost] = useState<number | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [editingQuick, setEditingQuick] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const dayStart = tomorrow ? new Date(`${tomorrow}T00:00:00`) : null;

  const load = useCallback(async () => {
    if (!tomorrow) return;
    const start = new Date(`${tomorrow}T00:00:00`);
    const end = new Date(start.getTime() + 86_400_000);
    try {
      setPlan(await getDayPlanAction(start.toISOString(), end.toISOString()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load tomorrow.");
    }
  }, [tomorrow]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads tomorrow's calendar once the day is known
    void load();
    getQuickEventsAction().then(setQuick).catch(() => setQuick([]));
  }, [load]);

  // Start the view at 8am.
  useEffect(() => {
    if (plan && scrollRef.current) scrollRef.current.scrollTop = (8 - FIRST_HOUR) * HOUR_PX - 8;
  }, [plan === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc puts down whatever is being carried.
  useEffect(() => {
    if (!carry) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setCarry(null), setGhost(null));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [carry]);

  if (!tomorrow || !dayStart) return null;

  const placedIds = new Set((plan?.quests ?? []).map((q) => q.id));
  const toPlace = chosen.filter((t) => !placedIds.has(t.id));
  const tomorrowName = new Date(`${tomorrow}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const slotAt = (clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const y = clientY - grid.getBoundingClientRect().top;
    const raw = FIRST_HOUR * 60 + (y / HOUR_PX) * 60;
    const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
    const minutes = carry?.minutes ?? 30;
    return Math.max(FIRST_HOUR * 60, Math.min(LAST_HOUR * 60 + 60 - minutes, snapped));
  };

  function place(startMin: number) {
    const c = carry;
    if (!c || !dayStart) return;
    const start = new Date(dayStart.getTime() + startMin * 60_000);
    const end = new Date(start.getTime() + c.minutes * 60_000);
    setCarry(null);
    setGhost(null);
    setError(null);
    // Show it right away; the server catches up.
    const temp = { id: c.kind === "quick" ? `temp-${Date.now()}` : c.id, title: c.kind === "quick" ? `${c.emoji} ${c.label}` : c.title, start: start.toISOString(), end: end.toISOString(), icon_key: null, icon_source: null, status: "open" };
    setPlan((p) => (p ? { ...p, quests: [...p.quests.filter((q) => q.id !== temp.id), temp] } : p));
    startBusy(async () => {
      try {
        if (c.kind === "quick") await planQuickEventAction({ title: `${c.emoji} ${c.label}`, startISO: start.toISOString(), endISO: end.toISOString() });
        else await planQuestAtAction(c.id, start.toISOString(), end.toISOString());
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't place that.");
        await load();
      }
    });
  }

  function takeOff(id: string) {
    setMenu(null);
    setPlan((p) => (p ? { ...p, quests: p.quests.filter((q) => q.id !== id) } : p));
    startBusy(async () => {
      try {
        await unscheduleTaskAction(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't take it off.");
      }
      await load();
    });
  }

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
  const timed = [
    ...(plan?.events ?? []).filter((e) => !e.isAllDay).map((e) => ({ ...e, type: "event" as const, start: minutesOf(e.start, dayStart), end: minutesOf(e.end, dayStart) })),
    ...(plan?.quests ?? []).map((q) => ({ ...q, type: "quest" as const, start: minutesOf(q.start, dayStart), end: minutesOf(q.end, dayStart) })),
  ].filter((x) => x.end > FIRST_HOUR * 60 && x.start < (LAST_HOUR + 1) * 60);
  const laid = lanes(timed);
  const allDay = (plan?.events ?? []).filter((e) => e.isAllDay);

  const chip = "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold";
  const chipStyle = (on: boolean): React.CSSProperties => ({
    background: on ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "rgba(255,250,238,.7)",
    border: `1.5px solid ${on ? "#8a6116" : "#b39a6a"}`,
    color: "#2a1c10",
    boxShadow: on ? "0 0 0 3px rgba(242,201,76,.35)" : undefined,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
          {tomorrowName}
        </span>
        <Link href={`/calendar?view=day&date=${tomorrow}`} className="text-[13.5px] underline underline-offset-2" style={{ color: "#6f4f12" }}>
          Open in Calendar
        </Link>
      </div>

      {/* What can be placed */}
      <div className="flex flex-col gap-1.5">
        {toPlace.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {toPlace.map((t) => {
              const on = carry?.kind === "quest" && carry.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCarry(on ? null : { kind: "quest", id: t.id, title: t.title, minutes: t.estimate_minutes && t.estimate_minutes <= 480 ? t.estimate_minutes : 30 })}
                  className={chip}
                  style={chipStyle(on)}
                  title="Then tap a time below"
                >
                  <QuestMonogram id={t.id} title={t.title} size={24} />
                  <span className="max-w-[160px] truncate">{t.title}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {(quick ?? []).map((q) => {
            const on = carry?.kind === "quick" && carry.label === q.label;
            return (
              <button key={q.label} type="button" aria-pressed={on} onClick={() => setCarry(on ? null : { kind: "quick", ...q })} className={chip} style={chipStyle(on)} title={`${q.minutes} minutes — then tap a time below`}>
                <span aria-hidden>{q.emoji}</span>
                {q.label}
              </button>
            );
          })}
          <button type="button" onClick={() => setEditingQuick((v) => !v)} className={`${chip} font-normal`} style={{ border: "1.5px dashed #b39a6a", color: "#5a4a30" }}>
            {editingQuick ? "Done" : "Edit"}
          </button>
        </div>
        {editingQuick && quick && <QuickEventsEditor list={quick} onSave={(l) => (setQuick(l), saveQuickEventsAction(l).catch((e) => setError(e instanceof Error ? e.message : "Couldn't save.")))} />}
        {toPlace.length === 0 && chosen.length > 0 && (
          <p className="m-0 text-[13px]" style={{ color: "#5a4a30" }}>
            All of tomorrow&apos;s quests have a time.
          </p>
        )}
      </div>

      <p className="m-0 min-h-[20px] text-[13.5px]" role="status" style={{ color: carry ? "#6f4f12" : "#5a4a30", fontWeight: carry ? 600 : 400 }}>
        {carry ? (
          <>
            Tap a time for “{carry.kind === "quick" ? carry.label : carry.title}” ·{" "}
            <button type="button" onClick={() => (setCarry(null), setGhost(null))} className="underline">
              cancel
            </button>
          </>
        ) : (
          "Choose something above, then tap a time."
        )}
      </p>

      {error && (
        <p role="alert" className="m-0 text-[14px] font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      {allDay.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allDay.map((e) => (
            <span key={e.id} className="rounded-md px-2 py-0.5 text-[12.5px]" style={{ background: "rgba(90,80,60,.1)", color: "#6b6252" }}>
              {e.title}
            </span>
          ))}
        </div>
      )}

      {/* The day */}
      <div ref={scrollRef} className="relative max-h-[min(56vh,460px)] overflow-y-auto overscroll-contain rounded-xl" style={{ background: "rgba(255,250,238,.45)", border: "1px solid rgba(139,112,64,.35)" }}>
        <div
          ref={gridRef}
          className={`relative ${carry ? "cursor-copy" : ""}`}
          style={{ height: hours.length * HOUR_PX }}
          onPointerMove={(e) => carry && e.pointerType === "mouse" && setGhost(slotAt(e.clientY))}
          onPointerLeave={() => setGhost(null)}
          onClick={(e) => {
            if (!carry) return setMenu(null);
            const at = slotAt(e.clientY);
            if (at !== null) place(at);
          }}
        >
          {hours.map((h, i) => (
            <div key={h} className="absolute inset-x-0 flex" style={{ top: i * HOUR_PX, height: HOUR_PX, borderTop: i ? "1px solid rgba(139,112,64,.18)" : undefined }}>
              <span className="w-[46px] shrink-0 pr-1.5 pt-0.5 text-right text-[11.5px] tabular-nums" style={{ color: "#7a6a4c" }}>
                {hourLabel(h)}
              </span>
              <span className="flex-1" style={{ borderTop: "1px dashed rgba(139,112,64,.1)", marginTop: HOUR_PX / 2 }} />
            </div>
          ))}

          {laid.map((it) => {
            const top = ((Math.max(it.start, FIRST_HOUR * 60) - FIRST_HOUR * 60) / 60) * HOUR_PX;
            const height = Math.max(22, ((Math.min(it.end, (LAST_HOUR + 1) * 60) - Math.max(it.start, FIRST_HOUR * 60)) / 60) * HOUR_PX - 2);
            const left = `calc(${GUTTER}px + (100% - ${GUTTER + 6}px) * ${it.lane / it.lanes})`;
            const width = `calc((100% - ${GUTTER + 6}px) / ${it.lanes} - 3px)`;
            if (it.type === "event") {
              return (
                // Appointments recede so quests stand out.
                <div key={`e-${it.id}`} className="pointer-events-none absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[12px] leading-tight" style={{ top, height, left, width, background: "rgba(110,110,120,.12)", border: "1px solid rgba(110,110,120,.25)", color: "#6b6b72" }}>
                  {it.title}
                </div>
              );
            }
            const art = it.icon_source === "ai" || it.icon_source === "library" ? it.icon_key : null;
            return (
              <div key={`q-${it.id}`} className="absolute" style={{ top, height, left, width }}>
                <button
                  type="button"
                  onClick={(e) => {
                    if (carry) return;
                    e.stopPropagation();
                    setMenu(menu === it.id ? null : it.id);
                  }}
                  className="flex h-full w-full items-start gap-1.5 overflow-hidden rounded-lg px-1.5 py-1 text-left text-[13px] font-semibold leading-tight"
                  style={{
                    background: "linear-gradient(180deg,#fbf0d2,#f0dcab)",
                    border: "1.5px solid #a8812e",
                    borderLeft: "4px solid #a8812e",
                    color: "#2a1c10",
                    boxShadow: "0 2px 5px rgba(60,40,10,.25)",
                    opacity: it.status === "completed" ? 0.6 : it.id.startsWith("temp-") || busy ? 0.85 : 1,
                  }}
                >
                  {height >= 30 && (
                    <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full" style={{ border: "1px solid #a58c66", background: "#f3e6c8" }}>
                      {art ? (
                        // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                        <img src={art} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <QuestMonogram id={it.id} title={it.title} size={20} />
                      )}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{it.title}</span>
                    {height >= 40 && <span className="block text-[11.5px] font-normal opacity-75">{timeLabel(it.start)}</span>}
                  </span>
                </button>
                {menu === it.id && !it.id.startsWith("temp-") && (
                  <div className="card-pop-in absolute left-0 top-full z-20 mt-1 flex min-w-[170px] flex-col overflow-hidden rounded-xl parchment" style={{ borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(null);
                        setCarry({ kind: "move", id: it.id, title: it.title, minutes: Math.max(SNAP_MIN, it.end - it.start) });
                      }}
                      className="relative z-[1] min-h-11 px-4 text-left text-[14.5px] hover:bg-black/5"
                    >
                      Move
                    </button>
                    <button type="button" onClick={() => takeOff(it.id)} className="relative z-[1] min-h-11 border-t px-4 text-left text-[14.5px] hover:bg-black/5" style={{ borderColor: "rgba(139,112,64,.3)" }}>
                      Take off the plan
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {carry && ghost !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-lg px-2 py-1 text-[13px] font-semibold"
              style={{
                top: ((ghost - FIRST_HOUR * 60) / 60) * HOUR_PX,
                height: Math.max(22, (carry.minutes / 60) * HOUR_PX - 2),
                left: GUTTER,
                right: 6,
                background: "rgba(242,210,126,.45)",
                border: "1.5px dashed #8a6116",
                color: "#2a1c10",
              }}
            >
              {timeLabel(ghost)} · {carry.kind === "quick" ? `${carry.emoji} ${carry.label}` : carry.title}
            </div>
          )}
        </div>
      </div>

      {!plan?.calendarConnected && plan && (
        <p className="m-0 text-[12.5px]" style={{ color: "#5a4a30" }}>
          Connect Google Calendar on the Calendar page to see your appointments here too.
        </p>
      )}
    </div>
  );
}

/** Rename, retime, add or remove the quick-event buttons. */
function QuickEventsEditor({ list, onSave }: { list: QuickEvent[]; onSave: (l: QuickEvent[]) => void }) {
  const [rows, setRows] = useState(list);
  const commit = (next: QuickEvent[]) => {
    setRows(next);
    onSave(next.filter((r) => r.label.trim()));
  };
  const field = "h-9 rounded-lg border px-2 text-[16px]";
  const fieldStyle = { borderColor: "#b39a6a", background: "rgba(255,251,240,.8)" };
  return (
    <div className="flex flex-col gap-1.5 rounded-xl p-2.5" style={{ background: "rgba(255,250,238,.55)", border: "1px solid rgba(139,112,64,.3)" }}>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={r.emoji} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)))} onBlur={() => commit(rows)} aria-label="Emoji" className={`${field} w-11 text-center`} style={fieldStyle} />
          <input value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} onBlur={() => commit(rows)} aria-label="Name" className={`${field} min-w-0 flex-1`} style={fieldStyle} />
          <input
            type="number"
            min={5}
            step={5}
            value={r.minutes}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) || 30 } : x)))}
            onBlur={() => commit(rows)}
            aria-label="Minutes"
            className={`${field} w-16 text-right`}
            style={fieldStyle}
          />
          <span className="text-[12px]" style={{ color: "#5a4a30" }}>
            min
          </span>
          <button type="button" onClick={() => commit(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.label}`} className="h-9 w-8 text-[18px] leading-none" style={{ color: "#5a4a30" }}>
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { emoji: "📌", label: "", minutes: 30 }])} className="h-9 w-fit rounded-full px-3 text-[14px] underline" style={{ color: "#5a4a30" }}>
        + Add a quick event
      </button>
    </div>
  );
}
