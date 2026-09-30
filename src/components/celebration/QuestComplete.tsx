"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  barDust,
  cardDust,
  embers,
  loadFx,
  puffDust,
  ringDust,
  type FxSettings,
  type Speck,
} from "@/lib/celebration-fx";

export type QuestCompleteProps = {
  title: string;
  description?: string | null;
  /** Small tag over the quest icon, e.g. the board name. */
  tag: string;
  /** XP the quest was worth (sum of its tasks). */
  questXp: number;
  level: number;
  /** Character XP inside the current level, and the size of the level. */
  xpIntoLevel: number;
  xpForNextLevel: number | null;
  /** Quest portrait; defaults to the dragon. */
  iconSrc?: string;
  /** The player's avatar image. */
  avatarSrc?: string;
  onClose: () => void;
};

function Dust({ items, mode }: { items: Speck[]; mode: "center" | "pct" | "px" }) {
  return (
    <>
      {items.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: mode === "pct" ? `${p.x}%` : mode === "px" ? `${p.x}px` : 0,
            top: mode === "pct" ? `${p.y}%` : mode === "px" ? `${p.y}px` : 0,
            width: 0,
            height: 0,
            transform: `rotate(${p.a}deg)`,
          }}
        >
          <div
            className={`qc-dust qc-dust-${p.tier}`}
            style={{
              left: -p.h,
              top: -p.r,
              width: p.s,
              height: p.s,
              animationDelay: `${p.d}s`,
              animationDuration: `${p.t}s`,
              background: p.c,
              boxShadow: `0 0 ${p.g}px ${p.k}px ${p.c}`,
            }}
          />
        </div>
      ))}
    </>
  );
}

