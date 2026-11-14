"use client";

import { isTentativeTitle } from "@/lib/tentative";
import { createContext, useContext, useState } from "react";

/** The quests waiting behind each quest on the calendar, by quest id: its agenda. */
export const AgendaContext = createContext<Record<string, { id: string; title: string }[]>>({});
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { completeTaskAction } from "@/app/actions";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/data/types";
import { MONSTER_ICONS } from "@/lib/monster-icons";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { formatTimeRange } from "@/lib/calendar-dates";
import { coinsForXp } from "@/lib/coins";
import { CoinIcon } from "@/components/ui/Icons";
import type { CardShow } from "./CalendarLayers";
import { useCalCardLook } from "@/lib/use-quest-cal";
import { useQuestPlace } from "@/lib/use-quest-places";

import { getTaskDisplayWindow } from "@/lib/calendar-task-window";
export { getTaskDisplayWindow };

/** How much a calendar card's words can grow: 1 for an ordinary card, up to 1.55 with room to spare (wide and tall). */
export function roomyScale(w: number, h: number): number {
  // Up to 1.3× (1.55 read as too large on a computer; owner, Nov 13).
  return Math.max(1, Math.min(1.3, Math.min(w / 190, h / 54)));
}

export function CalendarTaskChip({
  task,
  theme = "calm",
  showTime = false,
  compact = false,
  timeLabel,
  oneLine = false,
  portrait = false,
  box,
  show = { art: true, time: true, xp: true, coins: true },
}: {
  /** Which parts the card shows (calendar gear › Display › Quest cards show). */
  show?: CardShow;
  /** The card's size on the grid. With it, Adventure draws a picture-book quest card. */
  box?: { w: number; h: number };
  /** The quest's portrait large above its title, like a card on a quest map. */
  portrait?: boolean;
  task: Task;
  theme?: "calm" | "adventure";
  showTime?: boolean;
  compact?: boolean;
  /** Shown under the title in the grid (Google-style "9 – 10am"). */
  timeLabel?: string;
  /** Too short for two lines: "Title, 9am" on one line. */
  oneLine?: boolean;
}) {
  const isAdventure = theme === "adventure";
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const isCompleted = task.status === "completed";
  // Tapping a quest's portrait completes it, with the celebration (owner, Nov 5).
  const [completing, setCompleting] = useState(false);
  function complete() {
    if (completing || isCompleted) return;
    setCompleting(true);
    const fd = new FormData();
    fd.set("taskId", task.id);
    completeTaskAction(fd)
      .then((res) => {
        celebrateQuest({
          taskId: task.id,
          title: task.title,
          description: task.description ?? null,
          xp: task.xp_value,
          iconSrc: task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null,
          totalXp: res?.totalXp ?? null,
          coinsEarned: res?.coinsEarned ?? 0,
        });
        router.refresh();
      })
      .catch(() => {})
      .finally(() => setCompleting(false));
  }
  const isWarned = !isCompleted && task.reschedule_count >= 3;
  const tint = !isCompleted ? rescheduleRedness(task.reschedule_count) : undefined;

  // "ai" (freshly generated) and "library" (picked from the shared icon
  // library) both just hold a plain image URL now; "monster" is the old
  // emoji picker's source, kept only so any pre-existing data still renders.
  const monsterImageUrl =
    task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null;
  const monsterEmoji =
    task.icon_key && task.icon_source === "monster" ? MONSTER_ICONS.find((m) => m.key === task.icon_key)?.emoji : null;

  const { start, end } = getTaskDisplayWindow(task);

  if (isAdventure && box) {
    return (
      <>
        <QuestCard
          task={task}
          box={box}
          art={monsterImageUrl ?? (monsterEmoji ? null : creatureFor(task.id))}
          emoji={monsterEmoji ?? null}
          timeLabel={timeLabel}
          warned={isWarned}
          tint={tint}
          portrait={portrait}
          show={show}
          onOpen={() => setEditing(true)}
          onComplete={complete}
        />
        {editing && <EditTaskModal task={task} theme={theme} onClose={() => setEditing(false)} />}
      </>
    );
  }

  const cardStyle: React.CSSProperties = {
    // The redness tint is a translucent rgba() — layered directly as the
    // background it composites against whatever sits behind the chip (the
    // page itself in Day/Week views), which in Adventure theme is a dark
    // green gradient and leaves --t-ink title text illegible. Layering it
    // as a gradient "wash" over the chip's own opaque base color instead
    // keeps the tint visible while guaranteeing a light surface underneath.
    background: isCompleted
      ? isAdventure
        ? "var(--t-panel)"
        : "var(--t-card)"
      : tint
        ? `linear-gradient(${tint}, ${tint}), ${isAdventure ? "var(--t-panel)" : "var(--t-accent-soft)"}`
        : isAdventure
          ? "var(--t-panel)"
          : "var(--t-accent-soft)",
    borderStyle: "solid",
    borderWidth: isAdventure ? 1.5 : isCompleted || isWarned ? 1 : 0,
    borderColor: isCompleted
      ? "var(--t-good)"
      : isWarned
        ? "var(--t-warn)"
        : isAdventure
          ? "var(--t-panel-border)"
          : "transparent",
    opacity: isCompleted && !isAdventure ? 0.65 : 1,
  };

  // Portrait cards need a little height; very short slots fall back to a line.
  const tall = portrait && !oneLine;
  const iconSize = tall ? 46 : compact ? 18 : isAdventure ? 32 : 28;
  // Roomy cards (a close-up on a big screen) get bigger words.
  const big = box && !oneLine ? roomyScale(box.w, box.h) : 1;

  return (
    <>
    <button
      type="button"
      title={`Edit "${task.title}"`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`cal-chip ${isTentativeTitle(task.title) && !isCompleted ? "cal-tentative" : ""} flex h-full w-full min-w-0 overflow-hidden rounded-md ${tall ? "items-center justify-center text-center" : `text-left ${compact ? "items-start" : "items-center"}`}`}
      style={{
        ...cardStyle,
        ...(isAdventure ? { borderLeft: `3px solid ${isCompleted ? "var(--t-good)" : isWarned ? "var(--t-warn)" : "#a88a3f"}` } : {}),
        flexDirection: tall ? "column" : "row",
        gap: tall ? 3 : compact ? 4 : 8,
        padding: tall ? "5px 4px" : compact ? "3px 4px" : "6px 8px",
      }}
    >
      <div
        className={`${compact && !tall ? "hidden" : "flex"} shrink-0 items-center justify-center overflow-hidden ${tall ? "rounded-lg" : "rounded-full"}`}
        style={{
          width: iconSize,
          height: iconSize,
          border: isAdventure ? "1.5px solid var(--t-panel-border)" : undefined,
          background: isAdventure ? undefined : "#fff",
        }}
      >
        {isCompleted ? (
          <svg width={iconSize - 4} height={iconSize - 4} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="var(--t-good)" />
            <path d="M7 12.5l3 3 7-7" stroke="#fff" strokeWidth="2" fill="none" />
          </svg>
        ) : monsterImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
          <img src={monsterImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span style={{ fontSize: iconSize - 8 }}>{monsterEmoji || (isAdventure ? "❔" : "✦")}</span>
        )}
      </div>

      <div className={tall ? "w-full min-w-0" : "min-w-0 flex-1"}>
        <p
          className={tall ? "line-clamp-3 leading-[1.15]" : oneLine ? "truncate leading-tight" : compact ? "line-clamp-2 leading-[1.15] [overflow-wrap:normal] [word-break:normal]" : "truncate leading-tight"}
          style={{
            color: "var(--t-ink)",
            fontSize: (compact ? 11.5 : 13.5) * big,
            fontWeight: 600,
            textDecoration: isCompleted && !isAdventure ? "line-through" : undefined,
          }}
        >
          {oneLine && timeLabel ? (
            <>
              {task.title}
              <span style={{ fontWeight: 400, color: "var(--t-ink-soft)" }}>, {timeLabel}</span>
            </>
          ) : (
            task.title
          )}
        </p>
        {!oneLine && (show.xp || show.coins) && <Pays xp={show.xp ? task.xp_value : 0} coins={show.coins ? (task.coin_value ?? coinsForXp(task.xp_value)) : 0} done={isCompleted} center={tall} px={10.5 * (1 + (big - 1) * 0.6)} />}
        {show.time && timeLabel && !oneLine && !tall && (
          <p className="truncate leading-tight" style={{ color: "var(--t-ink-soft)", fontSize: 10.5 * (1 + (big - 1) * 0.6) }}>
            {timeLabel}
          </p>
        )}
        {isCompleted && (
          <p
            className="truncate leading-tight"
            style={{ color: "var(--t-ink-soft)", fontSize: compact ? 10 : 11.5, opacity: 0.8 }}
          >
            Completed
          </p>
        )}
        {showTime && !isCompleted && (
          <p className="truncate leading-tight" style={{ color: "var(--t-ink-soft)", fontSize: 10.5 }}>
            {formatTimeRange(start, end)}
            {isWarned && (
              <span style={{ color: "var(--t-warn)", fontWeight: 600 }}>
                {" "}
                · rescheduled {task.reschedule_count}×
              </span>
            )}
          </p>
        )}
      </div>
    </button>
    {editing && <EditTaskModal task={task} theme={theme} onClose={() => setEditing(false)} />}
    </>
  );
}

