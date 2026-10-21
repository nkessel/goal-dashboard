"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dailyCheckInAction } from "@/app/actions";
import { eveningDayKey } from "@/components/evening/evening-clock";
import { ProgressCelebration } from "@/components/celebration/ProgressCelebration";
import { xpToNextLevel } from "@/lib/levels";
import { lineForDay, retireLine } from "@/lib/greetings";

/** The day's first greeting: a small cheer for arriving, in the realm's voice (a different one each day). */
const HEADINGS = {
  morning: ["Huzzah! The day's first step is taken", "Here you are, bright and early!", "The sun rose, and so did you!", "Look who's here at first light!"],
  day: ["Huzzah! Here you are!", "The realm rejoices: you've arrived!", "And there you are, right on time!", "Hail, traveller! You made it!", "Trumpets, please: you're here!"],
  evening: ["Here you are, even now. Huzzah!", "The lanterns are lit for your arrival!", "You came, and the evening is brighter for it!", "Look who walked through the door tonight!"],
};
function dawnHeading(dayKey: string) {
  const h = new Date().getHours();
  const list = h < 12 ? HEADINGS.morning : h < 17 ? HEADINGS.day : HEADINGS.evening;
  let n = 0;
  for (const c of dayKey) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return list[n % list.length];
}

type Award = { xp: number; streak: number; coins: number; fromPct: number; toPct: number; caption: string };

/**
 * First visit of the day: records the daily check-in (XP + streak) and plays
 * the same party as other XP gains — confetti, the level bar filling, the XP
 * counting up. The server ignores repeat check-ins the same day; the
 * per-browser flag just avoids asking again on every screen.
 */
export function DailyLogin() {
  const router = useRouter();
  const [award, setAward] = useState<Award | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [retired, setRetired] = useState(false);

  useEffect(() => {
    // The app's day turns over at 5:30am local time.
    const today = eveningDayKey();
    try {
      if (window.localStorage.getItem("daily-login") === today) return;
      window.localStorage.setItem("daily-login", today);
    } catch {
      /* storage unavailable — the server still guards against double awards */
    }
    dailyCheckInAction(new Date().getTimezoneOffset())
      .then((r) => {
        if (r.alreadyCheckedInToday || r.xpAwarded <= 0) return;
        const total = r.award?.totalXp ?? null;
        let fromPct = 0;
        let toPct = 100;
        let caption = `${r.streakCount}-day streak`;
        if (total !== null) {
          const after = xpToNextLevel(total);
          const before = xpToNextLevel(Math.max(0, total - r.xpAwarded));
          if (after.xpForNextLevel) {
            toPct = Math.round((after.xpIntoLevel / after.xpForNextLevel) * 100);
            fromPct = before.level === after.level && before.xpForNextLevel ? Math.round((before.xpIntoLevel / before.xpForNextLevel) * 100) : 0;
            caption = `Level ${after.level} · ${after.xpIntoLevel} / ${after.xpForNextLevel} XP to level ${after.nextLevel}`;
          } else caption = `Level ${after.level} · max level`;
        }
        setLine(lineForDay(today));
        setAward({ xp: r.xpAwarded, streak: r.streakCount, coins: r.award?.coinsEarned ?? 0, fromPct, toPct, caption });
        router.refresh();
      })
      .catch(() => {});
  }, [router]);

  if (!award) return null;
  return (
    <ProgressCelebration
      heading={dawnHeading(eveningDayKey())}
      title={award.streak > 1 ? `🔥 ${award.streak}-day streak — keep it going` : "Day one of a new streak"}
      xp={award.xp}
      coinsEarned={award.coins}
      fromPct={award.fromPct}
      toPct={award.toPct}
      barCaption={award.caption}
      extra={
        line ? (
          <div className="mt-1 flex w-full flex-col items-center gap-1.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <p className={`m-0 text-[16px] leading-snug ${retired ? "line-through opacity-50" : ""}`} style={{ color: "var(--t-ink)" }}>
              {line}
            </p>
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px]" style={{ color: "#6b5631" }}>
              <input
                type="checkbox"
                checked={retired}
                onChange={(e) => {
                  setRetired(e.target.checked);
                  retireLine(line, e.target.checked);
                }}
                className="h-3.5 w-3.5"
              />
              Don&rsquo;t show this line again
            </label>
          </div>
        ) : null
      }
      onClose={() => setAward(null)}
    />
  );
}
