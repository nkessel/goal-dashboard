"use client";

import { useState, useSyncExternalStore } from "react";
import type { Task } from "@/lib/data/types";
import { CoinIcon, DiamondIcon } from "@/components/ui/Icons";
import { coinsForXp } from "@/lib/coins";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { SectionTitle } from "@/components/ui/Ornaments";
import { eveningDayKey } from "@/components/evening/evening-clock";
import { journalKindMeta, splitKindPrefix } from "@/lib/journal-kinds";
import { setVisualFx, useVisualFx } from "@/lib/visual-fx";

const noop = () => () => {};

/** Round seal at the start of each victory line. */
export function Seal({ kind }: { kind: "check" | "star" | "gift" }) {
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
      {kind === "gift" && <DiamondIcon size={14} />}
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
  journal = [],
  theme,
}: {
  /** Recent journal and feedback entries (narrowed here to today). */
  journal?: { id: string; body: string; kind: string | null; created_at: string; xp?: number }[];
  tasks: Task[];
  claimed: { id: string; title: string; claimed_at: string | null; status?: string; completed_at?: string | null; bonus_xp?: number; bonus_coins?: number }[];
  lastCheckInAt: string | null;
  /** Evening rite completions (with the evening's day key). */
  rites?: { id: string; title: string; day: string; xp: number }[];
  theme: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  // "Today" runs 5:30am to 5:30am, so a late night still counts.
  const today = useSyncExternalStore(noop, () => eveningDayKey(), () => null);
  const [editing, setEditing] = useState<Task | null>(null);
  // A tap on a victory shows a small card first; Edit from there opens the editor.
  const [preview, setPreview] = useState<Task | null>(null);
  const fx = useVisualFx();
  const closed = fx.victoriesClosed;

  const isToday = (iso: string | null) => !!iso && today !== null && eveningDayKey(new Date(iso)) === today;
  const loginToday = isToday(lastCheckInAt);
  // A quest logged today counts today, even when it was done earlier (marked "(yesterday)").
  const todaysAllQuests = tasks.filter((t) => isToday(t.logged_at ?? t.completed_at));
  const doneEarlier = (t: Task) => {
    if (!t.completed_at || isToday(t.completed_at) || today === null) return null;
    const d = eveningDayKey(new Date(t.completed_at));
    const y = new Date(`${today}T12:00:00`);
    y.setDate(y.getDate() - 1);
    const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    return d === yKey ? "yesterday" : new Date(t.completed_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };
  // A treasure shows as "accepted" only until it's received; then "received", with what it paid.
  const todaysReceived = claimed.filter((r) => r.status === "completed" && isToday(r.completed_at ?? r.claimed_at));
  const todaysAccepted = claimed.filter((r) => r.status !== "completed" && isToday(r.claimed_at));
  const todaysRewards = [...todaysAccepted, ...todaysReceived];
  const receivedIds = new Set(todaysReceived.map((r) => r.id));
  // A received reward's own quest is shown once, as the treasure row.
  const todays = todaysAllQuests.filter((t) => !(t.reward_id && receivedIds.has(t.reward_id)));
  const rewardQuestXp = (rewardId: string) => todaysAllQuests.find((t) => t.reward_id === rewardId)?.xp_value;
  const questCoins = (t: Task) => t.coin_value ?? coinsForXp(t.xp_value);
  const todaysRites = rites.filter((r) => today !== null && r.day === today);
  const todaysAll = journal
    .filter((j) => isToday(j.created_at))
    .map((j) => (j.kind ? j : { ...j, ...splitKindPrefix(j.body) }));
  // Feedback counts as one victory line ("Feedback submitted ×n"), not one per note.
  const isFeedbackKind = (k: string | null) => k === "feedback" || k === "refill" || k === "future";
  const todaysFeedback = todaysAll.filter((j) => isFeedbackKind(j.kind));
  const feedbackXp = todaysFeedback.reduce((n, j) => n + (j.xp ?? 0), 0);
  const todaysJournal = todaysAll.filter((j) => !isFeedbackKind(j.kind));
  const totalXp =
    (loginToday ? 5 : 0) + todaysAllQuests.reduce((n, t) => n + t.xp_value, 0) + todaysRites.reduce((n, r) => n + r.xp, 0) + feedbackXp;
  const victoryCount = (loginToday ? 1 : 0) + todays.length + todaysRites.length + (todaysFeedback.length ? 1 : 0) + todaysJournal.length + todaysRewards.length;
  const coinsToday = todaysAllQuests.reduce((n, t) => n + questCoins(t), 0) + todaysReceived.reduce((n, r) => n + (r.bonus_coins ?? 0), 0);
  const latest = [...todays].sort((a, b) => ((b.logged_at ?? b.completed_at ?? "") > (a.logged_at ?? a.completed_at ?? "") ? 1 : -1))[0]?.title ?? null;
  const empty = !loginToday && todays.length === 0 && todaysRewards.length === 0 && todaysRites.length === 0 && todaysJournal.length === 0 && todaysFeedback.length === 0;

  const rowCls = "flex min-h-[44px] items-center gap-3 py-2 text-[16.5px]";
  const divider = { borderTop: `1px solid ${isAdventure ? "rgba(139,112,64,.35)" : "var(--t-card-border)"}` };
  const xpStyle = { color: isAdventure ? "var(--t-ink)" : "var(--t-accent)", fontSize: 16 };

  return (
    <section
      className={`flex flex-col rounded-2xl px-5 pb-3 pt-4 ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
    >
      <button
        type="button"
        onClick={() => setVisualFx({ victoriesClosed: !closed })}
        aria-expanded={!closed}
        title={closed ? "Open Victories Today" : "Close Victories Today"}
        className="flex w-full cursor-pointer flex-col items-stretch text-left"
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
          <span className="inline-flex items-center gap-1.5">
            Victories Today
            <Caret open={!closed} />
          </span>
        </SectionTitle>
      ) : null}
      {closed ? (
        <ClosedSummary
          parts={[
            fx.victoriesShowXp ? <>Today&apos;s XP: <span className="font-semibold">{totalXp}</span></> : null,
            fx.victoriesShowCount && victoryCount > 0 ? <>{victoryCount} {victoryCount === 1 ? "victory" : "victories"}</> : null,
            fx.victoriesShowCoins && coinsToday > 0 ? <span className="inline-flex items-center gap-0.5"><CoinIcon size={13} />+{coinsToday}</span> : null,
            fx.victoriesShowLatest && latest ? <span className="truncate italic">{latest}</span> : null,
          ]}
        />
      ) : isAdventure ? (
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
      </button>

      {!closed && <ul className="mt-2 flex flex-col">
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
              onClick={() => setPreview(t)}
              title="See this victory"
              className={`${rowCls} w-full rounded-md text-left hover:bg-black/[.04]`}
              style={{ color: "var(--t-ink)" }}
            >
              <Seal kind="check" />
              <span className="min-w-0 flex-1 break-words leading-snug">
                {t.title}
                {doneEarlier(t) && <span style={{ color: "var(--t-ink-soft)" }}> ({doneEarlier(t)})</span>}
              </span>
              <XpCoins xp={t.xp_value} coins={questCoins(t)} xpStyle={xpStyle} />
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
        {todaysFeedback.length > 0 && (
          <li className={rowCls} style={{ ...(loginToday || todays.length > 0 || todaysRites.length > 0 ? divider : {}), color: "var(--t-ink)" }}>
            <Seal kind="check" />
            <span className="min-w-0 flex-1 leading-snug">
              {todaysFeedback.length > 1 && <span style={{ color: "var(--t-ink-soft)" }}>{todaysFeedback.length} × </span>}
              Feedback
            </span>
            {feedbackXp > 0 && (
              <span className="shrink-0" style={xpStyle}>
                +{feedbackXp} XP
              </span>
            )}
          </li>
        )}
        {todaysJournal.map((j) => {
          const meta = journalKindMeta(j.kind);
          return (
            <li key={`j-${j.id}`} className={rowCls} style={{ ...divider, color: "var(--t-ink)" }}>
              <Seal kind="star" />
              <span className="min-w-0 flex-1 break-words leading-snug">
                <span style={{ color: "var(--t-ink-soft)" }}>{meta ? `${meta.label}: ` : "Journal: "}</span>
                <span className="line-clamp-2">{j.body}</span>
              </span>
            </li>
          );
        })}
        {/* Treasure comes last — the payoff at the end of the day's list. */}
        {todaysRewards.map((r, i) => (
          <li key={r.id} className={rowCls} style={{ ...(i > 0 || loginToday || todays.length > 0 || todaysRites.length > 0 || todaysFeedback.length > 0 || todaysJournal.length > 0 ? divider : {}), color: "var(--t-ink)" }}>
            <Seal kind="gift" />
            <span className="min-w-0 flex-1 break-words leading-snug">
              <span style={{ color: "var(--t-ink-soft)" }}>
                {receivedIds.has(r.id) ? "Reward received: " : "Reward accepted: "}
              </span>
              {r.title}
            </span>
            {receivedIds.has(r.id) &&
              (() => {
                const xp = rewardQuestXp(r.id) ?? r.bonus_xp ?? 0;
                const coins = (r.bonus_coins ?? 0) + coinsForXp(xp);
                return xp > 0 || coins > 0 ? <XpCoins xp={xp} coins={coins} xpStyle={xpStyle} /> : null;
              })()}
          </li>
        ))}
        {empty && today !== null && (
          <li className="py-2 text-center text-[15.5px] italic" style={{ color: "var(--t-ink-soft)" }}>
            Nothing completed yet today — you&apos;ve got this.
          </li>
        )}
      </ul>}

      {preview && (
        <VictoryPreview
          task={preview}
          coins={questCoins(preview)}
          note={doneEarlier(preview)}
          onEdit={() => {
            setEditing(preview);
            setPreview(null);
          }}
          onClose={() => setPreview(null)}
        />
      )}
      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** "🪙 1 · +20 XP" at the end of a victory line (each part only when there is some). */
function XpCoins({ xp, coins, xpStyle }: { xp: number; coins: number; xpStyle: React.CSSProperties }) {
  return (
    <span className="flex shrink-0 items-center gap-2 tabular-nums" style={xpStyle}>
      {/* Coins first, so the XP always lines up along the right edge. */}
      {coins > 0 && (
        <span className="flex items-center gap-0.5" style={{ color: "#8a6116" }}>
          <CoinIcon size={14} />+{coins}
        </span>
      )}
      {xp > 0 && <span>+{xp} XP</span>}
    </span>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : undefined }}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The closed section's one line: whatever Settings chose to show, joined with dots. */
function ClosedSummary({ parts }: { parts: React.ReactNode[] }) {
  const shown = parts.filter(Boolean);
  if (!shown.length) return null;
  return (
    <p className="m-0 mt-1.5 flex min-w-0 items-center justify-center gap-2 text-center text-[14.5px]" style={{ color: "var(--t-ink)" }}>
      {shown.map((p, i) => (
        <span key={i} className="flex min-w-0 items-center gap-2">
          {i > 0 && <span aria-hidden style={{ color: "var(--t-ink-soft)" }}>·</span>}
          {p}
        </span>
      ))}
    </p>
  );
}

/** A small card for one victory, before the full editor. */
function VictoryPreview({ task, coins, note, onEdit, onClose }: { task: Task; coins: number; note: string | null; onEdit: () => void; onClose: () => void }) {
  const when = task.completed_at ? new Date(task.completed_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div role="dialog" aria-modal="true" aria-label={task.title} onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6">
      <div onClick={(e) => e.stopPropagation()} className="parchment parchment-framed relative flex w-full max-w-sm flex-col gap-3 rounded-2xl p-5" style={{ color: "var(--t-ink)" }}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-2.5 cursor-pointer text-xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
          ×
        </button>
        <div className="flex items-start gap-3 pr-5">
          <Seal kind="check" />
          <div className="min-w-0">
            <h3 className="font-display m-0 text-[19px] leading-snug">{task.title}</h3>
            <p className="m-0 mt-0.5 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
              {note ? `Done ${note}` : when ? `Done at ${when}` : "Done today"}
            </p>
          </div>
        </div>
        {task.description && <p className="m-0 line-clamp-4 whitespace-pre-wrap text-[14.5px] leading-snug">{task.description}</p>}
        <div className="flex items-center justify-between gap-3 pt-1">
          <XpCoins xp={task.xp_value} coins={coins} xpStyle={{ color: "var(--t-ink)", fontSize: 16 }} />
          <button type="button" onClick={onEdit} className="hover-glow h-10 cursor-pointer rounded-lg px-4 text-sm font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
