"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * A time ruler that opens in place (no popup, no keyboard): a strip of ticks
 * every 5 minutes under a fixed gold needle. Swipe it (the phone's own
 * momentum and snapping), drag it with a mouse, tap a tick to glide there, or
 * use ← → (Shift: an hour) and type digits ("1045") on a computer. The time
 * follows live. "Type" in its foot still lets you key a time in on a phone.
 * Three-team design, Nov 2 (docs/ux/2026-11-02-sleep-times.md).
 */

const TICK = 12; // px between 5-minute ticks: an hour is 144px, about two show at once on a phone
const STEP = 5;
export type RulerKind = "bed" | "wake" | "any";
const RANGE: Record<RulerKind, { start: number; count: number }> = {
  bed: { start: 18 * 60, count: 12 * 12 }, // 6 pm → 6 am
  wake: { start: 2 * 60, count: 12 * 12 }, // 2 am → 2 pm
  any: { start: 0, count: 24 * 12 - 1 }, // the whole day
};
const FALLBACK: Record<RulerKind, number> = { bed: 22 * 60 + 30, wake: 7 * 60, any: 12 * 60 };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return t && Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const fromMin = (n: number) => {
  const x = ((Math.round(n) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
const inRange = (kind: RulerKind, min: number) => (min - RANGE[kind].start + 1440) % 1440 <= RANGE[kind].count * STEP;
const minOf = (kind: RulerKind, i: number) => (RANGE[kind].start + i * STEP) % 1440;
// Minute fidelity (owner, Nov 3: "allow exact timing"): the ruler reads to the minute; ticks still mark every 5.
const PX_MIN = TICK / STEP;
const offOf = (kind: RulerKind, min: number) => {
  const { start, count } = RANGE[kind];
  const d = (min - start + 1440) % 1440;
  const max = count * STEP;
  if (d <= max) return d;
  return d - max < 1440 - d ? max : 0;
};
const minAt = (kind: RulerKind, off: number) => (RANGE[kind].start + off) % 1440;

/** "1045" → 10:45, "945" → 9:45, "7" → 7:00, "22:30" → 22:30; am or pm from the ruler's range. */
export function parseTyped(raw: string, kind: RulerKind, near: number | null): string | null {
  const d = raw.replace(/\D/g, "");
  if (!d || d.length > 4) return null;
  const h = d.length <= 2 ? Number(d) : Number(d.slice(0, d.length - 2));
  const m = d.length <= 2 ? 0 : Number(d.slice(-2));
  if (h > 23 || m > 59) return null;
  if (h > 12 || h === 0) return fromMin(h * 60 + m);
  const am = (h % 12) * 60 + m;
  const pm = am + 12 * 60;
  const ok = [am, pm].filter((x) => inRange(kind, x));
  const pick = ok.length === 1 ? ok[0] : (() => {
    const ref = near ?? FALLBACK[kind];
    const dist = (x: number) => Math.min(Math.abs(x - ref), 1440 - Math.abs(x - ref));
    return dist(am) <= dist(pm) ? am : pm;
  })();
  return fromMin(pick);
}

function hourLabel(min: number) {
  const h = Math.floor(min / 60);
  return `${((h + 11) % 12) + 1} ${h < 12 ? "am" : "pm"}`;
}
const spoken = (min: number) => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, "0")} ${min < 720 ? "am" : "pm"}`;

export function TimeRuler({ kind, value, onChange, onDone, label }: { kind: RulerKind; value: string; onChange: (v: string) => void; onDone: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { count } = RANGE[kind];
  const cur = toMin(value);
  const maxOff = count * STEP;
  const [startOff] = useState(() => offOf(kind, cur ?? FALLBACK[kind]));
  // Only your own touch, swipe, drag, wheel or key moves the time (never the ruler placing itself).
  const live = useRef(false);
  const lastOff = useRef(startOff);
  const latest = useRef({ onChange, value });
  useEffect(() => {
    latest.current = { onChange, value };
  });
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const keyBuf = useRef<{ s: string; t: ReturnType<typeof setTimeout> | null }>({ s: "", t: null });

  // Centred on the time before it's drawn (no visible scroll on opening).
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollLeft = startOff * PX_MIN;
  }, [startOff]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      if (!live.current) return;
      const m = Math.max(0, Math.min(maxOff, Math.round(el.scrollLeft / PX_MIN)));
      if (m === lastOff.current && latest.current.value) return;
      lastOff.current = m;
      latest.current.onChange(fromMin(minAt(kind, m)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    const arm = () => void (live.current = true);
    // A mouse wheel turns the ruler (a trackpad's sideways swipe already does).
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return arm();
      e.preventDefault();
      arm();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", arm, { passive: true });
    el.addEventListener("pointerdown", arm);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", arm);
      el.removeEventListener("pointerdown", arm);
      el.removeEventListener("wheel", wheel);
    };
  }, [kind, count, maxOff]);

  /** Glide the ruler to a minute offset. */
  const glide = (off: number, quiet = false) => {
    const el = ref.current;
    if (!el) return;
    const j = Math.max(0, Math.min(maxOff, off));
    live.current = !quiet;
    el.scrollTo({ left: j * PX_MIN, behavior: "smooth" });
  };
  const setTo = (v: string) => {
    lastOff.current = offOf(kind, toMin(v)!);
    onChange(v);
    glide(lastOff.current, true);
  };
  /** A minute earlier or later (or more), exactly. */
  const nudge = (d: number) => setTo(fromMin(minAt(kind, Math.max(0, Math.min(maxOff, (cur === null ? startOff : offOf(kind, cur)) + d)))));

  // A mouse drags the strip like a finger would (phones scroll it natively).
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const ticks = useMemo(
    () =>
      Array.from({ length: count + 1 }, (_, i) => {
        const min = minOf(kind, i);
        const k = min % 60 === 0 ? "hour" : min % 30 === 0 ? "half" : "minor";
        return (
          <span key={i} className="tr-tick" data-k={k}>
            {k === "hour" && <span className="tr-label">{hourLabel(min)}</span>}
          </span>
        );
      }),
    [kind, count]
  );

  function finishTyping() {
    const v = parseTyped(text, kind, cur);
    setTyping(false);
    setText("");
    if (v) setTo(v);
  }

  return (
    <div className="flex flex-col gap-1 pt-1.5">
      <div className="time-ruler" data-unset={value ? "false" : "true"}>
        <div
          ref={ref}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={maxOff}
          aria-valuenow={cur === null ? undefined : offOf(kind, cur)}
          aria-valuetext={cur === null ? "not set" : spoken(cur)}
          className="time-ruler-scroll"
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse" || e.button !== 0) return;
            drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            if (!d.moved && Math.abs(e.clientX - d.x) < 3) return;
            if (!d.moved) e.currentTarget.style.scrollSnapType = "none";
            d.moved = true;
            e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d?.moved) return;
            const el = e.currentTarget;
            glide(Math.round(el.scrollLeft / PX_MIN));
            // The click that ends a drag isn't a tap on a tick.
            const stop = (c: MouseEvent) => (c.stopPropagation(), c.preventDefault());
            el.addEventListener("click", stop, { capture: true, once: true });
            setTimeout(() => el.removeEventListener("click", stop, { capture: true }), 0);
          }}
          onClick={(e) => {
            // A tap on a tick glides there (and sets it).
            const el = e.currentTarget;
            const r = el.getBoundingClientRect();
            // A tap lands on the nearest 5-minute tick; swipe, the ‹ › or typing give any minute.
            const i = Math.round((e.clientX - r.left - el.clientWidth / 2) / TICK + el.scrollLeft / TICK);
            const j = Math.max(0, Math.min(count, i)) * STEP;
            if (!value || j !== lastOff.current) {
              lastOff.current = j;
              onChange(fromMin(minAt(kind, j)));
            }
            glide(j);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              nudge((e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 15 : 1));
            } else if (/^\d$/.test(e.key)) {
              e.preventDefault();
              const b = keyBuf.current;
              if (b.t) clearTimeout(b.t);
              b.s = (b.s + e.key).slice(-4);
              const apply = () => {
                const v = parseTyped(b.s, kind, cur);
                b.s = "";
                b.t = null;
                if (v) setTo(v);
              };
              b.t = b.s.length >= 4 ? (apply(), null) : setTimeout(apply, 900);
            } else if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onDone();
            }
          }}
        >
          <div className="time-ruler-track">{ticks}</div>
        </div>
        <span aria-hidden className="time-ruler-needle" />
      </div>
      {/* Its foot: Clear (once set), Type (keys a time in), Done. Quiet words, one line. */}
      <div className="flex h-8 items-center gap-3 px-1 text-[12.5px]" style={{ color: "var(--ec-soft, #6b5631)" }}>
        {value && !typing && (
          <button type="button" onClick={() => onChange("")} className="underline underline-offset-2">
            Clear
          </button>
        )}
        <span className="flex-1" />
        {!typing && (
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => nudge(-1)} aria-label="One minute earlier" className="flex h-7 w-7 items-center justify-center rounded-full text-[15px]" style={{ border: "1px solid rgba(139,112,64,.45)" }}>
              ‹
            </button>
            {/* The exact time; tap it to type one (owner: "type a time by tapping the time field"). */}
            <button type="button" onClick={() => setTyping(true)} title="Type a time" className="font-display h-7 min-w-[74px] rounded-full px-2 text-[15px] tabular-nums" style={{ color: "var(--t-ink, #2a1c10)", background: "rgba(255,250,238,.75)", border: "1px solid rgba(139,112,64,.45)" }}>
              {cur === null ? "type…" : spoken(cur)}
            </button>
            <button type="button" onClick={() => nudge(1)} aria-label="One minute later" className="flex h-7 w-7 items-center justify-center rounded-full text-[15px]" style={{ border: "1px solid rgba(139,112,64,.45)" }}>
              ›
            </button>
          </span>
        )}
        <span className="flex-1" />
        {typing ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              finishTyping();
            }}
          >
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
              onBlur={finishTyping}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setTyping(false);
                  setText("");
                }
              }}
              inputMode="numeric"
              enterKeyHint="done"
              placeholder="10:45"
              aria-label={`${label}, typed`}
              className="time-ruler-type font-display h-7 w-[76px] rounded-full px-2.5 text-center text-[16px] tabular-nums outline-none"
            />
          </form>
        ) : null}
        <button type="button" onClick={onDone} className="h-7 rounded-full px-3.5 text-[12.5px] font-bold" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
          Done
        </button>
      </div>
    </div>
  );
}
