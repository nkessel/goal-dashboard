"use client";

import { useEffect, useState, useTransition } from "react";
import { listRecentWinsAction } from "@/app/actions";
import { journalKindMeta } from "@/lib/journal-kinds";
import { eveningDayKey } from "./evening-clock";

type Win = Awaited<ReturnType<typeof listRecentWinsAction>>[number];

const RANGES = [
  { days: 1, label: "Today" },
  { days: 3, label: "3 days" },
  { days: 7, label: "Week" },
  { days: 30, label: "Month" },
] as const;

const ICON: Record<Win["kind"], string> = { quest: "✔", rite: "🌙", habit: "🔁", reward: "◆", journal: "✒️", feedback: "💬" };

/** Start of the evening-day `daysBack` days before `day` (days run 5:30am to 5:30am). */
function sinceISO(day: string, days: number) {
  const d = new Date(`${day}T05:30:00`);
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString();
}

function dayLabel(key: string, today: string) {
  if (key === today) return "Today";
  const d = new Date(`${key}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const diff = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * The evening's first rite: a look back at what got done — quests, rites,
 * habits, rewards, journal entries and feedback. Today by default; reach
 * further back with the range buttons.
 */
export function RecentWins({ day }: { day: string | null }) {
  const [days, setDays] = useState<number>(1);
  const [wins, setWins] = useState<Win[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();

  useEffect(() => {
    if (!day) return;
    startLoading(async () => {
      try {
        setError(null);
        setWins(await listRecentWinsAction(sinceISO(day, days)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load your wins.");
      }
    });
  }, [day, days]);

  // Group by the day each win belongs to (rites carry their own evening day).
  const groups = new Map<string, Win[]>();
  for (const w of wins ?? []) {
    const key = w.day ?? eveningDayKey(new Date(w.at));
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  const totalXp = (wins ?? []).reduce((n, w) => n + (w.xp ?? 0), 0);

  return (
    <div className="flex flex-col gap-2.5">
      <div role="group" aria-label="How far back" className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => setDays(r.days)}
            aria-pressed={days === r.days}
            className="h-8 rounded-full px-3 text-[13.5px] font-semibold"
            style={{ background: days === r.days ? "rgba(217,180,95,.5)" : "rgba(70,50,20,.08)", border: `1.5px solid ${days === r.days ? "#a88a3f" : "transparent"}`, color: "var(--t-ink)" }}
          >
            {r.label}
          </button>
        ))}
        {wins && wins.length > 0 && (
          <span className="ml-auto text-[13px] tabular-nums" style={{ color: "#5a4a30" }}>
            {wins.length} {wins.length === 1 ? "win" : "wins"}
            {totalXp > 0 && ` · ${totalXp} XP`}
          </span>
        )}
      </div>

      {error && (
        <p className="m-0 text-[14px]" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      {wins === null || (isLoading && wins.length === 0) ? (
        <p className="m-0 text-[14.5px] italic" style={{ color: "#5a4a30" }}>
          Gathering your wins…
        </p>
      ) : wins.length === 0 ? (
        <p className="m-0 text-[14.5px] italic" style={{ color: "#5a4a30" }}>
          {days === 1 ? "Nothing logged yet today — even small steps count. Try a longer look back." : "Nothing logged in this stretch."}
        </p>
      ) : (
        <div className={`flex max-h-[min(46vh,380px)] flex-col gap-2 overflow-y-auto overscroll-contain pr-1 ${isLoading ? "opacity-60" : ""}`}>
          {[...groups.entries()].map(([key, list]) => (
            <div key={key}>
              {(days > 1 || key !== day) && (
                <p className="m-0 mb-0.5 text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "#6f5a24" }}>
                  {day ? dayLabel(key, day) : key}
                </p>
              )}
              <ul className="m-0 flex list-none flex-col p-0">
                {list.map((w) => {
                  const sub = w.kind === "journal" ? journalKindMeta(w.sub) : null;
                  return (
                    <li key={w.id} className="flex items-start gap-2 py-1 text-[15px] leading-snug" style={{ color: "var(--t-ink)" }}>
                      <span aria-hidden className="w-5 shrink-0 text-center" style={{ color: w.kind === "quest" ? "#3f7a32" : "#8a6c2c" }}>
                        {sub?.icon ?? ICON[w.kind]}
                      </span>
                      <span className="min-w-0 flex-1 break-words">
                        {(w.kind === "journal" || w.kind === "feedback") && (
                          <span style={{ color: "#6b5c40" }}>{w.kind === "feedback" ? "Feedback: " : sub ? `${sub.label}: ` : "Journal: "}</span>
                        )}
                        {w.title}
                      </span>
                      {!!w.xp && (
                        <span className="shrink-0 text-[13.5px] font-semibold tabular-nums" style={{ color: "var(--t-xp)" }}>
                          +{w.xp}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
