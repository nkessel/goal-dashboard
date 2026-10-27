"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dailyCheckInAction, welcomeContextAction } from "@/app/actions";
import { eveningDayKey } from "@/components/evening/evening-clock";
import { WelcomeCard, type WelcomeAward } from "./WelcomeCard";
import { xpToNextLevel } from "@/lib/levels";
import { lineForDay } from "@/lib/greetings";
import { backGreeting, backHours, linesOf, pickFor } from "@/lib/welcome";
import { voice } from "@/lib/toucan-style";
import { readStyle } from "@/lib/toucan-style-store";
import { loadFx } from "@/lib/celebration-fx";

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

type Shown = { mode: "day" | "back"; award: WelcomeAward | null; ctx: Awaited<ReturnType<typeof welcomeContextAction>> };

/**
 * The welcome screen. On the day's first visit it records the daily check-in
 * (XP + streak) and greets you; when you're back after a few hours since your
 * last check-in, it says welcome back and offers a check-in (sleep times,
 * mood and the rest). What it shows is chosen in Settings. The server ignores
 * repeat daily check-ins; the per-browser flags just avoid asking again.
 */
export function DailyLogin({ levelCap = 10 }: { levelCap?: number }) {
  const router = useRouter();
  const [shown, setShown] = useState<Shown | null>(null);

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
    if (!first && !backDue) return;
    (async () => {
      const ctxP = welcomeContextAction().catch(() => ({ metrics: [] as string[], lastCheckInAt: null as string | null, tasks: [] as { id: string; title: string; due_at: string | null }[], suggestions: [] as { id: string; title: string; due_at: string | null }[] }));
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
      if (!backDue) return;
      const ctx = await ctxP;
      if (!live) return;
      if (ctx.lastCheckInAt && Date.now() - Date.parse(ctx.lastCheckInAt) < away) return;
      markBack();
      const open = () => setShown({ mode: "back", award: null, ctx });
      // No surprise pop-ups: the toucan asks first, and the screen opens only if you say so.
      if (readStyle().avoid.includes("popups")) {
        const unseen = window.dispatchEvent(new CustomEvent("toucan-nudge", { cancelable: true, detail: { text: voice.welcomeBack(readStyle()), actions: [{ label: "Check in", run: open }, { label: "Later", run: () => {} }] } }));
        if (!unseen) return;
      }
      open();
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
      line={lineForDay(eveningDayKey(), linesOf(fx.welcomeOwnLines))}
      metrics={shown.ctx.metrics}
      lastCheckInAt={shown.ctx.lastCheckInAt}
      due={shown.ctx.tasks}
      suggestions={shown.ctx.suggestions}
      fx={fx}
      onClose={() => (setShown(null), router.refresh())}
    />
  );
}