/** A quest's picture for the calendar: its portrait, else its creature. */
export function questArt(task: Task) {
  if ((task.icon_source === "ai" || task.icon_source === "library") && task.icon_key) return task.icon_key;
  return creatureFor(task.id);
}

/** Quests with no portrait yet still get a creature, the same one every time. */
const CREATURES = ["goblin", "boar", "bat", "golem", "venomroot", "dragon", "sorcerer"];
export function creatureFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `/design/icon-${CREATURES[hash % CREATURES.length]}.jpg`;
}

/**
 * A quest on the Adventure calendar, drawn like a card in a storybook: its
 * creature beside the title (or above it, in a tall narrow slot), and a
 * green seal once it's done. The layout follows the room the slot has.
 */
function QuestCard({
  task,
  box,
  art,
  emoji,
  timeLabel,
  warned,
  tint,
  portrait,
  show,
  onOpen,
  onComplete,
}: {
  onComplete?: () => void;
  show: CardShow;
  task: Task;
  box: { w: number; h: number };
  art: string | null;
  emoji: string | null;
  timeLabel?: string;
  warned: boolean;
  tint?: string;
  portrait: boolean;
  onOpen: () => void;
}) {
  const done = task.status === "completed";
  const { w, h } = box;
  // The quests waiting behind it, as an agenda (owner, Nov 3: time with Dad, then what to bring up).
  const agenda = useContext(AgendaContext)[task.id] ?? [];
  // Its own look, chosen from the card's menu (owner, Nov 12): a colour, its portrait, or a photo; and where it happens.
  const look = useCalCardLook(task.id);
  const place = useQuestPlace(task.id);
  const lookImg = look?.image === "portrait" ? art : (look?.image ?? null);
  const lookBg: React.CSSProperties | null = lookImg
    ? { backgroundImage: `linear-gradient(rgba(251,243,220,.7), rgba(238,220,179,.62)), url("${lookImg}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : look?.color
      ? { backgroundImage: `linear-gradient(${look.color}cc, ${look.color}e6), linear-gradient(180deg, #fbf3dc, #eedcb3)` }
      : null;
  const line = h < 30;
  // What it pays: XP and coins (done: what it paid). Shown on a line of its own when there's room, else at the end of a one-line card.
  const xpN = done ? (task.xp_awarded ?? task.xp_value) : task.xp_value;
  const coinN = task.coin_value ?? coinsForXp(xpN);
  const pays = (show.xp && xpN > 0) || (show.coins && coinN > 0);
  // Narrow and tall enough: the creature stands above the title; a narrow one-hour card puts it beside, like the mockup.
  const stack = !line && (portrait || w < 130) && h >= 66;
  // With room to spare (a close-up on a big screen), the words and the creature grow with the card (owner, Nov 12:
  // "the text of a quest should show larger when there's extra space"); the small print grows a little less.
  // Everything on the card fits inside its edges (owner, Nov 14: "the time of the event spills over the card
  // boundaries… make the card text size appropriate for the space available"). Start from the roomy size and
  // shrink the words (down to 80%) until the title's first line and every extra line fit; if even the smallest
  // size can't hold them all, the least needed lines go first: the time, then the place, then the done note.
  const chrome = (stack ? 9 : 8) + 3; // padding + the 1.5px border, top and bottom
  const wantTime = show.time && !done && !stack && !line && !!timeLabel && w >= 110;
  const wantPlace = !!place && !line && w >= 70;
  const wantDone = done && !line;
  const wantPay = pays && !line;
  type Fit = { big: number; time: boolean; place: boolean; doneNote: boolean; payLine: boolean };
  const fitAt = (s: number, drop: number, whole: boolean): Fit | null => {
    const sp = 10.5 * (1 + (s - 1) * 0.6);
    const sl = Math.round(sp * 1.33);
    const tp = (w < 52 ? 11 : w < 110 ? (stack ? 12.5 : 11.5) : 14) * s;
    const f: Fit = { big: s, time: wantTime && drop < 1, place: wantPlace && drop < 2, doneNote: wantDone && drop < 3, payLine: wantPay && drop < 4 };
    const extras = [f.time, f.place, f.doneNote, f.payLine].filter(Boolean).length * sl;
    // A stacked card needs room for at least a small creature above the words.
    const artNeed = stack && show.art ? 18 + 3 : 0;
    // First try to keep the whole title (up to two lines, stacked cards three), then settle for its first line.
    const need = whole ? Math.min(stack ? 3 : 2, Math.max(1, Math.ceil((task.title.length * tp * 0.5) / Math.max(1, (stack ? w : w * 0.62) - 8)))) : 1;
    return chrome + artNeed + Math.ceil(tp * 1.12 * need) + extras <= h ? f : null;
  };
  const roomy = line ? 1 : roomyScale(w, h);
  let fit: Fit = { big: 0.8, time: false, place: false, doneNote: false, payLine: false };
  if (line) fit = { big: 1, time: false, place: false, doneNote: false, payLine: false };
  else
    search: for (let pass = 0; pass <= 5; pass++) {
      const drop = Math.max(0, pass - 1);
      for (let s = roomy; s >= (pass === 0 ? 0.9 : 0.8) - 1e-6; s -= 0.05) {
        const f = fitAt(Math.max(0.8, s), drop, pass === 0);
        if (f) {
          fit = f;
          break search;
        }
      }
    }
  const big = fit.big;
  const smallPx = 10.5 * (1 + (big - 1) * 0.6);
  const titlePx = (w < 52 ? 11 : w < 110 ? (stack ? 12.5 : 11.5) : 14) * big;
  // Stacked, the creature and the title share the height: the creature gets what the title (at least one line) leaves,
  // so even a narrow one-hour card keeps its creature, like a card in a storybook (owner's mockup, Nov 3).
  const lineH = titlePx * 1.12;
  const smallLine = Math.round(smallPx * 1.33);
  const doneNote = fit.doneNote;
  const payLine = fit.payLine;
  const placeLine = fit.place;
  const timeLine = fit.time;
  const extraH = [doneNote, payLine, placeLine, timeLine].filter(Boolean).length * smallLine;
  const wantLines = Math.min(3, Math.max(1, Math.ceil((task.title.length * titlePx * 0.5) / Math.max(1, w - 8))));
  const stackArt = (keep: number) => Math.max(0, Math.min(w - 10, h - chrome - 3 - extraH - Math.ceil(lineH * keep), 64 * big));
  const artPx = line
    ? Math.max(0, Math.min(h - 6, 22))
    : stack
      ? stackArt(wantLines) >= 30 ? stackArt(wantLines) : stackArt(Math.min(wantLines, 2)) >= 18 ? stackArt(Math.min(wantLines, 2)) : stackArt(1)
      : Math.max(0, Math.min(h - chrome, (h >= 80 ? 64 : 52) * big, w < 130 ? w * 0.3 : w * 0.38));
  const showArt = show.art && artPx >= 16;
  const sealPx = Math.min(artPx, (stack ? 24 : 26) * big);
  const payInline = pays && line && w >= 120;
  // Narrow cards (a week on a phone): the XP line shrinks to the card's width, or steps aside when it can't be read.
  const payChars = (show.xp && xpN > 0 ? `+${xpN} XP`.length : 0) + (show.coins && coinN > 0 ? String(coinN).length + (show.xp && xpN > 0 ? 4 : 2) : 0);
  const payPx = Math.min(smallPx, (w - (stack ? 6 : 10) - (stack || !showArt ? 0 : artPx + 6)) / Math.max(1, payChars * 0.62));
  const payShown = payLine && payPx >= 7.5;
  const textRoom = h - chrome - (stack && showArt ? (done ? sealPx : artPx) + 3 : 0) - extraH;
  const agendaRows = !done && !line && !stack && agenda.length ? Math.max(0, Math.min(agenda.length, 3, Math.floor((textRoom - lineH - smallLine) / smallLine))) : 0;
  const agendaBadge = !done && agenda.length > 0 && agendaRows === 0 && !line && textRoom - lineH >= 15;
  const lines = Math.max(1, Math.floor((textRoom - (agendaRows ? agendaRows * smallLine + smallLine : agendaBadge ? 16 : 0)) / lineH));

  return (
    <button
      type="button"
      title={`Edit "${task.title}"${done && task.completed_at ? `\nCompleted ${new Date(task.completed_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}${agenda.length ? `\nAgenda: ${agenda.map((a) => a.title).join("; ")}` : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`cal-chip quest-card ${done ? "quest-card-done" : isTentativeTitle(task.title) ? "cal-tentative" : ""} flex h-full w-full min-w-0 overflow-hidden ${stack ? "flex-col items-center justify-start text-center" : "items-center text-left"}`}
      style={{
        gap: stack ? 3 : line ? 4 : 6,
        padding: line ? "1px 4px" : stack ? "5px 3px 4px" : "4px 6px 4px 4px",
        ...(lookBg && !done ? lookBg : tint && !done ? { backgroundImage: `linear-gradient(${tint}, ${tint}), linear-gradient(180deg, #fbf3dc, #eedcb3)` } : {}),
        ...(warned ? { borderColor: "var(--t-warn)" } : {}),
      }}
    >
      {done && (showArt || (!show.art && !line && h >= 40)) ? (
        <span className="quest-seal flex shrink-0 items-center justify-center rounded-full" style={{ width: sealPx, height: sealPx }}>
          <svg width="62%" height="62%" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : showArt ? (
        <span
          className="quest-art flex shrink-0 items-center justify-center overflow-hidden"
          style={{ width: artPx, height: artPx, borderRadius: artPx > 30 ? 8 : 5, cursor: onComplete ? "pointer" : undefined }}
          title={onComplete ? "Tap the portrait to complete it" : undefined}
          onClick={
            onComplete
              ? (e) => {
                  e.stopPropagation();
                  onComplete();
                }
              : undefined
          }
        >
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL or a static /design/ creature
            <img
              src={art}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              // A portrait that won't load gives way to the quest's creature.
              onError={(e) => {
                const fallback = creatureFor(task.id);
                if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback;
              }}
            />
          ) : (
            <span style={{ fontSize: artPx * 0.72, lineHeight: 1 }}>{emoji}</span>
          )}
        </span>
      ) : null}
      <span className={stack ? "w-full min-w-0" : "min-w-0 flex-1"}>
        <span
          lang="en" className="font-display [overflow-wrap:break-word] [hyphens:auto]"
          style={{
            color: "#3a2a14",
            fontSize: titlePx,
            fontWeight: 500,
            lineHeight: 1.12,
            overflow: "hidden",
            ...(line
              ? { display: "block", whiteSpace: "nowrap", textOverflow: "ellipsis" }
              : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, WebkitHyphens: "auto" }),
          }}
        >
          {task.title}
        </span>
        {doneNote && (
          <span className="block truncate" style={{ color: "#4e6a35", fontSize: smallPx, fontStyle: "italic", lineHeight: `${smallLine}px` }}>
            {/* When it was done (owner, Nov 5: "show when I completed quests in the past days"). */}
            {task.completed_at ? `Done ${new Date(task.completed_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M/i, (_, m: string) => m.toLowerCase() + "m")}` : "Completed"}
          </span>
        )}
        {placeLine && (
          <span className="block truncate" title={`Where: ${place}`} style={{ color: "#5a4a2c", fontSize: smallPx, lineHeight: `${smallLine}px` }}>
            📍 {place}
          </span>
        )}
        {payShown && <Pays xp={show.xp ? xpN : 0} coins={show.coins ? coinN : 0} done={done} center={stack} px={payPx} />}
        {agendaRows > 0 && (
          <span className="mt-0.5 block" style={{ fontSize: smallPx, lineHeight: `${smallLine}px`, color: "#5b4520" }}>
            <span className="block font-semibold" style={{ color: "#7a5a1c" }}>Agenda</span>
            {agenda.slice(0, agendaRows).map((a, i) => (
              <span key={a.id} className="block truncate">
                · {i === agendaRows - 1 && agenda.length > agendaRows ? `${a.title} +${agenda.length - agendaRows}` : a.title}
              </span>
            ))}
          </span>
        )}
        {agendaBadge && (
          <span className="mt-0.5 inline-flex items-center rounded-full px-1.5 font-semibold" style={{ fontSize: 10, lineHeight: "14px", background: "rgba(168,138,63,.18)", color: "#7a5a1c" }}>
            Agenda {agenda.length}
          </span>
        )}
        {timeLine && (
          <span className="block truncate" style={{ color: "var(--t-ink-soft)", fontSize: smallPx, lineHeight: `${smallLine}px` }}>
            {timeLabel}
          </span>
        )}
      </span>
      {payInline && <Pays xp={show.xp ? xpN : 0} coins={show.coins ? coinN : 0} done={done} />}
    </button>
  );
}

/** What a quest pays, on its calendar card: "+20 XP · 1 🪙" (done: what it paid, in green). */
function Pays({ xp, coins, done, center = false, px = 10.5 }: { xp: number; coins: number; done: boolean; center?: boolean; px?: number }) {
  if (!xp && !coins) return null;
  return (
    <span className={`flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums ${center ? "justify-center" : ""}`} style={{ fontSize: px, lineHeight: `${Math.round(px * 1.33)}px`, fontWeight: 700, color: done ? "#4e6a35" : "#7a5a1c" }}>
      {xp > 0 && <span>+{xp} XP</span>}
      {xp > 0 && coins > 0 && <span aria-hidden style={{ opacity: 0.5 }}>·</span>}
      {coins > 0 && (
        <span className="flex items-center gap-0.5">
          {coins}
          <CoinIcon size={Math.round(px + 0.5)} />
        </span>
      )}
    </span>
  );
}
