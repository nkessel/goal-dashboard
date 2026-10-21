"use client";

import { useMemo, useState, useTransition } from "react";
import { saveNightAction, setWheelOfTimeAction } from "@/app/actions";
import { NightFields, EMPTY_NIGHT, nightIsEmpty, type NightDraft } from "@/components/xp/NightFields";
import { clockFromNight, minutesLabel, nightMinutes, prettyTime, recentAverages, turnings, type NightLog, type WheelState } from "@/lib/wheel-of-time";

const CREAM = "#efe6cc";
const SOFT = "rgba(239,230,204,.7)";
const GOLD = "#f2d27e";
const ROSE = "#f3b39f";
/** The chart's clock: 8pm at the top to 11am at the bottom (night minutes). */
const TOP = 8 * 60;
const BOTTOM = 23 * 60;
const NIGHTS = 14;

function dayKeys(today: string, n: number) {
  const out: string[] = [];
  const d = new Date(`${today}T12:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}
const weekday = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" });
const longDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const draftFrom = (n: NightLog | undefined): NightDraft => (n ? { bed: n.bed ?? "", wake: n.wake ?? "", effort: n.effort, hindrances: n.hindrances } : EMPTY_NIGHT);

/**
 * The Wheel of Time: getting to bed on time. Two weeks of nights (bed to
 * wake) against the target, the averages, and which Right Effort turns the
 * wheel forward and which Hindrances turn it back. Lists and target editable.
 */
export function WheelOfTime({ initial, today }: { initial: WheelState; today: string }) {
  const [state, setState] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);
  const [draft, setDraft] = useState<NightDraft>(EMPTY_NIGHT);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const keys = dayKeys(today, NIGHTS);
  const avg = recentAverages(state, 7);
  const turns = useMemo(() => turnings(state), [state]);
  const target = state.target ? nightMinutes(state.target) : null;
  const totalNights = Object.keys(state.log).length;

  function saveSettings(patch: { effort?: string[]; hindrances?: string[]; target?: string | null }) {
    const prev = state;
    setState((s) => ({ ...s, ...patch }));
    setError(null);
    start(async () => {
      try {
        const next = await setWheelOfTimeAction(patch);
        setState((s) => ({ ...s, ...next }));
      } catch (e) {
        setState(prev);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  function openLog(key: string) {
    setLogging(key);
    setDraft(draftFrom(state.log[key]));
  }
  function saveLog() {
    if (!logging) return;
    const day = logging;
    setError(null);
    start(async () => {
      try {
        const res = await saveNightAction({ day, bed: draft.bed || null, wake: draft.wake || null, effort: draft.effort, hindrances: draft.hindrances });
        setState((s) => {
          const log = { ...s.log };
          if (res.night) log[res.day] = res.night;
          else delete log[res.day];
          return { ...s, log };
        });
        setLogging(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that night.");
      }
    });
  }

  // Chart geometry.
  const W = 336;
  const H = 168;
  const padL = 34;
  const padB = 18;
  const colW = (W - padL) / NIGHTS;
  const y = (m: number) => ((Math.min(BOTTOM, Math.max(TOP, m)) - TOP) / (BOTTOM - TOP)) * (H - padB);
  const ticks = [TOP, 10 * 60, 12 * 60, 14 * 60, 16 * 60, 18 * 60, 20 * 60, 22 * 60];

  const forward = turns.filter((t) => t.shift !== null && t.shift < -4).sort((a, b) => a.shift! - b.shift!);
  const backward = turns.filter((t) => t.shift !== null && t.shift > 4).sort((a, b) => b.shift! - a.shift!);
  const learning = turns.filter((t) => t.shift === null || Math.abs(t.shift) <= 4);

  const stat = (label: string, value: string, color = GOLD) => (
    <div className="flex min-w-[96px] flex-1 flex-col items-center rounded-xl px-2 py-1.5" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(217,180,95,.3)" }}>
      <span className="font-display text-[19px] tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="text-center text-[11.5px] leading-tight" style={{ color: SOFT }}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3" style={{ color: CREAM }}>
      {/* Averages */}
      <div className="flex flex-wrap gap-2">
        {stat("avg bedtime, last 7", avg.bed !== null ? clockFromNight(avg.bed) : "–")}
        {stat("avg sleep", avg.slept !== null ? minutesLabel(avg.slept) : "–")}
        {stat(state.target ? `in bed by ${prettyTime(state.target)}` : "set a target below", avg.onTime !== null && avg.logged ? `${avg.onTime}/${avg.logged}` : "–", avg.onTime !== null && avg.logged && avg.onTime / avg.logged >= 0.5 ? "#9fe0b0" : GOLD)}
      </div>

      {/* Two weeks of nights: a bar from bed to wake; tap a night to log or fix it. */}
      <div className="flex flex-col gap-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Bed and wake times, last ${NIGHTS} nights`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="rgba(239,230,204,.1)" />
              <text x={padL - 4} y={y(t) + 3.5} textAnchor="end" fontSize="9.5" fill="rgba(239,230,204,.55)">
                {clockFromNight(t).replace(":00", "")}
              </text>
            </g>
          ))}
          {target !== null && (
            <g>
              <line x1={padL} x2={W} y1={y(target)} y2={y(target)} stroke={GOLD} strokeDasharray="4 3" strokeWidth="1.2" opacity=".8" />
            </g>
          )}
          {keys.map((k, i) => {
            const n = state.log[k];
            const x = padL + i * colW + colW / 2;
            const bed = n?.bed ? nightMinutes(n.bed) : null;
            const wake = n?.wake ? nightMinutes(n.wake) : null;
            const late = bed !== null && target !== null && bed > target;
            const color = late ? ROSE : "#9fd8c8";
            return (
              <g key={k} onClick={() => openLog(k)} style={{ cursor: "pointer" }}>
                <rect x={padL + i * colW} y={0} width={colW} height={H} fill={logging === k ? "rgba(242,210,126,.1)" : "transparent"} />
                {bed !== null && wake !== null && wake > bed && <rect x={x - colW * 0.28} y={y(bed)} width={colW * 0.56} height={Math.max(2, y(wake) - y(bed))} rx={3} fill={color} opacity=".55" />}
                {bed !== null && <circle cx={x} cy={y(bed)} r={3.4} fill={color} />}
                {n && n.hindrances.length > 0 && <circle cx={x} cy={H - padB - 4} r={2.2} fill={ROSE} />}
                <text x={x} y={H - 4} textAnchor="middle" fontSize="9.5" fill={k === today ? GOLD : "rgba(239,230,204,.55)"}>
                  {weekday(k)}
                </text>
                <title>{n ? `${longDay(k)}: ${n.bed ? `slept ${prettyTime(n.bed)}` : "no bedtime"}${n.wake ? `, woke ${prettyTime(n.wake)}` : ""}` : `${longDay(k)}: not logged (tap to log)`}</title>
              </g>
            );
          })}
        </svg>
        <span className="text-center text-[11.5px]" style={{ color: SOFT }}>
          Each bar runs from bedtime to waking{state.target ? ", dashed line is your target" : ""}; a red dot means a Hindrance. Tap a night to log or fix it.
        </span>
      </div>

      {logging && (
        <div className="reveal flex flex-col gap-1.5 rounded-xl p-2.5" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(217,180,95,.35)" }}>
          <span className="text-[13px] font-bold" style={{ color: GOLD }}>
            The night before {longDay(logging)}
          </span>
          <NightFields value={draft} onChange={setDraft} effort={state.effort} hindrances={state.hindrances} />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setLogging(null)} className="h-8 px-2 text-[13px] underline underline-offset-2" style={{ color: SOFT }}>
              Cancel
            </button>
            <button type="button" onClick={saveLog} disabled={pending} className="h-8 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-60" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
              {pending ? "…" : nightIsEmpty(draft) && state.log[logging] ? "Clear night" : "Save night"}
            </button>
          </div>
        </div>
      )}

      {/* What turns the wheel */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-xl p-2.5" style={{ background: "rgba(0,0,0,.2)", border: "1px solid rgba(159,224,176,.3)" }}>
          <span className="text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: "#9fe0b0" }}>
            Turns the wheel forward
          </span>
          {forward.length ? (
            forward.map((t) => (
              <span key={t.kind + t.name} className="text-[13.5px] leading-snug">
                {t.name} <b style={{ color: "#9fe0b0" }}>· {minutesLabel(t.shift!)} earlier</b> <span style={{ color: SOFT }}>({t.nights} nights)</span>
              </span>
            ))
          ) : (
            <span className="text-[13px] italic" style={{ color: SOFT }}>
              Nothing clear yet.
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 rounded-xl p-2.5" style={{ background: "rgba(0,0,0,.2)", border: "1px solid rgba(243,179,159,.3)" }}>
          <span className="text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: ROSE }}>
            Turns it backward
          </span>
          {backward.length ? (
            backward.map((t) => (
              <span key={t.kind + t.name} className="text-[13.5px] leading-snug">
                {t.name} <b style={{ color: ROSE }}>· {minutesLabel(t.shift!)} later</b> <span style={{ color: SOFT }}>({t.nights} nights)</span>
              </span>
            ))
          ) : (
            <span className="text-[13px] italic" style={{ color: SOFT }}>
              Nothing clear yet.
            </span>
          )}
        </div>
      </div>
      {learning.length > 0 && (
        <span className="text-[12px] leading-snug" style={{ color: SOFT }}>
          {totalNights < 4 ? "After a few nights logged, this shows how each one moves your bedtime. " : ""}
          Still learning: {learning.map((t) => t.name).join(" · ")}. Each needs at least two nights with it and two without.
        </span>
      )}

      {/* Target and lists */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-2.5" style={{ borderColor: "rgba(217,180,95,.25)" }}>
        <label className="flex items-center gap-1.5 text-[13.5px] font-semibold">
          Target bedtime
          <input
            type="time"
            value={state.target ?? ""}
            onChange={(e) => saveSettings({ target: e.target.value || null })}
            aria-label="Target bedtime"
            className="h-8 w-[104px] rounded-lg border px-1.5 text-[15px] tabular-nums"
            style={{ background: "rgba(255,250,238,.92)", borderColor: "#b39a6a", color: "#2a1c10" }}
          />
        </label>
        <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="ml-auto h-8 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px solid rgba(217,180,95,.6)" }}>
          {editing ? "Done" : "Edit Right Effort & Hindrances"}
        </button>
      </div>
      {editing && (
        <div className="reveal grid gap-2 sm:grid-cols-2">
          <ListEditor title="Right Effort" color={GOLD} items={state.effort} onChange={(effort) => saveSettings({ effort })} />
          <ListEditor title="Hindrances" color={ROSE} items={state.hindrances} onChange={(hindrances) => saveSettings({ hindrances })} />
          <span className="text-[12px] sm:col-span-2" style={{ color: SOFT }}>
            Nights already logged keep what was checked, even if you rename or remove something here.
          </span>
        </div>
      )}
      {error && (
        <span className="text-[12.5px] font-semibold" style={{ color: ROSE }}>
          {error}
        </span>
      )}
    </div>
  );
}

