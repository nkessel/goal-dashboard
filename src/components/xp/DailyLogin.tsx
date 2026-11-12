"use client";

import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dailyCheckInAction, welcomeContextAction } from "@/app/actions";
import { eveningDayKey, isEveningCheckInTime, setEveningMode } from "@/components/evening/evening-clock";
import type { WelcomeAward } from "./WelcomeCard";
import dynamic from "next/dynamic";

// The welcome screen is a big piece of code needed once a day: it loads on its own (started as soon as
// it's due, behind the mist) instead of with every screen's first JavaScript (owner, Nov 12: "load faster").
const loadWelcome = () => import("./WelcomeCard").then((m) => m.WelcomeCard);
const WelcomeCard = dynamic(loadWelcome, { ssr: false });

type WelcomeCtx = Awaited<ReturnType<typeof welcomeContextAction>>;
type WelcomeStart = { ctx: WelcomeCtx | null; checkin: Awaited<ReturnType<typeof dailyCheckInAction>> | null; first: boolean } | null;
/** The welcome screen's data and the day's login in one plain request (not queued behind other server actions). */
function askWelcome(first: boolean): Promise<WelcomeStart> {
  return fetch(`/api/welcome?first=${first ? 1 : 0}&tz=${new Date().getTimezoneOffset()}`, { method: "POST", credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<WelcomeStart>) : null))
    .catch(() => null);
}
/** The request the page's first script already sent (see FOG_SCRIPT), taken once. */
function takeEarly(first: boolean): Promise<WelcomeStart> | null {
  const w = window as unknown as { __wpre?: { first: boolean; at: number; p: Promise<WelcomeStart> } | null };
  const pre = w.__wpre;
  w.__wpre = null;
  if (!pre || pre.first !== first || Date.now() - pre.at > 120_000) return null;
  return pre.p;
}
import { xpToNextLevel } from "@/lib/levels";
import { lineForDay } from "@/lib/greetings";
import { backHours, greetingFor, ownLines } from "@/lib/welcome";
import { voice } from "@/lib/toucan-style";
import { readStyle } from "@/lib/toucan-style-store";
import { loadFx, subscribeFx } from "@/lib/celebration-fx";
import { clearFog, fogOn, liftFog, welcomeDue } from "@/lib/welcome-fog";

const BACK_KEY = "welcome-back-at";
/** The day's open check-in screen: it comes back on each visit until you check in or close it. */
const PENDING_KEY = "welcome-pending";
/**
 * `until`: snoozed, so it waits until then. `kept`: you checked in here or
 * stepped away from it (to the toucan, or another page), so it stays until you
 * say you're ready. `away`: the page you left it on, where it comes back.
 */
