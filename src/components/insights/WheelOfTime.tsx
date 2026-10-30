"use client";

import { TimeToken } from "@/components/xp/NightFields";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { saveNightAction, setWheelOfTimeAction } from "@/app/actions";
import { NightFields, EMPTY_NIGHT, nightIsEmpty, type NightDraft } from "@/components/xp/NightFields";
import { StoneWheel, WHEEL_STEP } from "@/components/insights/StoneWheel";
import { DateField } from "@/components/ui/DateField";
import { MAX_WEIGHT, weightOf, clockFromNight, minutesLabel, nightMinutes, prettyTime, recentAverages, shiftDay, turnings, wheelTurns, type NightLog, type WheelState } from "@/lib/wheel-of-time";

const CREAM = "#efe6cc";
const SOFT = "rgba(239,230,204,.7)";
const GOLD = "#f2d27e";
const ROSE = "#f3b39f";
/** The chart's clock: 8pm at the top to 11am at the bottom (night minutes). */
const TOP = 8 * 60;
const BOTTOM = 23 * 60;
const NIGHTS = 14;
/** Whether the stone wheel is heard, remembered on this device. */
const SOUND_KEY = "wot-sound";
function subscribeSound(cb: () => void) {
  window.addEventListener(SOUND_KEY, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SOUND_KEY, cb);
    window.removeEventListener("storage", cb);
  };
}
function readSound() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

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
  // The sleep and wake log: any night, last night to start with.
  const [logDay, setLogDay] = useState(today);
  const [draft, setDraft] = useState<NightDraft>(() => draftFrom(initial.log[today]));
  const [logSaved, setLogSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The stone wheel: press what you did today (or yesterday) to turn it.
  const [pressDay, setPressDay] = useState<"today" | "yesterday">("today");
  const sound = useSyncExternalStore(subscribeSound, readSound, () => true);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  const keys = dayKeys(today, NIGHTS);
  const avg = recentAverages(state, 7);
  const turns = useMemo(() => turnings(state), [state]);
  const target = state.target ? nightMinutes(state.target) : null;
  const totalNights = Object.keys(state.log).length;

  function saveSettings(patch: { effort?: string[]; hindrances?: string[]; target?: string | null; weights?: Record<string, number> }) {
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
  function openLog(key: string, reveal = false) {
    setLogDay(key);
    setDraft(draftFrom(state.log[key]));
    setLogSaved(false);
    if (reveal) document.getElementById("sleep-log")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function saveLog() {
    const day = logDay;
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
        setDraft(draftFrom(res.night ?? undefined));
        setLogSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that night.");
      }
    });
  }

  // Today's doings belong to tonight, which is logged on tomorrow's morning;
  // yesterday's belong to last night (this morning's check-in).
  const pressKey = pressDay === "today" ? shiftDay(today, 1) : today;
  const pressNight = state.log[pressKey];
  const turned = wheelTurns(state);

  function press(kind: "effort" | "hindrance", name: string) {
    const cur = latest.current.log[pressKey];
    const base: NightLog = cur ?? { bed: null, wake: null, effort: [], hindrances: [], at: new Date().toISOString() };
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const next: NightLog =
      kind === "effort"
        ? { ...base, effort: base.effort.includes(name) ? base.effort.filter((e) => e !== name) : [...base.effort, name] }
        : { ...base, hindrances: base.hindrances.some((h) => h.name === name) ? base.hindrances.filter((h) => h.name !== name) : [...base.hindrances, { name, at: pressDay === "today" ? hhmm : null }] };
    const empty = !next.bed && !next.wake && !next.effort.length && !next.hindrances.length;
    setState((s) => {
      const log = { ...s.log };
      if (empty) delete log[pressKey];
      else log[pressKey] = next;
      return { ...s, log };
    });
    // The open log shows the same night, so it keeps up with the presses.
    if (pressKey === logDay) setDraft((d) => ({ ...d, effort: next.effort, hindrances: next.hindrances }));
    setError(null);
    // Quick presses are gathered up, then saved one at a time.
    const day = pressKey;
    clearTimeout(saveTimers.current[day]);
    saveTimers.current[day] = setTimeout(() => {
      saveChain.current = saveChain.current.then(async () => {
        const n = latest.current.log[day];
        try {
          await saveNightAction({ day, bed: n?.bed ?? null, wake: n?.wake ?? null, effort: n?.effort ?? [], hindrances: n?.hindrances ?? [] });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't save that press.");
        }
      });
    }, 700);
  }
  function toggleSound() {
    try {
      localStorage.setItem(SOUND_KEY, sound ? "off" : "on");
    } catch {}
    window.dispatchEvent(new Event(SOUND_KEY));
  }

  const pressButton = (kind: "effort" | "hindrance", name: string) => {
    const on = kind === "effort" ? !!pressNight?.effort.includes(name) : !!pressNight?.hindrances.some((h) => h.name === name);
    const good = kind === "effort";
    const tint = good ? "242,210,126" : "243,179,159";
    return (
      <button
        key={kind + name}
        type="button"
        aria-pressed={on}
        onClick={() => press(kind, name)}
        className="flex min-h-10 items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[13.5px] font-semibold leading-snug transition-[transform,box-shadow] duration-150 active:scale-[.97]"
        style={{
          color: on ? (good ? "#2a1c10" : "#2a120c") : CREAM,
          background: on
            ? good
              ? "linear-gradient(180deg, #f2d27e, #c99a45)"
              : "linear-gradient(180deg, #f3b39f, #c4715c)"
            : "linear-gradient(180deg, rgba(150,140,120,.32), rgba(70,64,54,.42))",
          border: `1px solid rgba(${tint},${on ? 0.9 : 0.45})`,
          boxShadow: on ? `inset 0 2px 5px rgba(0,0,0,.35), 0 0 12px rgba(${tint},.35)` : "0 2px 0 rgba(0,0,0,.45), inset 0 1px 0 rgba(255,246,220,.14)",
        }}
      >
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[15px] font-black" style={{ background: on ? "rgba(0,0,0,.18)" : `rgba(${tint},.16)`, color: on ? "inherit" : `rgb(${tint})` }}>
          {on ? "✓" : good ? "+" : "−"}
        </span>
        <span className="min-w-0 flex-1">{name}</span>
      </button>
    );
  };

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
      {/* Sleep and wake for any night: right under the check-in chart, on top of the wheel. */}
      <div id="sleep-log" className="flex scroll-mt-4 flex-col gap-2 rounded-xl p-3" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(217,180,95,.35)" }}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: GOLD }}>
            ☾ Sleep &amp; wake log
          </span>
          <div className="flex items-center gap-1" role="group" aria-label="Which night">
            <button type="button" onClick={() => openLog(shiftDay(logDay, -1))} aria-label="The night before" className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] hover:bg-white/10" style={{ color: GOLD }}>
              ‹
            </button>
            <DateField
              value={logDay}
              onChange={(v) => v && openLog(v > today ? today : v)}
              max={today}
              ariaLabel="The morning after the night"
              className="night-time px-3"
            />
            <button type="button" onClick={() => openLog(shiftDay(logDay, 1))} disabled={logDay >= today} aria-label="The night after" className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] hover:bg-white/10 disabled:opacity-30" style={{ color: GOLD }}>
              ›
            </button>
          </div>
        </div>
        <span className="text-[12.5px]" style={{ color: SOFT }}>
          The night before {logDay === today ? "this morning" : longDay(logDay)}
        </span>
        <NightFields value={draft} onChange={(d) => (setDraft(d), setLogSaved(false))} effort={state.effort} hindrances={state.hindrances} />
        <div className="flex items-center justify-end gap-2">
          {logSaved && (
            <span className="fade-in text-[13px] font-semibold" style={{ color: "#9fe0b0" }}>
              ✓ Saved
            </span>
          )}
          <button type="button" onClick={saveLog} disabled={pending || (nightIsEmpty(draft) && !state.log[logDay])} className="h-9 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            {pending ? "…" : nightIsEmpty(draft) && state.log[logDay] ? "Clear night" : "Save night"}
          </button>
        </div>
      </div>

      {/* The stone wheel, and what turns it. */}
      <div className="flex flex-col gap-2.5">
        <div className="relative">
          <StoneWheel angle={turned.net * WHEEL_STEP} sound={sound} />
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={sound}
            aria-label={sound ? "Mute the wheel" : "Let the wheel be heard"}
            title={sound ? "Mute the wheel" : "Let the wheel be heard"}
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full text-[16px] hover:bg-white/10"
            style={{ color: SOFT }}
          >
            {sound ? "🔊" : "🔇"}
          </button>
        </div>
        <span className="text-center text-[12.5px]" style={{ color: SOFT }}>
          <span aria-hidden className="mr-1 text-[14px]" style={{ color: GOLD }}>☸</span>
          Turned forward <b style={{ color: GOLD }}>{turned.forward}</b> · back <b style={{ color: ROSE }}>{turned.back}</b>
        </span>
        <div className="mx-auto flex rounded-full p-0.5" role="group" aria-label="Which day" style={{ background: "rgba(0,0,0,.3)", border: "1px solid rgba(217,180,95,.35)" }}>
          {(["today", "yesterday"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={pressDay === d}
              onClick={() => setPressDay(d)}
              className="h-8 rounded-full px-4 text-[13px] font-bold"
              style={pressDay === d ? { background: "var(--t-gold)", color: "#2a1c10" } : { color: SOFT }}
            >
              {d === "today" ? "Today" : "Yesterday"}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: GOLD }}>
              Right Effort · turns it forward
            </span>
            {state.effort.map((n) => pressButton("effort", n))}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: ROSE }}>
              Hindrances · turn it back
            </span>
            {state.hindrances.map((n) => pressButton("hindrance", n))}
          </div>
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="mx-auto h-8 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px solid rgba(217,180,95,.6)" }}>
          {editing ? "Done" : "⚙ Edit what's on the wheel"}
        </button>
        {editing && (
          <div className="reveal grid gap-2 sm:grid-cols-2">
            <ListEditor title="Right Effort" color={GOLD} items={state.effort} weights={state.weights} onChange={(effort) => saveSettings({ effort })} onWeight={(name, w) => saveSettings({ weights: { ...state.weights, [name]: w } })} />
            <ListEditor title="Hindrances" color={ROSE} items={state.hindrances} weights={state.weights} onChange={(hindrances) => saveSettings({ hindrances })} onWeight={(name, w) => saveSettings({ weights: { ...state.weights, [name]: w } })} />
            <span className="text-[12px] sm:col-span-2" style={{ color: SOFT }}>
              The number beside each is how many turns one press gives the wheel. Changing it re-turns the wheel for every night it was logged. Nights already logged keep what was checked, even if you rename or remove something here.
            </span>
          </div>
        )}
        <span className="text-center text-[11.5px]" style={{ color: SOFT }}>
          Each press is saved to {pressDay === "today" ? "tonight" : "last night"}, so the patterns below learn from it. Press again to take it back.
        </span>
      </div>

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
              <g key={k} onClick={() => openLog(k, true)} style={{ cursor: "pointer" }}>
                <rect x={padL + i * colW} y={0} width={colW} height={H} fill={logDay === k ? "rgba(242,210,126,.1)" : "transparent"} />
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
          Each bar runs from bedtime to waking{state.target ? ", dashed line is your target" : ""}; a red dot means a Hindrance. Tap a night to open it in the sleep log above.
        </span>
      </div>

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

      {/* Target bedtime */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-2.5" style={{ borderColor: "rgba(217,180,95,.25)" }}>
        <label className="flex items-center gap-1.5 text-[13.5px] font-semibold">
          Target bedtime
          <TimeToken value={state.target ?? ""} onChange={(v) => saveSettings({ target: v || null })} label="Target bedtime" kind="bed" compact />
        </label>
      </div>
      {error && (
        <span className="text-[12.5px] font-semibold" style={{ color: ROSE }}>
          {error}
        </span>
      )}
    </div>
  );
}

