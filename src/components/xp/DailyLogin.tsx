"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dailyCheckInAction } from "@/app/actions";

/**
 * First visit of the day: records the daily check-in (+5 XP, streak) and
 * plays a short celebration. The server ignores repeat check-ins the same
 * day; the per-browser flag just avoids asking again on every screen.
 */
export function DailyLogin() {
  const router = useRouter();
  const [award, setAward] = useState<{ xp: number; streak: number } | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (window.localStorage.getItem("daily-login") === today) return;
      window.localStorage.setItem("daily-login", today);
    } catch {
      /* storage unavailable — the server still guards against double awards */
    }
    dailyCheckInAction()
      .then((r) => {
        if (!r.alreadyCheckedInToday && r.xpAwarded > 0) {
          setAward({ xp: r.xpAwarded, streak: r.streakCount });
          router.refresh();
          setTimeout(() => setAward(null), 3200);
        }
      })
      .catch(() => {});
  }, [router]);

  if (!award) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[80] flex justify-center px-4" role="status" aria-live="polite">
      <div
        className="daily-login-pop relative flex items-center gap-3 overflow-visible rounded-2xl px-5 py-3 parchment shadow-2xl"
        style={{ background: "var(--t-panel)", border: "2px solid var(--t-gold)", color: "var(--t-ink)" }}
      >
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="daily-login-spark absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
            style={{
              background: i % 3 ? "#ffd76a" : "#fff4cf",
              boxShadow: "0 0 6px 1px #ffd76a",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ["--a" as any]: `${(i / 14) * 360}deg`,
              animationDelay: `${(i % 4) * 60}ms`,
            }}
          />
        ))}
        <span className="text-2xl" aria-hidden>
          ✨
        </span>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-lg font-bold" style={{ color: "var(--t-xp)" }}>
            +{award.xp} XP
          </span>
          <span className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
            Daily login · {award.streak}-day streak
          </span>
        </div>
      </div>
    </div>
  );
}
