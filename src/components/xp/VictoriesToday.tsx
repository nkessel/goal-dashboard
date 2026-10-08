"use client";

import { useState, useSyncExternalStore } from "react";
import type { Task } from "@/lib/data/types";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { SectionTitle } from "@/components/ui/Ornaments";
import { eveningDayKey } from "@/components/evening/evening-clock";

const noop = () => () => {};

/** Round seal at the start of each victory line. */
function Seal({ kind }: { kind: "check" | "star" | "gift" }) {
  const isCheck = kind === "check";
  return (
    <span
      aria-hidden
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full"
      style={{
        background: isCheck
          ? "radial-gradient(circle at 35% 30%, #6f8f58, #3f5c33 60%, #2c4224)"
          : "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)",
        border: `1.5px solid ${isCheck ? "#24361e" : "#5a4520"}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 1px 2px rgba(0,0,0,.3)",
      }}
    >
      {kind === "check" && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#f3e7cb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {kind === "star" && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#3b2a10">
          <path d="M12 2.5l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 16.8l-5.8 3.5 1.6-6.6L2.6 9.3l6.8-.5z" />
        </svg>
      )}
      {kind === "gift" && <span className="text-[13px] leading-none">🎁</span>}
    </span>
  );
}

/**
 * Today's wins on parchment: daily login, finished quests (click one to edit
 * its details or XP, or restore it), and any treasure claimed. "Today" is the
 * viewer's own local day.
 */
export function VictoriesToday({
  tasks,
  claimed,
  lastCheckInAt,
  rites = [],
  theme,
}: {
  tasks: Task[];
  claimed: { id: string; title: string; claimed_at: string | null }[];
  lastCheckInAt: string | null;
  /** Evening rite completions (with the evening's day key). */
  rites?: { id: string; title: string; day: string; xp: number }[];
  theme: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  // "Today" runs 5:30am to 5:30am, so a late night still counts.
  const today = useSyncExternalStore(noop, () => eveningDayKey(), () => null);
  const [editing, setEditing] = useState<Task | null>(null);

  const isToday = (iso: string | null) => !!iso && today !== null && eveningDayKey(new Date(iso)) === today;
  const loginToday = isToday(lastCheckInAt);
  const todays = tasks.filter((t) => isToday(t.completed_at));
  const todaysRewards = claimed.filter((r) => isToday(r.claimed_at));
  const todaysRites = rites.filter((r) => today !== null && r.day === today);
  const totalXp =
    (loginToday ? 5 : 0) + todays.reduce((n, t) => n + t.xp_value, 0) + todaysRites.reduce((n, r) => n + r.xp, 0);
  const empty = !loginToday && todays.length === 0 && todaysRewards.length === 0 && todaysRites.length === 0;

  const rowCls = "flex min-h-[44px] items-center gap-3 py-2 text-[16.5px]";
  const divider = { borderTop: `1px solid ${isAdventure ? "rgba(139,112,64,.35)" : "var(--t-card-border)"}` };
  const xpStyle = { color: isAdventure ? "var(--t-ink)" : "var(--t-accent)", fontSize: 16 };

  return (
    <section
      className={`flex flex-col rounded-2xl px-5 pb-3 pt-4 ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
    >
      {isAdventure ? (
        <SectionTitle
          as="h2"
          tone="ink"
          size={23}
          aside={
            <span className="hidden shrink-0 whitespace-nowrap pl-1 text-[15px] sm:inline" style={{ color: "var(--t-ink)" }}>
              Today&apos;s XP: <span className="font-semibold">{totalXp}</span>
            </span>
          }
        >
          Victories Today
        </SectionTitle>
      ) : null}
      {isAdventure ? (
        <p className="m-0 mt-1 text-center text-[14.5px] sm:hidden" style={{ color: "var(--t-ink)" }}>
          Today&apos;s XP: <span className="font-semibold">{totalXp}</span>
        </p>
      ) : (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: "var(--t-ink)" }}>
            Completed today
          </h2>
          <span className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
            {totalXp} pts
          </span>
        </div>
      )}

      <ul className="mt-2 flex flex-col">
        {loginToday && (
          <li className={rowCls} style={{ color: "var(--t-ink)" }}>
            <Seal kind="check" />
            <span className="min-w-0 flex-1">{isAdventure ? "Answered the call (daily login)" : "Daily login"}</span>
            <span style={xpStyle}>+5 XP</span>
          </li>
        )}
        {todays.map((t, i) => (
          <li key={t.id} style={loginToday || i > 0 ? divider : undefined}>
            <button
              type="button"
              onClick={() => setEditing(t)}
              title="Edit this victory"
              className={`${rowCls} w-full rounded-md text-left hover:bg-black/[.04]`}
              style={{ color: "var(--t-ink)" }}
            >
              <Seal kind="check" />
              <span className="min-w-0 flex-1 break-words leading-snug">{t.title}</span>
              <span className="shrink-0" style={xpStyle}>
                +{t.xp_value} XP
              </span>
            </button>
          </li>
        ))}
        {todaysRites.map((r, i) => (
          <li key={`rite-${r.id}`} className={rowCls} style={loginToday || todays.length > 0 || i > 0 ? { ...divider, color: "var(--t-ink)" } : { color: "var(--t-ink)" }}>
            <Seal kind="check" />
            <span className="min-w-0 flex-1 break-words leading-snug">
              <span style={{ color: "var(--t-ink-soft)" }}>{isAdventure ? "Evening rite: " : "Evening: "}</span>
              {r.title}
            </span>
            <span className="shrink-0" style={xpStyle}>
              +{r.xp} XP
            </span>
          </li>
        ))}
        {todaysRewards.map((r) => (
          <li key={r.id} className={rowCls} style={{ ...divider, color: "var(--t-ink)" }}>
            <Seal kind="gift" />
            <span className="min-w-0 flex-1">
              {isAdventure ? "Treasure accepted: " : "Reward: "}
              {r.title}
            </span>
          </li>
        ))}
        {empty && today !== null && (
          <li className="py-2 text-center text-[15.5px] italic" style={{ color: "var(--t-ink-soft)" }}>
            Nothing completed yet today — you&apos;ve got this.
          </li>
        )}
      </ul>

      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
    </section>
  );
}