type Pending = { day: string; mode: "day" | "back"; at: number; until?: number; kept?: boolean; away?: string; /** Tucked away as a sun bubble: shown that way on any page until opened. */ min?: boolean };
function readPending(today: string): Pending | null {
  try {
    const p = JSON.parse(window.localStorage.getItem(PENDING_KEY) || "null") as Pending | null;
    if (p && p.day === today && (p.mode === "day" || p.mode === "back")) return p;
    // Older flag for the day's greeting.
    if (window.localStorage.getItem("daily-login-open") === today) return { day: today, mode: "day", at: Date.now() };
  } catch {}
  return null;
}
function setPending(p: Pending | null) {
  try {
    window.localStorage.removeItem("daily-login-open");
    if (p) window.localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {}
}

function stampBack() {
  try {
    window.localStorage.setItem(BACK_KEY, String(Date.now()));
  } catch {}
}

type Shown = { mode: "day" | "back"; award: WelcomeAward | null; ctx: Awaited<ReturnType<typeof welcomeContextAction>>; seed?: string; min?: boolean };

/**
 * The welcome screen. On the day's first visit it records the daily check-in
 * (XP + streak) and greets you; when you're back after a few hours since your
 * last check-in, it says welcome back and offers a check-in (sleep times,
 * mood and the rest). Either one comes back on later visits that day until
 * you check in or close it. What it shows is chosen in Settings. The server
 * ignores repeat daily check-ins; the per-browser flags just avoid asking again.
 */
export function DailyLogin({ levelCap = 10 }: { levelCap?: number }) {
  const router = useRouter();
  const [shown, setShownRaw] = useState<Shown | null>(null);
  const setShown = (s: Shown | null) => setShownRaw(s && { ...s, seed: s.seed ?? `${Date.now()}:${Math.random()}` });
  // The mist comes first, always: before this page paints (arriving by a link inside the app,
  // where the page's own fog script doesn't run), fog it if the welcome screen is about to open.
  // Every path below that ends without the screen lifts it again.
  useLayoutEffect(() => {
    if (welcomeDue()) {
      fogOn(25_000);
      void loadWelcome();
    }
  }, []);
  // A snooze that ends while the app is still open brings it back then.
  // Settings changed (from its gear, say) show on the open screen straight away.
  const [, fxChanged] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeFx(fxChanged), []);
  const snoozeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(snoozeTimer.current), []);
  // Following a link away while it's open keeps it for when you come back to this page.
  const isOpen = useRef(false);
  useEffect(() => {
    isOpen.current = !!shown;
  }, [shown]);
  useEffect(() => {
    const here = window.location.pathname;
    return () => {
      if (!isOpen.current) return;
      const p = readPending(eveningDayKey());
      // Tucked away as the sun bubble: it follows you to every page instead.
      if (p) setPending(p.min ? { ...p, kept: true, away: undefined } : { ...p, kept: true, away: here });
    };
  }, []);

  // Coming back to the app (a phone waking it, a tab brought forward) checks again, behind the fog.
  const [wake, setWake] = useState(0);
  const shownNow = useRef(false);
  useEffect(() => {
    shownNow.current = !!shown;
  }, [shown]);
  useEffect(() => {
    const onVis = () => {
      if (shownNow.current) return;
      if (document.visibilityState === "hidden") {
        // On a phone, mist before leaving: the snapshot it shows when you come back is misty too
        // (cleared at once if nothing's due by then).
        if (window.matchMedia("(pointer: coarse)").matches) fogOn(60 * 60_000);
        return;
      }
      if (welcomeDue()) {
        fogOn(25_000);
        setWake((n) => n + 1);
      } else clearFog();
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && !shownNow.current && welcomeDue()) {
        fogOn(25_000);
        setWake((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  useEffect(() => {
    let live = true;
    // The app's day turns over at 5:30am local time.
    const today = eveningDayKey();
    let first = false;
    try {
      first = window.localStorage.getItem("daily-login") !== today;
      if (first) window.localStorage.setItem("daily-login", today);
    } catch {
      /* storage unavailable — the server still guards against double awards */
    }
    // Marked before anything loads, so closing the app early still brings it back.
    // Evening: no morning check-in. Your login still counts, and the toucan offers the evening
    // routine once tonight instead (owner, Nov 9: "prompt the user to do the evening check-in once
    // it's time for that instead of the morning check-in").
    if (isEveningCheckInTime()) {
      liftFog();
      setPending(null);
      if (first) dailyCheckInAction(new Date().getTimezoneOffset()).catch(() => {});
      let invited = true;
      try {
        invited = window.localStorage.getItem("evening-invited") === today;
        if (!invited) window.localStorage.setItem("evening-invited", today);
      } catch {}
      const t = invited
        ? undefined
        : window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("toucan-nudge", {
                cancelable: true,
                detail: {
                  text: "The day is winding down. Time for your evening check-in?",
                  actions: [
                    {
                      label: "Begin evening routine",
                      run: () => {
                        setEveningMode(true);
                        if (window.location.pathname !== "/") router.push("/");
                      },
                    },
                    { label: "Later", run: () => {} },
                  ],
                },
              })
            );
          }, 1500);
      return () => {
        live = false;
        window.clearTimeout(t);
      };
    }
    if (first) setPending({ day: today, mode: "day", at: Date.now() });
    const pending = first ? null : readPending(today);
    const markBack = () => {
      try {
        window.localStorage.setItem(BACK_KEY, String(Date.now()));
      } catch {}
    };
    const fx = loadFx();
    const hours = backHours(fx);
    const away = hours * 3_600_000;
    let backDue = false;
    try {
      backDue = !!hours && readStyle().returnCheckIn && Date.now() - Number(window.localStorage.getItem(BACK_KEY) || 0) >= away;
    } catch {}
    // Snoozed: nothing until the snooze is over (on a later visit, or right then if the app's still open).
    // Left on another page: it waits for you there.
    if (pending?.min) {
      liftFog();
      welcomeContextAction()
        .then((ctx) => live && setShown({ mode: pending.mode, award: null, ctx, min: true }))
        .catch(() => {});
      return () => {
        live = false;
      };
    }
    if (pending?.away && pending.away !== window.location.pathname) return liftFog();
    if (pending?.until && Date.now() < pending.until) {
      liftFog();
      const wait = pending.until - Date.now();
      if (wait > 6 * 3_600_000) return;
      const t = setTimeout(() => {
        welcomeContextAction()
          .then((ctx) => setShown({ mode: pending.mode, award: null, ctx }))
          .catch(() => {});
      }, wait);
      return () => {
        live = false;
        clearTimeout(t);
      };
    }
    if (!first && !backDue && !pending) return liftFog();
    // No surprise pop-ups: the toucan asks first, and the screen opens only if you say so ("Later" skips it).
    const present = (open: () => void) => {
      if (readStyle().avoid.includes("popups")) {
        const unseen = window.dispatchEvent(new CustomEvent("toucan-nudge", { cancelable: true, detail: { text: voice.welcomeBack(readStyle()), actions: [{ label: "Check in", run: open }, { label: "Later", run: () => setPending(null) }] } }));
        if (!unseen) return liftFog();
      }
      open();
    };
    (async () => {
      const start = takeEarly(first) ?? askWelcome(first);
      const ctxP = start.then((r) => r?.ctx ?? welcomeContextAction()).catch(() => ({ metrics: [] as string[], lastCheckInAt: null as string | null, tasks: [] as { id: string; title: string; due_at: string | null }[], suggestions: [] as { id: string; title: string; due_at: string | null }[], priority: null, streak: 0, totalXp: null as number | null, today: [] as { id: string; title: string; due_at: string | null }[] }));
      if (pending) {
        const ctx = await ctxP;
        if (!live) return;
        // Checked in somewhere else since it opened? Then it's done (unless you're coming back to it).
        if (!pending.kept && ctx.lastCheckInAt && Date.parse(ctx.lastCheckInAt) >= pending.at) return (setPending(null), liftFog());
        markBack();
        if (pending.away) setPending({ ...pending, away: undefined });
        if (pending.mode === "day" || pending.kept) setShown({ mode: pending.mode, award: null, ctx });
        else present(() => setShown({ mode: "back", award: null, ctx }));
        return;
      }
      if (first) {
        const early = await start;
        const r = early?.first && early.checkin ? early.checkin : await dailyCheckInAction(new Date().getTimezoneOffset()).catch(() => null);
        let award: WelcomeAward | null = null;
        if (r && !r.alreadyCheckedInToday && r.xpAwarded > 0) {
          const total = r.award?.totalXp ?? null;
          let fromPct = 0;
          let toPct = 100;
          let caption = `${r.streakCount}-day streak`;
          if (total !== null) {
            const after = xpToNextLevel(total, levelCap);
            const before = xpToNextLevel(Math.max(0, total - r.xpAwarded), levelCap);
            if (after.heldByBoss) {
              fromPct = toPct = 100;
              caption = `Level ${after.level} · ${total} XP · the boss guards level ${after.nextLevel}`;
            } else if (after.xpForNextLevel) {
              toPct = Math.round((after.xpIntoLevel / after.xpForNextLevel) * 100);
              fromPct = before.level === after.level && before.xpForNextLevel ? Math.round((before.xpIntoLevel / before.xpForNextLevel) * 100) : 0;
              caption = `Level ${after.level} · ${after.xpIntoLevel} / ${after.xpForNextLevel} XP to level ${after.nextLevel}`;
            } else caption = `Level ${after.level} · max level`;
          }
          award = { xp: r.xpAwarded, streak: r.streakCount, coins: r.award?.coinsEarned ?? 0, fromPct, toPct, caption };
        }
        // The day's first visit here always greets you (with last night's sleep, if it isn't logged yet).
        const ctx = await ctxP;
        if (!live) return;
        markBack();
        // (No refresh here: Today re-rendering under the welcome screen only slowed it; it refreshes on close.)
        setShown({ mode: "day", award, ctx });
        return;
      }
      // Welcome back: a few hours since your last check-in (and since this screen last came up).
      if (!backDue) return liftFog();
      const ctx = await ctxP;
      if (!live) return;
      if (ctx.lastCheckInAt && Date.now() - Date.parse(ctx.lastCheckInAt) < away) return liftFog();
      markBack();
      present(() => {
        setPending({ day: today, mode: "back", at: Date.now() });
        setShown({ mode: "back", award: null, ctx });
      });
    })();
    return () => {
      live = false;
    };
  }, [router, levelCap, wake]);

  if (!shown) return null;
  const fx = loadFx();
  // A fresh greeting each time the screen opens (kept while it's open).
  const key = shown.seed ?? eveningDayKey();
  // No XP just now (a later visit): still show your streak and how far you are into the level.
  const standing: WelcomeAward | null = (() => {
    if (shown.award) return shown.award;
    const total = shown.ctx.totalXp;
    const streak = shown.ctx.streak ?? 0;
    if (total == null && !streak) return null;
    let pct = 0;
    let caption = "";
    if (total != null) {
      const at = xpToNextLevel(total, levelCap);
      pct = at.xpForNextLevel ? Math.min(100, Math.round((at.xpIntoLevel / at.xpForNextLevel) * 100)) : 100;
      caption = at.heldByBoss ? `Level ${at.level} · ${total} XP · the boss guards level ${at.nextLevel}` : at.xpForNextLevel ? `Level ${at.level} · ${at.xpIntoLevel} / ${at.xpForNextLevel} XP to level ${at.nextLevel}` : `Level ${at.level} · max level`;
    }
    return { xp: 0, streak, coins: 0, fromPct: pct, toPct: pct, caption };
  })();
  return (
    <WelcomeCard
      mode={shown.mode}
      heading={greetingFor(fx, key)}
      award={standing}
      line={lineForDay(eveningDayKey(), ownLines(fx))}
      metrics={shown.ctx.metrics}
      lastCheckInAt={shown.ctx.lastCheckInAt}
      due={shown.ctx.tasks}
      today={shown.ctx.today ?? []}
      startMinimized={!!shown.min}
      onMinimize={(m) => {
        const today = eveningDayKey();
        setPending({ ...(readPending(today) ?? { day: today, mode: shown.mode, at: Date.now() }), kept: true, away: undefined, min: m });
      }}
      priority={shown.ctx.priority}
      fx={fx}
      // Checked in: it stays until you say you're ready, even if you step away first.
      onCheckedIn={() => {
        stampBack();
        const today = eveningDayKey();
        setPending({ ...(readPending(today) ?? { day: today, mode: shown.mode }), at: Date.now() + 60_000, kept: true });
      }}
      onSnooze={(ms) => {
        const today = eveningDayKey();
        setPending({ ...(readPending(today) ?? { day: today, mode: shown.mode, at: Date.now() }), until: Date.now() + ms });
        const again = shown;
        setShown(null);
        clearTimeout(snoozeTimer.current);
        if (ms <= 6 * 3_600_000) snoozeTimer.current = setTimeout(() => setShown(again), ms);
      }}
      onClose={() => {
        // The next "welcome back" counts from now, so one screen never follows straight on from another.
        stampBack();
        isOpen.current = false;
        setPending(null);
        setShown(null);
        router.refresh();
      }}
      // On to Today: through the fog if it's another page.
      toToday={() => {
        if (window.location.pathname === "/") return;
        fogOn();
        router.push("/");
      }}
    />
  );
}
