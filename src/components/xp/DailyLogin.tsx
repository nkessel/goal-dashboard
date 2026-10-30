"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dailyCheckInAction, welcomeContextAction } from "@/app/actions";
import { eveningDayKey } from "@/components/evening/evening-clock";
import { WelcomeCard, type WelcomeAward } from "./WelcomeCard";
import { xpToNextLevel } from "@/lib/levels";
import { lineForDay } from "@/lib/greetings";
import { backGreeting, backHours, linesOf, ownLines, pickFor } from "@/lib/welcome";
import { voice } from "@/lib/toucan-style";
import { readStyle } from "@/lib/toucan-style-store";
import { loadFx } from "@/lib/celebration-fx";
import { fogOn, liftFog } from "@/lib/welcome-fog";

/** The day's first greeting: a small cheer for arriving, in the realm's voice (a different one each day). */
const HEADINGS = {
  morning: ["Huzzah! The day's first step is taken", "Here you are, bright and early!", "The sun rose, and so did you!", "Look who's here at first light!"],
  day: ["Huzzah! Here you are!", "The realm rejoices: you've arrived!", "And there you are, right on time!", "Hail, traveller! You made it!", "Trumpets, please: you're here!"],
  evening: ["Here you are, even now. Huzzah!", "The lanterns are lit for your arrival!", "You came, and the evening is brighter for it!", "Look who walked through the door tonight!"],
};
function dawnHeading(dayKey: string) {
  const fx = loadFx();
  if (fx.welcomeHeading === "dawn") return "A new day dawns, adventurer";
  // Your own words: one per line, taking turns day by day.
  const own = linesOf(fx.welcomeText);
  if (fx.welcomeHeading === "custom" && own.length) return pickFor(dayKey, own);
  const h = new Date().getHours();
  const list = h < 12 ? HEADINGS.morning : h < 17 ? HEADINGS.day : HEADINGS.evening;
  return pickFor(dayKey, list);
}

const BACK_KEY = "welcome-back-at";
/** The day's open check-in screen: it comes back on each visit until you check in or close it. */
const PENDING_KEY = "welcome-pending";
/**
 * `until`: snoozed, so it waits until then. `kept`: you checked in here or
 * stepped away from it (to the toucan, or another page), so it stays until you
 * say you're ready. `away`: the page you left it on, where it comes back.
 */
type Pending = { day: string; mode: "day" | "back"; at: number; until?: number; kept?: boolean; away?: string };
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

type Shown = { mode: "day" | "back"; award: WelcomeAward | null; ctx: Awaited<ReturnType<typeof welcomeContextAction>> };

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
  const [shown, setShown] = useState<Shown | null>(null);
  // A snooze that ends while the app is still open brings it back then.
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
      if (p) setPending({ ...p, kept: true, away: here });
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
      const ctxP = welcomeContextAction().catch(() => ({ metrics: [] as string[], lastCheckInAt: null as string | null, tasks: [] as { id: string; title: string; due_at: string | null }[], suggestions: [] as { id: string; title: string; due_at: string | null }[], priority: null }));
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
        const r = await dailyCheckInAction(new Date().getTimezoneOffset()).catch(() => null);
        let award: WelcomeAward | null = null;
        if (r && !r.alreadyCheckedInToday && r.xpAwarded > 0) {
          const total = r.award?.totalXp ?? null;
          let fromPct = 0;
          let toPct = 100;
          let caption = `${r.streakCount}-day streak`;
          if (total !== null) {
            const after = xpToNextLevel(total, levelCap);
            const before = xpToNextLevel(Math.max(0, total - r.xpAwarded), levelCap);
            if (after.xpForNextLevel) {
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
        setShown({ mode: "day", award, ctx });
        if (award) router.refresh();
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
  }, [router, levelCap]);

  if (!shown) return null;
  const fx = loadFx();
  const key = shown.mode === "day" ? eveningDayKey() : `${eveningDayKey()}:${new Date().getHours()}`;
  return (
    <WelcomeCard
      mode={shown.mode}
      heading={shown.mode === "day" ? dawnHeading(eveningDayKey()) : backGreeting(fx, key)}
      award={shown.award}
      line={lineForDay(eveningDayKey(), ownLines(fx))}
      metrics={shown.ctx.metrics}
      lastCheckInAt={shown.ctx.lastCheckInAt}
      due={shown.ctx.tasks}
      priority={shown.ctx.priority}
      fx={fx}
      // Checked in: it stays until you say you're ready, even if you step away first.
      onCheckedIn={() => {
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
