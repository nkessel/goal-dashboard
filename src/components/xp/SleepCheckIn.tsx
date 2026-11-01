"use client";

import { useEffect, useState } from "react";
import { saveCheckInAction, saveNightAction, setWheelOfTimeAction, wheelOfTimeAction } from "@/app/actions";
import { EMPTY_NIGHT, NightFields, MoonIcon, SunIcon, TimeToken, type NightDraft } from "./NightFields";
import { DateField } from "@/components/ui/DateField";
import { eveningDayKey } from "@/components/evening/evening-clock";

const GILT = { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } as const;
const SOFT = "#6b5631";

/** How well you slept, 1–5: kept as the "Sleep quality" check-in metric (2…10 on its 1–10 scale). */
const FACES = [
  { v: 1, label: "Bad", mouth: "M8 17.5c1.6-2 6.4-2 8 0" },
  { v: 2, label: "Poor", mouth: "M8.5 16.5c1.6-1 5.4-1 7 0" },
  { v: 3, label: "OK", mouth: "M8.5 16h7" },
  { v: 4, label: "Good", mouth: "M8.5 15c1.6 1.2 5.4 1.2 7 0" },
  { v: 5, label: "Great", mouth: "M7.5 14.2c2 2.8 7 2.8 9 0" },
] as const;
const FACE_COLOR = ["#a33c2a", "#c0703a", "#a8893f", "#6f9a3a", "#3f7a2e"];