export function QuestComplete(props: QuestCompleteProps) {
  const { title, description, tag, questXp, level, xpIntoLevel, xpForNextLevel, iconSrc = "/design/icon-dragon.jpg", avatarSrc = "/design/avatar-ranger.jpg", onClose } = props;
  const router = useRouter();
  // Only ever mounted client-side (after a user action), so localStorage is readable up front.
  const [fx] = useState<FxSettings>(() => loadFx());
  const [reduce] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const [p, setP] = useState(reduce ? 1 : 0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stop = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  // Start the XP transfer once the check has landed.
  useEffect(() => {
    if (reduce) return;
    timers.current.push(
      setTimeout(() => {
        const start = performance.now();
        const dur = fx.fill * 1000;
        setPlaying(true);
        const tick = (now: number) => {
          const v = Math.min(1, (now - start) / dur);
          setP(v);
          if (v < 1) raf.current = requestAnimationFrame(tick);
          else timers.current.push(setTimeout(() => setPlaying(false), 1400));
        };
        raf.current = requestAnimationFrame(tick);
      }, 1250)
    );
    return stop;
  }, [reduce, fx.fill, stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const eased = 1 - Math.pow(1 - p, 3);
  const gained = Math.round(questXp * eased);
  // The bar shows the last `questXp` XP filling into the current level.
  const start = Math.max(0, xpIntoLevel - questXp);
  const span = Math.max(1, xpIntoLevel - start);
  const cur = start + span * eased;
  const max = xpForNextLevel ?? Math.max(1, xpIntoLevel);
  const pct = Math.min(100, (cur / max) * 100);
  const spark = playing ? 1 : 0;

  const icon0 = useMemo(() => (fx.fxAvatar ? ringDust(fx, "icon") : []), [fx]);
  const char0 = useMemo(() => (fx.fxAvatar ? ringDust(fx, "char") : []), [fx]);
  const card0 = useMemo(() => (fx.fxCard ? cardDust(fx) : []), [fx]);
  const pctBucket = Math.round(pct / 2) * 2;
  const bar0 = useMemo(() => barDust(fx, pctBucket), [fx, pctBucket]);
  const puff0 = useMemo(() => puffDust(fx), [fx]);
  const amb = useMemo(() => embers(fx), [fx]);

  const remaining = questXp - gained;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quest complete"
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ fontFamily: "var(--font-eb-garamond), 'EB Garamond', Georgia, serif", backgroundColor: "#232b22", backgroundImage: "url(/design/bg-forest.jpg)", backgroundSize: "cover", backgroundPosition: "top center" }}
    >
      <div className="qc-overlay absolute inset-0" style={{ background: "rgba(9,13,8,.84)" }} />

      {/* ambient embers keep drifting after the main animation */}
      <div className="pointer-events-none absolute inset-0">
        {amb.map((r, i) => (
          <div
            key={i}
            className="qc-amb"
            style={{
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: r.s,
              height: r.s,
              animationDelay: `${r.d}s`,
              animationDuration: `${r.t}s`,
              background: r.c,
              boxShadow: `0 0 8px 2px ${r.c}`,
            }}
          />
        ))}
      </div>
      <div
        className="qc-flash pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 42%, rgba(255,244,190,.95), rgba(242,201,106,.35) 30%, rgba(242,201,106,0) 62%)" }}
      />

      <div className="absolute inset-0 overflow-y-auto">
        <div className="qc-shake mx-auto flex min-h-full w-full max-w-[420px] flex-col items-center justify-center gap-[22px] px-4 py-6">
          {/* Title */}
          <div className="qc-title flex w-full items-center justify-center gap-2.5">
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(217,180,95,0), rgba(217,180,95,.6))" }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design/ui-leaf.png" alt="" className="h-5 w-[26px] shrink-0" />
            <h1 className="m-0 whitespace-nowrap text-[32px] font-semibold tracking-[.01em]" style={{ color: "#efe6cc", textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>
              Quest Complete!
            </h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design/ui-leaf.png" alt="" className="h-5 w-[26px] shrink-0 -scale-x-100" />
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(217,180,95,.6), rgba(217,180,95,0))" }} />
          </div>

          {/* Featured quest card */}
          <div
            className="qc-card relative box-border w-full rounded-xl px-4 pb-4 pt-3.5"
            style={{ border: "2px solid #d9b45f", backgroundColor: "#e2caa2", backgroundImage: "url(/design/tex-parchment.jpg)", backgroundSize: "cover" }}
          >
            <div className="qc-fade pointer-events-none absolute inset-0" style={{ opacity: spark }}>
              <Dust items={card0} mode="pct" />
            </div>
            <div className="flex items-stretch gap-3.5">
              <div className="flex shrink-0 flex-col items-center">
                <div
                  className="relative z-[6] -mb-3 inline-block max-w-[110px] truncate rounded-md px-2.5 py-px text-[13px]"
                  style={{ background: "#d0b991", border: "1px solid #8a7250", color: "#2f2a1f", boxShadow: "inset 0 1px 0 rgba(255,240,210,.6), 0 2px 4px rgba(0,0,0,.35)" }}
                >
                  {tag}
                </div>
                <div className="relative h-[92px] w-[92px]">
                  <div className="qc-ring absolute inset-0 rounded-full" style={{ border: "3px solid #d9b45f" }} />
                  <div className="qc-ring2 absolute inset-0 rounded-full" style={{ border: "3px solid #f2c96a" }} />
                  <div className="qc-ring3 absolute inset-0 rounded-full" style={{ border: "2px solid #fff" }} />
                  <div
                    className="qc-icon absolute inset-0 flex items-center justify-center overflow-hidden rounded-full"
                    style={{ border: "2px solid #a58c66", boxShadow: "0 0 0 3px rgba(217,180,95,.55), 0 4px 10px rgba(0,0,0,.35)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={iconSrc} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="pointer-events-none absolute inset-0">
                    <div className="qc-ripple" />
                    <div className="qc-ripple qc-ripple2" />
                  </div>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="qc-pulse">
                    <div className="qc-check h-20 w-20" style={{ filter: "drop-shadow(0 0 10px rgba(110,230,80,.75)) drop-shadow(0 4px 6px rgba(0,0,0,.5))" }}>
                      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" role="img" aria-label="Completed">
                        <path d="M4.5 12.8 L9.6 17.9 L19.6 6.6" stroke="#16300f" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4.5 12.8 L9.6 17.9 L19.6 6.6" stroke="#3fbf3a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5.6 12.6 L9.6 16.6 L18.4 6.9" stroke="#8ff070" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
                      </svg>
                    </div>
                    </div>
                  </div>
                  <div className="pointer-events-none absolute" style={{ left: 46, top: 46, width: 0, height: 0 }}>
                    {puff0.map((s, i) => (
                      <div key={i} className="absolute left-0 top-0 h-0 w-0" style={{ transform: `rotate(${s.a}deg)` }}>
                        <div className="qc-puff" style={{ left: -s.h, top: -s.r, width: s.s, height: s.s, animationDelay: `${s.d}s`, animationDuration: `${s.t}s`, background: s.c, boxShadow: `0 0 ${s.g}px ${s.k}px ${s.c}` }} />
                      </div>
                    ))}
                  </div>
                  <div className="qc-fade pointer-events-none absolute inset-0" style={{ opacity: spark }}>
                    <div className="absolute" style={{ left: 46, top: 46, width: 0, height: 0 }}>
                      <Dust items={icon0} mode="center" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <h2 className="m-0 break-words text-[22px] font-bold leading-[1.1]" style={{ color: "#2f2a1f" }}>{title}</h2>
                {description && <div className="line-clamp-3 text-[15px] leading-[1.2]" style={{ color: "#6b6252" }}>{description}</div>}
              </div>

              <div className="w-px shrink-0" style={{ background: "#b9a47c" }} />

              <div className="relative flex w-[66px] shrink-0 flex-col items-center justify-center gap-0.5">
                <span className="text-base font-bold leading-none" style={{ color: remaining === 0 ? "#8a7d5f" : "#4f6d3c" }}>XP</span>
                <span className="text-[38px] font-bold leading-none tabular-nums" style={{ color: remaining === 0 ? "#8a7d5f" : "#4f6d3c" }}>{remaining}</span>
              </div>
            </div>
          </div>

          {/* Character level and XP bar */}
          <div
            className="qc-panel relative box-border flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5"
            style={{ border: "2px solid #a88a3f", background: "rgba(24,31,22,.92)", boxShadow: "inset 0 0 0 1px rgba(217,180,95,.25), 0 8px 20px rgba(0,0,0,.5)" }}
          >
            <div className="relative h-16 w-16 shrink-0">
              <div className="relative box-border h-16 w-16 rounded-full p-0.5" style={{ border: "2px solid #d9b45f", background: "#1a2118" }}>
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full text-[28px]" style={{ border: "2px solid #a88a3f", background: "#c9d2bd" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarSrc} alt="Your character" className="h-full w-full object-cover" />
                </div>
              </div>
              <div
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-px text-xs font-bold"
                style={{ background: "linear-gradient(180deg,#3b4636,#232c22)", color: "#d9b45f", border: "2px solid #d9b45f" }}
              >
                Lvl {level}
              </div>
              <div className="qc-fade pointer-events-none absolute" style={{ left: 32, top: 32, width: 0, height: 0, opacity: spark }}>
                <Dust items={char0} mode="center" />
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
              <div className="text-center text-xl font-bold leading-none tabular-nums tracking-[.02em]" style={{ color: "#f2d27e", textShadow: "0 0 10px rgba(242,201,106,.55)" }}>
                +{gained} XP earned ✨
              </div>
              <div className="relative h-4 w-full">
                <div className="absolute inset-0 overflow-hidden rounded-full" style={{ background: "#1c231b", border: "1.5px solid #a88a3f" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(180deg,#f2d27e,#a88a3f)" }} />
                </div>
                <div
                  className="qc-edge pointer-events-none absolute h-11 w-11 -translate-x-1/2 rounded-full"
                  style={{ top: -14, left: `${pct}%`, opacity: spark, background: "radial-gradient(circle, rgba(255,240,180,.95), rgba(255,220,120,.4) 40%, rgba(255,240,180,0) 70%)" }}
                />
                <div className="qc-fade pointer-events-none absolute left-0 top-0 h-4 w-full" style={{ opacity: spark }}>
                  <Dust items={bar0} mode="pct" />
                </div>
              </div>
              <div className="text-center text-[15px] tabular-nums tracking-[.02em]" style={{ color: "#d9b45f" }}>
                {xpForNextLevel ? `${Math.round(cur).toLocaleString("en-US")} / ${xpForNextLevel.toLocaleString("en-US")} XP` : "Max level"}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="qc-btns mt-1 flex w-full gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-14 flex-1 cursor-pointer rounded-[14px] px-2 text-[19px] font-bold tracking-[.01em]"
              style={{ border: "3px solid #31301e", background: "radial-gradient(circle at 32% 28%, #f2c96a, #d9b45f 55%, #a88a3f)", color: "#2a1c10", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5), inset 0 -3px 5px rgba(0,0,0,.25), 0 6px 14px rgba(0,0,0,.45)" }}
            >
              Claim Reward
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push("/");
              }}
              className="min-h-14 flex-1 cursor-pointer rounded-[14px] px-2 text-[17px] font-bold leading-[1.05] tracking-[.01em]"
              style={{ border: "2px solid #d9b45f", background: "linear-gradient(180deg,#3b4636,#232c22)", color: "#efe6cc", boxShadow: "inset 0 1px 0 rgba(255,235,180,.2), 0 6px 14px rgba(0,0,0,.45)" }}
            >
              Continue Your Journey
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