function ListEditor({ title, color, items, onChange }: { title: string; color: string; items: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.replace(/\s+/g, " ").trim().slice(0, 60);
    if (t && !items.some((i) => i.toLowerCase() === t.toLowerCase())) onChange([...items, t]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-1 rounded-xl p-2.5" style={{ background: "rgba(0,0,0,.22)", border: "1px solid rgba(217,180,95,.3)" }}>
      <span className="text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color }}>
        {title}
      </span>
      {items.map((i) => (
        <span key={i} className="flex items-center gap-2 text-[13.5px] leading-snug">
          <span className="flex-1">{i}</span>
          <button type="button" onClick={() => onChange(items.filter((x) => x !== i))} aria-label={`Remove ${i}`} className="flex h-7 w-7 items-center justify-center rounded-full text-[16px] hover:bg-white/10" style={{ color: SOFT }}>
            ×
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1.5 pt-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          maxLength={60}
          placeholder={`Add to ${title}`}
          aria-label={`Add to ${title}`}
          className="h-8 min-w-0 flex-1 rounded-lg border px-2 text-[15px]"
          style={{ background: "rgba(255,250,238,.92)", borderColor: "#b39a6a", color: "#2a1c10" }}
        />
        <button type="button" onClick={add} disabled={!text.trim()} className="h-8 rounded-full px-3 text-[13px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
          Add
        </button>
      </div>
    </div>
  );
}