function Face({ mouth, color }: { mouth: string; color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill={color} fillOpacity=".16" stroke={color} strokeWidth="1.6" />
      <circle cx="9" cy="10" r="1.1" fill={color} />
      <circle cx="15" cy="10" r="1.1" fill={color} />
      <path d={mouth} stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Sleep, its own part of the welcome screen: a gilded button that slides open
 * last night's sleep and wake times, the Wheel of Time (factors of sleep, its
 * lists editable right here), a sleep-quality row of five faces, and other
 * nights. Saved by the screen's own button (registered like the top priority).
 */
export function SleepCheckIn({ register }: { register: (save: () => Promise<boolean>) => void }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<{ effort: string[]; hindrances: string[] } | null>(null);
  const [night, setNight] = useState<NightDraft>(EMPTY_NIGHT);
  const [base, setBase] = useState(JSON.stringify(EMPTY_NIGHT));
  const [logged, setLogged] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [quality, setQuality] = useState<number | null>(null);
  const [others, setOthers] = useState<{ id: number; day: string; bed: string; wake: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => eveningDayKey());

  useEffect(() => {
    let live = true;
    wheelOfTimeAction()
      .then((w) => {
        if (!live) return;
        setLists({ effort: w.effort, hindrances: w.hindrances });
        setLogged(w.loggedToday);
        const b = { ...EMPTY_NIGHT, effort: w.pressed.effort, hindrances: w.pressed.hindrances };
        setBase(JSON.stringify(b));
        setNight(b);
      })
      .catch(() => live && setLists({ effort: [], hindrances: [] }));
    return () => {
      live = false;
    };
  }, []);

  const touched = JSON.stringify(night) !== base;
  const filled = others.filter((n) => n.day && (n.bed || n.wake));
  // Saved by the welcome screen's own button, with everything else on it.
  // (Braces matter: an effect's return value is its cleanup, and returning the saver made React
  // call it on every render, saving "Sleep quality" hundreds of times.)
  useEffect(() => {
    register(async () => {
      if (!touched && quality === null && !filled.length) return true;
      setError(null);
      try {
        for (const n of filled) await saveNightAction({ day: n.day, bed: n.bed || null, wake: n.wake || null, effort: [], hindrances: [], keep: true });
        if (touched) await saveNightAction({ bed: night.bed || null, wake: night.wake || null, effort: night.effort, hindrances: night.hindrances });
        if (quality !== null) await saveCheckInAction(null, [{ metric: "Sleep quality", level: quality * 2 }]);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your sleep.");
        return false;
      }
    });
  });

  function saveLists(next: { effort: string[]; hindrances: string[] }) {
    const before = lists;
    setLists(next);
    setWheelOfTimeAction(next)
      .then((r) => setLists({ effort: r.effort, hindrances: r.hindrances }))
      .catch((e) => {
        setLists(before);
        setError(e instanceof Error ? e.message : "Couldn't save the lists.");
      });
  }
  const summary = [night.bed || night.wake ? "times" : "", quality ? FACES[quality - 1].label.toLowerCase() : ""].filter(Boolean).join(" · ");

  return (
    <div className="flex w-full flex-col items-center">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-display flex h-10 items-center gap-1.5 rounded-full px-5 text-[16px]" style={GILT}>
        <MoonIcon />
        Sleep{logged && !touched ? " ✓" : ""}
        {summary && !open && <span className="text-[12.5px] opacity-75">· {summary}</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="drawer-body w-full" data-open={open ? "true" : "false"}>
        <div className="drawer-inner" inert={!open}>
          <div className="mt-2 flex w-full flex-col gap-2 text-left" style={{ ["--t-cream" as string]: "var(--t-ink)", ["--ec-soft" as string]: "var(--t-ink-soft)", ["--ec-gold" as string]: "#8a6116" }}>
            {lists ? (
              <NightFields value={night} onChange={setNight} effort={lists.effort} hindrances={lists.hindrances} onLists={saveLists} day={today} />
            ) : (
              <p className="m-0 text-center text-[13px] italic" style={{ color: SOFT }}>
                Opening…
              </p>
            )}
            {/* Sleep quality: five faces, one tap. */}
            <button type="button" onClick={() => setQualityOpen((v) => !v)} aria-expanded={qualityOpen} className="wheel-btn mx-auto flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold">
              {quality ? <Face mouth={FACES[quality - 1].mouth} color={FACE_COLOR[quality - 1]} /> : <span aria-hidden>☺</span>}
              Sleep quality{quality ? ` · ${FACES[quality - 1].label}` : ""}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-300" style={{ transform: qualityOpen ? "rotate(90deg)" : undefined }}>
                <path d="M9 5.5l6.5 6.5L9 18.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="drawer-body" data-open={qualityOpen ? "true" : "false"}>
              <div className="drawer-inner" inert={!qualityOpen}>
                <div role="radiogroup" aria-label="How well did you sleep?" className="flex justify-center gap-1.5 pt-1">
                  {FACES.map((f, i) => {
                    const on = quality === f.v;
                    return (
                      <button key={f.v} type="button" role="radio" aria-checked={on} onClick={() => setQuality(on ? null : f.v)} className="flex w-14 flex-col items-center gap-0.5 rounded-xl py-1.5 transition-transform duration-150 active:scale-95" style={{ background: on ? `${FACE_COLOR[i]}22` : "transparent", boxShadow: on ? `inset 0 0 0 1.5px ${FACE_COLOR[i]}` : undefined, transform: on ? "scale(1.06)" : undefined }}>
                        <Face mouth={f.mouth} color={FACE_COLOR[i]} />
                        <span className="text-[11.5px] font-semibold" style={{ color: on ? FACE_COLOR[i] : SOFT }}>
                          {f.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Other nights: a row only once you add one (no empty fields waiting). */}
            {others.map((n, i) => (
              <div key={n.id} className="reveal flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl px-2 py-1.5" style={{ background: "rgba(255,250,238,.55)", border: "1px solid rgba(139,112,64,.3)" }}>
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
                  Morning of
                  <DateField value={n.day} onChange={(v) => v && setOthers((o) => o.map((x, j) => (j === i ? { ...x, day: v } : x)))} max={today} ariaLabel="The morning after the night" className="night-time font-display" />
                </span>
                <TimeToken value={n.bed} onChange={(v) => setOthers((o) => o.map((x, j) => (j === i ? { ...x, bed: v } : x)))} label="Sleep time" icon={<MoonIcon />} kind="bed" compact placeholder="bedtime" />
                <TimeToken value={n.wake} onChange={(v) => setOthers((o) => o.map((x, j) => (j === i ? { ...x, wake: v } : x)))} label="Wake time" icon={<SunIcon />} kind="wake" compact placeholder="wake" />
                <button type="button" onClick={() => setOthers((o) => o.filter((x) => x.id !== n.id))} aria-label="Remove this night" className="ml-auto flex h-8 w-8 items-center justify-center text-[18px] leading-none" style={{ color: SOFT }}>
                  ×
                </button>
              </div>
            ))}
            {error && (
              <p className="m-0 text-[12.5px]" style={{ color: "#a33" }}>
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
