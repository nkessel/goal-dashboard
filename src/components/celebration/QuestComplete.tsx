"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import type { Reward } from "@/lib/data/types";
import { claimRewardAction, getQuestForEditAction, listAvailableRewardsAction, reopenTaskAction } from "@/app/actions";
import { celebrateReward } from "./RewardCelebration";
import type { Task } from "@/lib/data/types";
import { QuestEditorDialog } from "@/components/tasks/QuestEditorDialog";
import { CoinIcon, DiamondIcon } from "@/components/ui/Icons";
import { SettingsGear } from "@/components/ui/SettingsGear";
import {
  barDust,
  cardDust,
  embers,
  loadFx,
  effectsTier,
  puffDust,
  ringDust,
  type FxSettings,
  type Speck,
} from "@/lib/celebration-fx";
import { useEscape } from "@/lib/use-escape";

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
  /** The finished quest, so a claimed reward is linked to it. Null for previews/goals. */
  taskId?: string | null;
  /** Preview mode (Settings): rewards are shown but not actually claimed. */
  preview?: boolean;
  /** Coins this quest added to your purse. */
  coinsEarned?: number;
  /** A reward's own quest: "Reward Complete!" and no reward picker. */
  isReward?: boolean;
  onClose: () => void;
};

/** Memoised: the XP count re-renders every frame, the specks shouldn't. */
const Dust = memo(function Dust({ items, mode }: { items: Speck[]; mode: "center" | "pct" | "px" }) {
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
});