function ListEditor({ title, color, items, weights, onChange, onWeight }: { title: string; color: string; items: string[]; weights: Record<string, number>; onChange: (next: string[]) => void; onWeight: (name: string, weight: number) => void }) {
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
          <span className="flex shrink-0 items-center rounded-full" role="group" aria-label={`How far ${i} turns the wheel`} style={{ border: "1px solid rgba(217,180,95,.4)" }}>
            <button type="button" onClick={() => onWeight(i, Math.max(1, weightOf(weights, i) - 1))} disabled={weightOf(weights, i) <= 1} aria-label={`Turn less for ${i}`} className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-bold hover:bg-white/10 disabled:opacity-30" style={{ color }}>
              −
            </button>
            <span className="min-w-[2.6em] text-center text-[12.5px] font-bold tabular-nums" style={{ color }} title="Turns per press">
              {weightOf(weights, i)} {weightOf(weights, i) === 1 ? "turn" : "turns"}
            </span>
            <button type="button" onClick={() => onWeight(i, Math.min(MAX_WEIGHT, weightOf(weights, i) + 1))} disabled={weightOf(weights, i) >= MAX_WEIGHT} aria-label={`Turn more for ${i}`} className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-bold hover:bg-white/10 disabled:opacity-30" style={{ color }}>
              +
            </button>
          </span>
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
          className="night-time !h-8 min-w-0 flex-1"
          style={{ fontFamily: "inherit" }}
        />
        <button type="button" onClick={add} disabled={!text.trim()} className="h-8 rounded-full px-3 text-[13px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
          Add
        </button>
      </div>
    </div>
  );
}
