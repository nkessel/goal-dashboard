"use client";

import { useEffect, useRef, useState } from "react";

/*
 * A load of laundry, step by step: Load (with its reminders), Wash, Dry, Fold.
 * Each step after loading has its own timer, a gilded dial that counts down
 * and glows when it's done. The run lives on this device (so a wash timer
 * survives closing the app) until the load is folded.
 */

const STEPS = [
  { key: "load", label: "Load", icon: "🧺", minutes: 10 },
  { key: "wash", label: "Wash", icon: "🫧", minutes: 45 },
  { key: "dry", label: "Dry", icon: "☀️", minutes: 60 },
  { key: "fold", label: "Fold", icon: "👕", minutes: 15 },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const REMINDERS = [
  { key: "towels", label: "House towels" },
  { key: "sheets", label: "Bed sheets" },
  { key: "gentle", label: "Gently used clothes" },
] as const;

type Timer = { endsAt: number | null; left: number; total: number };
type Run = { step: number; checks: Record<string, boolean>; timer: Timer | null; minutes: Record<StepKey, number> };

const KEY = "laundry-run";
const fresh = (minutes?: Record<StepKey, number>): Run => ({
  step: 0,
  checks: {},
  timer: null,
  minutes: minutes ?? (Object.fromEntries(STEPS.map((s) => [s.key, s.minutes])) as Record<StepKey, number>),
});
function readRun(): Run {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Run | null;
    return v && typeof v.step === "number" ? { ...fresh(), ...v, minutes: { ...fresh().minutes, ...v.minutes } } : fresh();
  } catch {
    return fresh();
  }
}
function writeRun(r: Run | null) {
  try {
    if (r) window.localStorage.setItem(KEY, JSON.stringify(r));
    else window.localStorage.removeItem(KEY);
  } catch {}
}
const leftOf = (t: Timer, now: number) => (t.endsAt === null ? t.left : Math.max(0, t.endsAt - now));
const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/** The whole run, shown in the laundry panel. `onFolded` records the load. */
export function LaundryRun({ onFolded, onClose }: { onFolded: () => void; onClose: () => void }) {
  const [run, setRunState] = useState<Run>(readRun);
  const [now, setNow] = useState(0);
  const chimed = useRef(false);
  const setRun = (r: Run) => {
    setRunState(r);
    writeRun(r);
  };
  const timer = run.timer;
  const running = !!timer && timer.endsAt !== null;
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    if (!running) return;
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [running]);

  const step = STEPS[run.step];
  const left = timer && now ? leftOf(timer, now) : (timer?.left ?? run.minutes[step.key] * 60_000);
  const total = timer?.total ?? run.minutes[step.key] * 60_000;
  const finished = !!timer && now > 0 && left <= 0;
  useEffect(() => {
    // A soft buzz on phones when a timer runs out (once).
    if (finished && !chimed.current) {
      chimed.current = true;
      try {
        navigator.vibrate?.([120, 80, 120]);
      } catch {}
    }
    if (!finished) chimed.current = false;
  }, [finished]);

  const startTimer = (stepIndex: number, base: Run = run) => {
    const ms = base.minutes[STEPS[stepIndex].key] * 60_000;
    setRun({ ...base, step: stepIndex, timer: { endsAt: Date.now() + ms, left: ms, total: ms } });
  };
  const pause = () => timer && setRun({ ...run, timer: { ...timer, endsAt: null, left: leftOf(timer, Date.now()) } });
  const resume = () => timer && setRun({ ...run, timer: { ...timer, endsAt: Date.now() + timer.left } });
  const nudge = (min: number) => {
    if (!timer) {
      const m = Math.max(1, Math.min(240, run.minutes[step.key] + min));
      return setRun({ ...run, minutes: { ...run.minutes, [step.key]: m } });
    }
    const d = min * 60_000;
    const l = Math.max(0, leftOf(timer, Date.now()) + d);
    setRun({ ...run, timer: { endsAt: timer.endsAt === null ? null : Date.now() + l, left: l, total: Math.max(timer.total + d, l) } });
  };
  const next = () => {
    if (run.step >= STEPS.length - 1) {
      writeRun(null);
      onFolded();
      return;
    }
    // Moving on starts the next step's timer straight away (the wash starts as you close the lid).
    startTimer(run.step + 1, { ...run, timer: null });
  };
  const goTo = (i: number) => setRun({ ...run, step: i, timer: null });

  return (
    <div className="reveal flex flex-col gap-2.5 rounded-xl px-2.5 pb-2.5 pt-2" style={{ background: "linear-gradient(180deg, rgba(255,250,238,.75), rgba(243,231,203,.6))", border: "1.5px solid #b39a6a", boxShadow: "inset 0 1px 0 rgba(255,255,255,.6)" }}>
      {/* The four steps, linked by a gilded thread. */}
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const done = i < run.step;
          const here = i === run.step;
          return (
            <div key={s.key} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={here ? "step" : undefined}
                className="flex flex-col items-center gap-0.5"
                title={s.label}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] transition-all duration-300"
                  style={
                    here
                      ? { background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "1.5px solid #4a3913", boxShadow: "0 0 10px rgba(242,210,126,.6)" }
                      : done
                        ? { background: "rgba(226,187,92,.35)", border: "1.5px solid #a88a3f" }
                        : { background: "rgba(255,250,238,.9)", border: "1.5px solid #c8b38a", opacity: 0.75 }
                  }
                >
                  {done ? <span className="text-[13px] font-bold" style={{ color: "#6b4a12" }}>✓</span> : s.icon}
                </span>
                <span className="text-[11px] font-semibold" style={{ color: here ? "#3a2a10" : "#7a6440" }}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span aria-hidden className="mx-1 mb-4 h-[2px] flex-1 rounded-full" style={{ background: i < run.step ? "linear-gradient(90deg,#c99a3a,#f2d27e)" : "rgba(139,112,64,.25)" }} />
              )}
            </div>
          );
        })}
      </div>

      {run.step === 0 ? (
        // Load: what to remember to put in.
        <div key="load" className="reveal flex flex-col gap-1">
          <span className="text-[12px] font-semibold" style={{ color: "#7a6440" }}>
            Remember to include
          </span>
          {REMINDERS.map((r) => {
            const on = !!run.checks[r.key];
            return (
              <label key={r.key} className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-1">
                <input type="checkbox" className="peer sr-only" checked={on} onChange={(e) => setRun({ ...run, checks: { ...run.checks, [r.key]: e.target.checked } })} />
                <span
                  aria-hidden
                  className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px] transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[#8a6116]"
                  style={
                    on
                      ? { background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "1.5px solid #4a3913", boxShadow: "0 0 6px rgba(242,210,126,.5)" }
                      : { background: "rgba(255,250,238,.9)", border: "1.5px solid #b39a6a", boxShadow: "inset 0 1px 2px rgba(0,0,0,.12)" }
                  }
                >
                  {on && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="gold-check-draw">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#3a2a10" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={`text-[13.5px] ${on ? "opacity-60" : ""}`} style={{ color: "#2a1c10" }}>
                  {r.label}
                </span>
              </label>
            );
          })}
          <div className="mt-1 flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-8 rounded-full px-2.5 text-[12.5px]" style={{ color: "#7a6440" }}>
              Not now
            </button>
            <button type="button" onClick={next} className="ml-auto h-8 rounded-full px-3.5 text-[13px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
              Loaded · start the wash
            </button>
          </div>
        </div>
      ) : (
        <div key={step.key} className="reveal flex items-center gap-3">
          <Dial left={left} total={total} finished={finished} running={running} label={step.label} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="m-0 font-display text-[15px] leading-tight" style={{ color: "#2a1c10" }}>
              {finished ? (run.step === STEPS.length - 1 ? "All folded?" : `${step.label} is done`) : timer ? `${step.label}ing…` : `${step.label}: ${run.minutes[step.key]} min`}
            </p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => nudge(-5)} aria-label="5 minutes less" className="dial-btn">
                −5
              </button>
              {!timer ? (
                <button type="button" onClick={() => startTimer(run.step)} aria-label="Start the timer" className="dial-btn dial-play">
                  ▶
                </button>
              ) : running && !finished ? (
                <button type="button" onClick={pause} aria-label="Pause" className="dial-btn dial-play">
                  ❚❚
                </button>
              ) : !finished ? (
                <button type="button" onClick={resume} aria-label="Resume" className="dial-btn dial-play">
                  ▶
                </button>
              ) : null}
              <button type="button" onClick={() => nudge(5)} aria-label="5 minutes more" className="dial-btn">
                +5
              </button>
            </div>
            <button type="button" onClick={next} className={`h-8 self-start rounded-full px-3.5 text-[13px] font-semibold ${finished ? "dial-ready" : ""}`} style={{ background: finished ? "var(--t-gold)" : "rgba(255,250,238,.9)", color: "#2a1c10", border: `1px solid ${finished ? "#8a6116" : "#b39a6a"}` }}>
              {run.step === STEPS.length - 1 ? "✓ Folded and put away" : `On to ${STEPS[run.step + 1].label.toLowerCase()}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The timer: a gilded ring that empties as time runs, the time in the middle. */
function Dial({ left, total, finished, running, label }: { left: number; total: number; finished: boolean; running: boolean; label: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const f = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  return (
    <div className={`relative h-[112px] w-[112px] shrink-0 ${finished ? "dial-done" : ""}`} role="timer" aria-label={`${label}: ${clock(left)} left`}>
      <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden>
        <defs>
          <linearGradient id="dial-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1b8" />
            <stop offset=".5" stopColor="#e2bb5c" />
            <stop offset="1" stopColor="#a88a3f" />
          </linearGradient>
          <radialGradient id="dial-face" cx=".4" cy=".35" r=".7">
            <stop offset="0" stopColor="#fffaf0" />
            <stop offset="1" stopColor="#efe1bf" />
          </radialGradient>
        </defs>
        <circle cx="56" cy="56" r="53" fill="url(#dial-face)" stroke="#a88a3f" strokeWidth="1.5" />
        {/* Twelve small marks, like a clock face. */}
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="56" y1="6.5" x2="56" y2={i % 3 ? 9 : 11} stroke="rgba(110,80,30,.45)" strokeWidth={i % 3 ? 1 : 1.6} transform={`rotate(${i * 30} 56 56)`} />
        ))}
        <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(139,112,64,.18)" strokeWidth="6" />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="url(#dial-gold)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`}
          transform="rotate(-90 56 56)"
          style={{ transition: running ? "stroke-dasharray 500ms linear" : "stroke-dasharray 300ms ease", filter: "drop-shadow(0 0 3px rgba(242,210,126,.6))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[22px] leading-none tabular-nums" style={{ color: "#2a1c10" }}>
          {finished ? "✓" : clock(left)}
        </span>
        <span className="mt-1 text-[10.5px] font-semibold uppercase tracking-[.12em]" style={{ color: "#8a6116" }}>
          {label}
        </span>
      </div>
    </div>
  );
}