export function QuestComplete(props: QuestCompleteProps) {
  const { title, description, tag, questXp, level, xpIntoLevel, xpForNextLevel, iconSrc = "/design/icon-dragon.jpg", avatarSrc = "/design/avatar-ranger.jpg", taskId = null, preview = false, coinsEarned = 0, isReward = false, onClose } = props;
  const [phase, setPhase] = useState<"celebrate" | "rewards">("celebrate");
  const [chest, setChest] = useState<{ rewards: Reward[]; coins: number } | null>(null);
  const [claimed, setClaimed] = useState<Reward | null>(null);
  // Picked, waiting for "receive now" or "add to my list".
  const [choosing, setChoosing] = useState<Reward | null>(null);
  const [received, setReceived] = useState<{ bonusXp: number; bonusCoins: number } | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claiming, startClaim] = useTransition();

  function openChest() {
    setPhase("rewards");
    if (chest === null) {
      listAvailableRewardsAction()
        .then(setChest)
        .catch(() => setChest({ rewards: [], coins: 0 }));
    }
  }

  function claim(r: Reward, now: boolean) {
    setClaimError(null);
    startClaim(async () => {
      try {
        if (!preview) {
          const res = await claimRewardAction(r.id, taskId, { now });
          setChest((c) => (c ? { ...c, coins: res.coins } : c));
          if (res.received) {
            setReceived({ bonusXp: res.bonusXp, bonusCoins: res.bonusCoins });
            if (res.bonusXp > 0 || res.bonusCoins > 0)
              celebrateReward({ title: r.title, iconSrc: r.icon_key?.startsWith("/") || r.icon_key?.startsWith("http") ? r.icon_key : null, xp: res.bonusXp, coins: res.bonusCoins, totalXp: res.totalXp });
          }
        } else if (now) {
          setReceived({ bonusXp: r.bonus_xp ?? 0, bonusCoins: r.bonus_coins ?? 0 });
        }
        setChoosing(null);
        setClaimed(r);
      } catch (e) {
        setClaimError(e instanceof Error ? e.message : "Couldn't claim that one.");
      }
    });
  }
  // Only ever mounted client-side (after a user action), so localStorage is readable up front.
  const [fx] = useState<FxSettings>(() => loadFx());
  // Light: just the essentials, at once. Balanced: fast, sparkles after. Full: everything, unhurried.
  const [tier] = useState(() => effectsTier(fx));
  const lite = tier === "light";
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [undoing, startUndo] = useTransition();
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
        // Even a small quest gets a good long fill to watch.
        const dur = Math.max(2600, fx.fill * 1000 * (fx.pace ?? 1));
        setPlaying(true);
        const tick = (now: number) => {
          const v = Math.min(1, (now - start) / dur);
          setP(v);
          if (v < 1) raf.current = requestAnimationFrame(tick);
          // Let the sparkles linger well after the bar fills.
          else timers.current.push(setTimeout(() => setPlaying(false), 6500));
        };
        raf.current = requestAnimationFrame(tick);
      }, tier === "full" ? 1250 : tier === "balanced" ? 550 : 300)
    );
    return stop;
  }, [reduce, fx.fill, stop, tier]);

  useEscape(() => {
    if (!editTask) onClose();
  });

  const eased = 1 - Math.pow(1 - p, 3);
  const gained = Math.round(questXp * eased);
  // The bar shows the last `questXp` XP filling into the current level.
  const start = Math.max(0, xpIntoLevel - questXp);
  const span = Math.max(1, xpIntoLevel - start);
  const cur = start + span * eased;
  const max = xpForNextLevel ?? Math.max(1, xpIntoLevel);
  const pct = Math.min(100, (cur / max) * 100);
  const spark = playing ? 1 : 0;

  const icon0 = useMemo(() => (fx.fxAvatar && !lite ? ringDust(fx, "icon") : []), [fx, lite]);
  const char0 = useMemo(() => (fx.fxAvatar && !lite ? ringDust(fx, "char") : []), [fx, lite]);
  const card0 = useMemo(() => (fx.fxCard && !lite ? cardDust(fx) : []), [fx, lite]);
  const pctBucket = Math.round(pct / 2) * 2;
  const bar0 = useMemo(() => (lite ? [] : barDust(fx, pctBucket)), [fx, pctBucket, lite]);
  const puff0 = useMemo(() => (lite ? [] : puffDust(fx)), [fx, lite]);
  const amb = useMemo(() => (lite ? [] : embers(fx)), [fx, lite]);


  // Editing replaces the celebration (it comes back when the editor closes),
  // so the two never draw over each other.
  if (editTask) return <QuestEditorDialog mode={{ kind: "edit", task: editTask }} theme="adventure" onClose={() => setEditTask(null)} />;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quest complete"
      className={`fixed inset-0 z-50 overflow-hidden ${tier === "full" ? "" : "qc-fast"} ${lite ? "qc-lite" : ""}`}
      style={{ fontFamily: "var(--font-eb-garamond), 'EB Garamond', Georgia, serif", backgroundColor: "#232b22", backgroundImage: "url(/design/bg-forest.jpg)", backgroundSize: "cover", backgroundPosition: "top center" }}
    >
      <div className="qc-overlay absolute inset-0" style={{ background: "rgba(9,13,8,.84)" }} />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        title="Close"
        className="absolute left-[max(10px,env(safe-area-inset-left))] top-[max(10px,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full text-[28px] leading-none"
        style={{ color: "#efe6cc", background: "rgba(20,26,18,.55)", border: "1px solid rgba(217,180,95,.45)" }}
      >
        ×
      </button>
      {/* Its mirror on the right: how big the celebration is, in Settings. */}
      {!preview && (
        <SettingsGear
          to="visual-effects.celebrations"
          label="Celebration settings"
          tone="night"
          size={44}
          beforeOpen={onClose}
          className="absolute right-[max(10px,env(safe-area-inset-right))] top-[max(10px,env(safe-area-inset-top))] z-20"
        />
      )}

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
              {received ? "Reward Received!" : isReward ? "Reward Complete!" : "Quest Complete!"}
            </h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design/ui-leaf.png" alt="" className="h-5 w-[26px] shrink-0 -scale-x-100" />
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(217,180,95,.6), rgba(217,180,95,0))" }} />
          </div>

          {phase === "rewards" ? (
            <RewardChest
              questTitle={title}
              rewards={chest?.rewards ?? null}
              coins={chest?.coins ?? 0}
              error={claimError}
              claimed={claimed}
              received={received}
              choosing={choosing}
              claiming={claiming}
              onPick={setChoosing}
              onDecide={claim}
              onContinue={onClose}
              onAnother={() => {
                setClaimed(null);
                setReceived(null);
                setChoosing(null);
                // Fresh from the chest: what's left and the purse after that one.
                listAvailableRewardsAction()
                  .then(setChest)
                  .catch(() => {});
              }}
            />
          ) : (
          <>
          {/* Featured quest card */}
          <div
            className="qc-card relative box-border w-full rounded-xl px-4 pb-4 pt-3.5"
            style={{ border: "2px solid #d9b45f", backgroundColor: "#e2caa2", backgroundImage: "url(/design/tex-parchment-2.jpg)", backgroundSize: "384px 384px" }}
          >
            <div className="qc-fade pointer-events-none absolute inset-0" style={{ opacity: spark }}>
              <Dust items={card0} mode="pct" />
            </div>
            {taskId && !preview && (
              <button
                type="button"
                onClick={async () => {
                  const t = await getQuestForEditAction(taskId).catch(() => null);
                  if (t) setEditTask(t);
                }}
                aria-label="Edit this quest"
                title="Edit this quest"
                className="qc-edit absolute right-2 top-2 z-[7] flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: "rgba(255,248,230,.92)", border: "1px solid #b39a6a", color: "#2f2a1f", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                  <path d="M13.5 7l3 3" stroke="currentColor" strokeWidth="1.9" />
                </svg>
              </button>
            )}
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
                <h2 className={`m-0 break-words ${title.length > 48 ? "text-[18px]" : "text-[22px]"} font-bold leading-[1.1]`} style={{ color: "#2f2a1f" }}>{title}</h2>
                {description && (
                  <div className={`${description.length > 140 ? "text-[13.5px]" : "text-[15px]"} leading-[1.22]`} style={{ color: "#6b6252" }}>
                    {description}
                  </div>
                )}
              </div>

              <div className="w-px shrink-0" style={{ background: "#b9a47c" }} />

              <div className="relative flex w-[66px] shrink-0 flex-col items-center justify-center gap-0.5">
                {/* The quest's own XP stays put; only the level bar below fills. */}
                <span className="text-base font-bold leading-none" style={{ color: "#4f6d3c" }}>XP</span>
                <span className="text-[38px] font-bold leading-none tabular-nums" style={{ color: "#4f6d3c" }}>{questXp}</span>
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
              {coinsEarned > 0 && (
                <div className="flex items-center justify-center gap-1.5 text-[15px] font-semibold tabular-nums" style={{ color: "#f2d27e" }}>
                  <CoinIcon size={17} />+{Math.round(coinsEarned * eased)} coin{coinsEarned === 1 ? "" : "s"}
                </div>
              )}
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
              onClick={openChest}
              className={`min-h-14 flex-1 cursor-pointer rounded-[14px] px-2 font-bold leading-[1.05] tracking-[.01em] ${isReward ? "text-[17px]" : "text-[19px]"}`}
              style={{ border: "3px solid #31301e", background: "radial-gradient(circle at 32% 28%, #f2c96a, #d9b45f 55%, #a88a3f)", color: "#2a1c10", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5), inset 0 -3px 5px rgba(0,0,0,.25), 0 6px 14px rgba(0,0,0,.45)" }}
            >
              {isReward ? "Receive another reward" : "Choose a Reward"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-14 flex-1 cursor-pointer rounded-[14px] px-2 text-[17px] font-bold leading-[1.05] tracking-[.01em]"
              style={{ border: "2px solid #d9b45f", background: "linear-gradient(180deg,#3b4636,#232c22)", color: "#efe6cc", boxShadow: "inset 0 1px 0 rgba(255,235,180,.2), 0 6px 14px rgba(0,0,0,.45)" }}
            >
              Continue Your Journey
            </button>
          </div>
          {/* Completed by mistake? Take it back: the quest returns open and its XP and coins come back out. */}
          {taskId && !preview && (
            <button
              type="button"
              disabled={undoing}
              onClick={() =>
                startUndo(async () => {
                  await reopenTaskAction(taskId).catch(() => {});
                  onClose();
                })
              }
              className="-mt-1 cursor-pointer text-[13.5px] underline underline-offset-2 disabled:opacity-50"
              style={{ color: "#d9c79a" }}
            >
              {undoing ? "Undoing…" : "Not done yet? Undo this completion"}
            </button>
          )}
          </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** The treasure chest inside the celebration: pick one reward, or move on. */
function RewardChest({
  questTitle,
  rewards,
  coins,
  error,
  claimed,
  received,
  choosing,
  claiming,
  onPick,
  onDecide,
  onContinue,
  onAnother,
}: {
  questTitle: string;
  rewards: Reward[] | null;
  coins: number;
  error: string | null;
  claimed: Reward | null;
  received: { bonusXp: number; bonusCoins: number } | null;
  choosing: Reward | null;
  claiming: boolean;
  onPick: (r: Reward | null) => void;
  onDecide: (r: Reward, now: boolean) => void;
  onContinue: () => void;
  /** Back to the chest for another one. */
  onAnother: () => void;
}) {
  const parchment: React.CSSProperties = {
    border: "2px solid #d9b45f",
    backgroundColor: "#e2caa2",
    backgroundImage: "url(/design/tex-parchment-2.jpg)",
    backgroundSize: "384px 384px",
    boxShadow: "inset 0 0 0 1px rgba(255,240,210,.55), 0 10px 24px rgba(0,0,0,.5)",
  };

  if (claimed) {
    return (
      <div className="qc-card flex w-full flex-col items-center gap-3 rounded-2xl px-5 py-6 text-center" style={parchment}>
        <div className="card-pop-in h-28 w-28 overflow-hidden rounded-full" style={{ border: "3px solid #d9b45f", boxShadow: "0 0 0 4px rgba(217,180,95,.35), 0 0 24px rgba(242,201,106,.6)", background: "#f3e6c8" }}>
          {claimed.icon_key ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated portrait
            <img src={claimed.icon_key} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center"><DiamondIcon size={56} /></span>
          )}
        </div>
        <p className="m-0 text-[26px] font-bold leading-tight" style={{ color: "#2f2a1f" }}>
          {claimed.title}
        </p>
        {received ? (
          <>
            <p className="m-0 text-[15px]" style={{ color: "#6b6252" }}>
              Earned by “{questTitle}”.
            </p>
            {(received.bonusXp > 0 || received.bonusCoins > 0) && (
              <p className="m-0 flex items-center gap-2 text-[16px] font-bold tabular-nums" style={{ color: "#4f6d3c" }}>
                {received.bonusXp > 0 && <span>+{received.bonusXp} XP</span>}
                {received.bonusCoins > 0 && (
                  <span className="flex items-center gap-1" style={{ color: "#8a6116" }}>
                    <CoinIcon size={16} />+{received.bonusCoins}
                  </span>
                )}
              </p>
            )}
          </>
        ) : (
          <p className="m-0 text-[15px]" style={{ color: "#6b6252" }}>
            Added to your list — earned by “{questTitle}”. It&apos;s waiting in Today&apos;s Quests; complete it once you&apos;ve had it.
          </p>
        )}
        <div className="mt-2 flex w-full gap-2.5">
          <button
            type="button"
            onClick={onAnother}
            className="min-h-12 flex-1 cursor-pointer rounded-[14px] px-2 text-[16px] font-bold leading-[1.1]"
            style={{ border: "2px solid #d9b45f", background: "linear-gradient(180deg,#3b4636,#232c22)", color: "#efe6cc", boxShadow: "inset 0 1px 0 rgba(255,235,180,.2), 0 6px 14px rgba(0,0,0,.35)" }}
          >
            Receive another reward
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="min-h-12 flex-1 cursor-pointer rounded-[14px] px-2 text-[17px] font-bold leading-[1.1]"
            style={{ border: "2px solid #31301e", background: "radial-gradient(circle at 32% 28%, #f2c96a, #d9b45f 55%, #a88a3f)", color: "#2a1c10", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5), 0 6px 14px rgba(0,0,0,.35)" }}
          >
            Continue Your Journey
          </button>
        </div>
      </div>
    );
  }

  if (choosing) {
    return (
      <div className="qc-card flex w-full flex-col items-center gap-3 rounded-2xl px-5 py-6 text-center" style={parchment}>
        <div className="card-pop-in h-24 w-24 overflow-hidden rounded-full" style={{ border: "3px solid #d9b45f", boxShadow: "0 0 0 4px rgba(217,180,95,.35)", background: "#f3e6c8" }}>
          {choosing.icon_key ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated portrait
            <img src={choosing.icon_key} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center"><DiamondIcon size={48} /></span>
          )}
        </div>
        <p className="m-0 text-[24px] font-bold leading-tight" style={{ color: "#2f2a1f" }}>
          {choosing.title}
        </p>
        <p className="m-0 text-[14.5px]" style={{ color: "#6b6252" }}>
          Having it right now, or saving it for later?
        </p>
        {error && (
          <p className="m-0 text-[14.5px] font-semibold" style={{ color: "#8c3b2a" }}>
            {error}
          </p>
        )}
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={claiming}
            onClick={() => onDecide(choosing, true)}
            className="min-h-12 flex-1 cursor-pointer rounded-[14px] px-3 text-[17px] font-bold disabled:opacity-60"
            style={{ border: "2px solid #31301e", background: "radial-gradient(circle at 32% 28%, #f2c96a, #d9b45f 55%, #a88a3f)", color: "#2a1c10", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5), 0 6px 14px rgba(0,0,0,.35)" }}
          >
            Receive it now
          </button>
          <button
            type="button"
            disabled={claiming}
            onClick={() => onDecide(choosing, false)}
            className="min-h-12 flex-1 cursor-pointer rounded-[14px] px-3 text-[16px] font-bold disabled:opacity-60"
            style={{ border: "2px solid #d9b45f", background: "linear-gradient(180deg,#3b4636,#232c22)", color: "#efe6cc" }}
          >
            Add it to my list
          </button>
        </div>
        <button type="button" onClick={() => onPick(null)} className="text-[14px] underline" style={{ color: "#6b6252" }}>
          Pick a different one
        </button>
      </div>
    );
  }

  return (
    <div className="qc-card flex w-full flex-col gap-4 rounded-2xl px-4 pb-4 pt-5" style={parchment}>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="m-0 text-[24px] font-bold leading-tight" style={{ color: "#2f2a1f" }}>
          Choose Your Reward
        </p>
        <p className="m-0 text-[14.5px]" style={{ color: "#6b6252" }}>
          Accept one treasure with your coins, or save them and keep going.
        </p>
        <span
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] font-semibold tabular-nums"
          style={{ background: "rgba(42,28,16,.82)", color: "#f2d27e", border: "1.5px solid #a88a3f" }}
        >
          <CoinIcon size={17} /> {coins} in your purse
        </span>
      </div>
      {error && (
        <p className="m-0 text-center text-[14.5px] font-semibold" style={{ color: "#8c3b2a" }}>
          {error}
        </p>
      )}

      {rewards === null && (
        <p className="m-0 py-6 text-center text-[15px]" style={{ color: "#6b6252" }}>
          Opening the chest…
        </p>
      )}
      {rewards && rewards.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="m-0 text-[15px]" style={{ color: "#6b6252" }}>
            Your treasure chest is empty.
          </p>
          <Link href="/rewards" onClick={onContinue} className="text-[15px] font-semibold underline" style={{ color: "#4f6d3c" }}>
            Add some rewards
          </Link>
        </div>
      )}
      {rewards && rewards.length > 0 && (
        <div className="grid max-h-[46vh] grid-cols-2 gap-2.5 overflow-y-auto p-0.5 sm:grid-cols-3">
          {rewards.map((r) => {
            const cost = r.cost_coins ?? 0;
            const short = Math.max(0, cost - coins);
            return (
            <button
              key={r.id}
              type="button"
              disabled={claiming || short > 0}
              title={short > 0 ? `${short} more coin${short === 1 ? "" : "s"} needed` : undefined}
              onClick={() => onPick(r)}
              className="reward-tile flex cursor-pointer flex-col items-center gap-2 rounded-xl px-2 pb-2.5 pt-3 text-center disabled:opacity-60"
              style={{ border: "1.5px solid #b39a6a", background: "rgba(255,248,232,.55)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.6), 0 2px 5px rgba(0,0,0,.12)" }}
            >
              <span className="h-[68px] w-[68px] overflow-hidden rounded-full" style={{ border: "2px solid #a58c66", background: "#f3e6c8", boxShadow: "0 0 0 2px rgba(217,180,95,.4)" }}>
                {r.icon_key ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated portrait
                  <img src={r.icon_key} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center"><DiamondIcon size={34} /></span>
                )}
              </span>
              <span className="text-[14.5px] font-semibold leading-tight" style={{ color: "#2f2a1f" }}>
                {r.title}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-px text-[13px] font-semibold tabular-nums"
                style={{ background: short > 0 ? "rgba(107,98,82,.15)" : "rgba(42,28,16,.8)", color: short > 0 ? "#6b6252" : "#f2d27e" }}
              >
                <CoinIcon size={14} />
                {cost === 0 ? "Free" : cost}
                {short > 0 && <span className="font-normal"> · need {short}</span>}
              </span>
            </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onContinue}
        className="min-h-12 w-full cursor-pointer rounded-[14px] text-[16px] font-bold"
        style={{ border: "2px solid #d9b45f", background: "linear-gradient(180deg,#3b4636,#232c22)", color: "#efe6cc", boxShadow: "inset 0 1px 0 rgba(255,235,180,.2), 0 4px 10px rgba(0,0,0,.35)" }}
      >
        Continue to the next quest
      </button>
    </div>
  );
}
