import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { getProfileById, getChampion } from "@/lib/data/profiles";
import { getShareSettings, isPartyMember } from "@/lib/data/sharing";
import { listOpenTasksForOwnerWithCategory, listCalendarTasksForOwner, listCompletedTasksForOwner } from "@/lib/data/tasks";
import { listBoardsWithStatsForOwner } from "@/lib/data/boards";
import { listWinsSince } from "@/lib/data/wins";
import { getCheckMetrics, listCheckInsSince, listEnergySince } from "@/lib/data/energy";
import { getStats } from "@/lib/data/stats";
import { xpToNextLevel } from "@/lib/levels";
import { levelCap } from "@/lib/data/bosses";
import { SHARE_SCREENS, shares, type ShareKey } from "@/lib/sharing";
import { shownLevel } from "@/lib/shown-level";
import { Avatar } from "@/components/settings/Avatar";
import { LevelPill } from "@/components/social/LevelPill";
import { CharacterStats } from "@/components/xp/CharacterStats";
import { TrackingChart } from "@/components/insights/TrackingChart";
import type { Task } from "@/lib/data/types";

/**
 * A party member's profile: their character, and the screens they've chosen
 * to share (Today by default), read-only. Private quests and boards never show.
 */
export default async function FriendProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const [me, found] = await Promise.all([getProfileById(session.user.id), getProfileById(id)]);
  if (!found) notFound();
  const friend = found!;
  const theme = me?.theme ?? "adventure";
  const isAdventure = theme === "adventure";
  const member = await isPartyMember(session.user.id, id);

  const card = `relative flex flex-col gap-3 rounded-2xl px-4 py-4 ${isAdventure ? "parchment parchment-framed" : ""}`;
  const cardStyle = isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" };
  const h2 = `relative z-[1] m-0 ${isAdventure ? "font-display text-[20px]" : "text-[16px] font-bold"}`;

  if (!member) {
    return (
      <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
        <div className={card} style={cardStyle}>
          <p className="relative z-[1] m-0 text-[15px]" style={{ color: "var(--t-ink)" }}>
            {friend.name ?? "This adventurer"} isn&rsquo;t in your party yet. Invite them from the Guild Hall to see what they share.
          </p>
          <Link href="/feed" className="relative z-[1] self-start text-[14px] underline" style={{ color: "var(--t-ink)" }}>
            ← Guild Hall
          </Link>
        </div>
      </AppShell>
    );
  }

  const share = await getShareSettings(id);
  const open = SHARE_SCREENS.filter((s) => shares(share, s.key));
  const tab: ShareKey | null = open.find((s) => s.key === tabParam)?.key ?? open[0]?.key ?? null;
  const [champion, stats, cap] = await Promise.all([getChampion(), getStats(id), levelCap(id).catch(() => 10)]);
  const lv = xpToNextLevel(friend.total_xp, cap);
  const first = friend.name?.split(" ")[0] ?? "They";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        <Link href="/feed" className="self-start text-[14px] underline underline-offset-2" style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-accent)" }}>
          ← Guild Hall
        </Link>

        {/* Their character */}
        <section className="flex flex-col items-center gap-2 rounded-2xl px-4 py-4 text-center" style={{ background: "linear-gradient(180deg, rgba(28,24,16,.92), rgba(18,16,11,.92))", border: "1.5px solid rgba(217,180,95,.45)" }}>
          <Avatar profile={friend} size={22} />
          <h1 className={`m-0 flex flex-wrap items-center justify-center gap-2 ${isAdventure ? "font-display text-[24px]" : "text-[20px] font-bold"}`} style={{ color: "#f6ecd2" }}>
            {friend.name ?? "Adventurer"}
            <LevelPill level={shownLevel(friend)} champion={friend.id === champion?.id} />
          </h1>
          <div className="w-[220px]">
            <div className="h-3 overflow-hidden rounded-full" style={{ background: "#141a13", border: "1.5px solid #a88a3f" }}>
              <div className="h-full rounded-full" style={{ width: `${lv.xpForNextLevel ? Math.min(100, (lv.xpIntoLevel / lv.xpForNextLevel) * 100) : 100}%`, background: "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)" }} />
            </div>
            <p className="m-0 mt-1 text-[12.5px] tabular-nums" style={{ color: "rgba(246,236,210,.75)" }}>
              {friend.total_xp.toLocaleString()} XP · {friend.streak_count}-day streak
            </p>
          </div>
          <CharacterStats order={stats} xp={friend.stat_xp ?? {}} />
        </section>

        {/* The screens they share */}
        {open.length === 0 ? (
          <p className={card} style={cardStyle}>
            <span className="relative z-[1]" style={{ color: "var(--t-ink-soft)" }}>
              {first} isn&rsquo;t sharing any screens right now.
            </span>
          </p>
        ) : (
          <nav aria-label={`${first}'s shared screens`} className="flex rounded-full p-1" style={{ background: isAdventure ? "var(--t-nav-bg)" : "var(--t-accent-soft)", border: isAdventure ? "1px solid rgba(209,161,60,.35)" : undefined }}>
            {open.map((s) => {
              const on = s.key === tab;
              return (
                <Link
                  key={s.key}
                  href={`/friends/${id}?tab=${s.key}`}
                  aria-current={on ? "page" : undefined}
                  className={`flex-1 rounded-full py-2 text-center text-[14px] font-semibold ${isAdventure ? "font-display" : ""}`}
                  style={{
                    background: on ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "transparent",
                    color: on ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-nav-inactive)" : "var(--t-ink-soft)",
                  }}
                >
                  {s.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div key={tab ?? "none"} className="fade-in flex flex-col gap-4">
          {tab === "today" && <TodayView ownerId={id} first={first} card={card} cardStyle={cardStyle} h2={h2} />}
          {tab === "boards" && <BoardsView ownerId={id} first={first} card={card} cardStyle={cardStyle} h2={h2} />}
          {tab === "calendar" && <CalendarView ownerId={id} first={first} card={card} cardStyle={cardStyle} h2={h2} />}
          {tab === "insights" && <InsightsView ownerId={id} card={card} cardStyle={cardStyle} h2={h2} />}
        </div>
      </div>
    </AppShell>
  );
}

type ViewProps = { ownerId: string; first?: string; card: string; cardStyle: React.CSSProperties | undefined; h2: string };

function QuestLine({ t }: { t: Task }) {
  const art = (t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? t.icon_key : null;
  const pct = Math.round(t.progress ?? 0);
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full" style={{ border: "1.5px solid #a58c66", background: "#f3e6c8" }}>
        {art && (
          // eslint-disable-next-line @next/next/no-img-element -- quest portrait
          <img src={art} alt="" className="h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span dir="auto" className="user-text block text-[15px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
          {t.title}
        </span>
        {t.description && (
          <span dir="auto" className="user-text line-clamp-2 block text-[13px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
            {t.description}
          </span>
        )}
        {(t.due_at || (t.is_on_calendar && t.scheduled_start) || (t.steps_total ?? 0) > 0) && (
          <span className="block text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
            {[
              t.due_at ? `Due ${new Date(t.due_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : null,
              t.is_on_calendar && t.scheduled_start ? `On the calendar ${new Date(t.scheduled_start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: process.env.APP_TIMEZONE || "America/New_York" })}` : null,
              (t.steps_total ?? 0) > 0 ? `${t.steps_done ?? 0}/${t.steps_total} steps` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        {pct > 0 && (
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: "#141a13", border: "1px solid #8a6c2c" }}>
            <span className="block h-full" style={{ width: `${pct}%`, background: "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)" }} />
          </span>
        )}
      </span>
      <span className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color: "var(--t-xp)" }}>
        {t.xp_value} XP
      </span>
    </li>
  );
}

async function visibleQuests(ownerId: string) {
  const [tasks, boards] = await Promise.all([listOpenTasksForOwnerWithCategory(ownerId), listBoardsWithStatsForOwner(ownerId)]);
  const privateBoards = new Set(boards.filter((b) => b.is_private).map((b) => b.id));
  return tasks.filter((t) => !t.is_private && !(t.board_id && privateBoards.has(t.board_id)));
}

async function TodayView({ ownerId, first, card, cardStyle, h2 }: ViewProps) {
  const quests = await visibleQuests(ownerId);
  const today = quests.filter((t) => t.is_manual_priority);
  const more = quests.filter((t) => !t.is_manual_priority && t.in_additional !== false);
  const since = new Date(Date.now() - 20 * 3600_000).toISOString();
  const wins = (await listWinsSince(ownerId, since, { hidePrivate: true })).filter((w) => w.kind === "quest" || w.kind === "habit" || w.kind === "rite");
  return (
    <>
      <section className={card} style={cardStyle}>
        <h2 className={h2} style={{ color: "var(--t-ink)" }}>
          Today&rsquo;s Quests
        </h2>
        <ul className="relative z-[1] m-0 list-none p-0">
          {today.length ? today.map((t) => <QuestLine key={t.id} t={t} />) : <li className="text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>{first} hasn&rsquo;t picked today&rsquo;s quests yet.</li>}
        </ul>
      </section>
      {more.length > 0 && (
        <section className={card} style={cardStyle}>
          <h2 className={h2} style={{ color: "var(--t-ink)" }}>
            Additional Quests
          </h2>
          <ul className="relative z-[1] m-0 list-none p-0">
            {more.map((t) => (
              <QuestLine key={t.id} t={t} />
            ))}
          </ul>
        </section>
      )}
      {wins.length > 0 && (
        <section className={card} style={cardStyle}>
          <h2 className={h2} style={{ color: "var(--t-ink)" }}>
            Victories today
          </h2>
          <ul className="relative z-[1] m-0 flex list-none flex-col gap-1 p-0">
            {wins.map((w) => (
              <li key={w.id} className="flex items-center gap-2 text-[14.5px]" style={{ color: "var(--t-ink)" }}>
                <span aria-hidden style={{ color: "#58a04a" }}>✓</span>
                <span className="min-w-0 flex-1 truncate">{w.title}</span>
                {w.xp ? <span className="text-[12.5px] font-bold" style={{ color: "var(--t-xp)" }}>+{w.xp}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

async function BoardsView({ ownerId, first, card, cardStyle, h2 }: ViewProps) {
  const [allBoards, completed] = await Promise.all([listBoardsWithStatsForOwner(ownerId), listCompletedTasksForOwner(ownerId, 300).catch(() => [])]);
  const boards = allBoards.filter((b) => !b.is_private && !b.isVirtual);
  if (!boards.length) return <p className={card} style={cardStyle}><span className="relative z-[1]" style={{ color: "var(--t-ink-soft)" }}>{first} has no shared boards.</span></p>;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {boards.map((b) => {
        const qs = b.openQuests.filter((q) => !q.is_private);
        const finished = completed.filter((q) => q.board_id === b.id && !q.is_private);
        return (
          <section key={b.id} className={card} style={cardStyle}>
            <h2 className={h2} style={{ color: "var(--t-ink)" }}>
              <span dir="auto" className="user-text">{b.title}</span>{" "}
              <span className="text-[13px] font-normal" style={{ color: "var(--t-ink-soft)" }}>
                ({b.questDone}/{b.questTotal})
              </span>
            </h2>
            <ul className="relative z-[1] m-0 list-none p-0">
              {qs.map((q) => (
                <QuestLine key={q.id} t={q} />
              ))}
              {qs.length === 0 && <li className="text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>Nothing open.</li>}
            </ul>
            {finished.length > 0 && (
              <details className="relative z-[1]">
                <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
                  Done lately ({finished.length})
                </summary>
                <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                  {finished.map((q) => (
                    <li key={q.id} className="flex items-center gap-2 text-[14px]" style={{ color: "var(--t-ink-soft)" }}>
                      <span aria-hidden style={{ color: "#58a04a" }}>✓</span>
                      <span dir="auto" className="user-text min-w-0 flex-1 truncate line-through decoration-[rgba(80,60,20,.35)]">{q.title}</span>
                      <span className="shrink-0 text-[12px] font-bold" style={{ color: "var(--t-xp)" }}>+{q.xp_value}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

async function CalendarView({ ownerId, first, card, cardStyle, h2 }: ViewProps) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 15 * 86_400_000);
  const tasks = (await listCalendarTasksForOwner(ownerId, start, end)).filter((t) => !t.is_private && t.scheduled_start).sort((a, b) => (a.scheduled_start! < b.scheduled_start! ? -1 : 1));
  return (
    <section className={card} style={cardStyle}>
      <h2 className={h2} style={{ color: "var(--t-ink)" }}>
        The next two weeks
      </h2>
      <ul className="relative z-[1] m-0 flex list-none flex-col gap-1.5 p-0">
        {tasks.length === 0 && <li className="text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>{first} has nothing scheduled in the next two weeks.</li>}
        {tasks.map((t) => (
          <li key={t.id} className="flex items-baseline gap-3 text-[14.5px]" style={{ color: "var(--t-ink)" }}>
            <time className="w-[118px] shrink-0 text-[13px] tabular-nums" style={{ color: "var(--t-ink-soft)" }} dateTime={t.scheduled_start!}>
              {new Date(t.scheduled_start!).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: process.env.APP_TIMEZONE || "America/New_York" })}
            </time>
            <span dir="auto" className="user-text min-w-0 flex-1 truncate font-semibold">{t.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function InsightsView({ ownerId, card, cardStyle, h2 }: ViewProps) {
  const since = new Date(Date.now() - 92 * 86_400_000).toISOString();
  const [energy, checks, metrics, wins] = await Promise.all([listEnergySince(ownerId, since), listCheckInsSince(ownerId, since), getCheckMetrics(ownerId), listWinsSince(ownerId, since, { hidePrivate: true })]);
  return (
    <section className={card} style={cardStyle}>
      <h2 className={h2} style={{ color: "var(--t-ink)" }}>
        Tracking
      </h2>
      <TrackingChart
        metrics={["Energy", ...metrics]}
        readings={[...energy.map((e) => ({ metric: "Energy", level: e.level, at: e.created_at })), ...checks.map((c) => ({ metric: c.metric, level: c.level, at: c.created_at }))]}
        wins={wins.filter((w) => w.kind !== "feedback" && w.kind !== "journal").map((w) => ({ kind: w.kind, at: w.at, xp: w.xp ?? 0, title: w.title, icon: w.icon ?? null }))}
      />
    </section>
  );
}
