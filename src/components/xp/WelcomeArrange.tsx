"use client";

import { HabitOptions } from "@/components/xp/WelcomeHabits";

import { checkinLabel } from "@/lib/welcome";
import { useEffect, useRef, useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CHECKIN_ICONS, CHECKIN_STYLES, checkinIconOf, checkinStyleOf, loadFx, patchFx, type FxSettings } from "@/lib/celebration-fx";
import { ReflectionList } from "@/components/settings/ReflectionList";
import { WELCOME_ELS, reflectQuestions, addBackGreeting, backHours, backOwnOn, greetingPool, ownGreetings, ownLines, ownLinesOn, toggleEl, welcomeShows, type WelcomeEl } from "@/lib/welcome";
import { CastleArt } from "./CastleArt";
import { CheckinIcon } from "./CheckinIcon";
import { OwnWordsPill, PhraseList, WiseLines } from "@/components/settings/LineLists";
import { Fold, useLinger } from "@/components/ui/Fold";

/*
 * Settings in context (the app-wide pattern; see docs/HANDOFF.md, Product
 * taste): the gear arranges the screen it's on. What isn't part of the screen
 * itself (when it opens, confetti) sits in a panel above it; on the screen,
 * every part gets a ✎ beside it for its finer options, a hide button in its
 * top-right corner, and a drag bar to move it. Every change applies at once.
 */

const INK = "#3d2f18";
const SOFT = "#6b5631";
const GOLD = "#8a6116";
const CHIP = { border: "1.5px solid #b39a6a", background: "rgba(255,250,238,.75)", color: INK } as const;
const CHIP_ON = { border: "1.5px solid #4a3913", background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10" } as const;
const PANEL = { border: "1px solid rgba(139,112,64,.4)", background: "rgba(255,250,238,.7)" } as const;
const FIELD = { borderColor: "#b39a6a", background: "rgba(255,250,238,.95)", color: "#2a1c10" } as const;
const set = (patch: Partial<FxSettings>) => patchFx(patch);

/**
 * The choices that aren't part of the card itself (when it opens, confetti, the castle):
 * one folded line at the top of the card while arranging (it was a big panel above
 * the card that pushed Done off a phone's screen; owner's recordings, Nov 2).
 */
export function ArrangeAbove({ fx, castleHidden }: { fx: FxSettings; castleHidden: boolean }) {
  const h = backHours(fx);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full flex-col rounded-xl text-left" style={PANEL} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-9 w-full items-center gap-1.5 px-2.5 text-[12.5px]" style={{ color: INK }}>
        <span className="font-bold uppercase tracking-[.1em]" style={{ color: GOLD }}>
          Opens
        </span>
        <span className="min-w-0 flex-1 truncate">{h ? `First visit, then after ${h} ${h === 1 ? "hr" : "hrs"} away` : "First visit of the day only"}{fx.welcomeConfetti !== false ? " · 🎉" : ""}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Fold open={open}>
        <div className="flex flex-col gap-2 px-2.5 pb-2.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px]" style={{ color: INK }}>
            <span>{h ? "First visit of the day, then again after" : "Only the day's first visit"}</span>
            <span className="inline-flex h-8 items-center rounded-full" style={CHIP}>
              <button type="button" onClick={() => set({ welcomeBackHours: Math.max(0, h - 1) })} disabled={h <= 0} aria-label="Fewer hours (0 = first visit only)" className="flex h-8 w-7 items-center justify-center rounded-l-full text-[16px] disabled:opacity-30">
                −
              </button>
              <span className="font-display min-w-[58px] text-center text-[14.5px] tabular-nums">{h ? `${h} ${h === 1 ? "hr" : "hrs"}` : "never"}</span>
              <button type="button" onClick={() => set({ welcomeBackHours: Math.min(12, h + 1) })} disabled={h >= 12} aria-label="More hours" className="flex h-8 w-7 items-center justify-center rounded-r-full text-[16px] disabled:opacity-30">
                +
              </button>
            </span>
            {h > 0 && <span>away</span>}
          </div>
          <button type="button" role="switch" aria-checked={fx.welcomeConfetti !== false} onClick={() => set({ welcomeConfetti: fx.welcomeConfetti === false })} title="Confetti on the day's first visit" className="flex h-8 items-center gap-1 self-start rounded-full px-2.5 text-[12.5px] font-semibold" style={fx.welcomeConfetti !== false ? CHIP_ON : CHIP}>
            🎉 Confetti {fx.welcomeConfetti !== false ? "on" : "off"}
          </button>
          {/* On a narrow screen the castle is off to the side, out of view; its choice comes up here instead. */}
          {castleHidden && (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold" style={{ color: INK }}>
                The castle on the far hill
              </span>
              <CastleChoices fx={fx} />
            </div>
          )}
        </div>
      </Fold>
    </div>
  );
}

/** The castle: a spire castle drawn from a seed; Generate castle draws a new one. */
function CastleChoices({ fx }: { fx: FxSettings }) {
  return (
    <div className="flex items-center gap-2">
      <svg aria-hidden viewBox="-110 -170 220 182" className="h-16 w-20 shrink-0 rounded-lg" style={{ background: "linear-gradient(180deg, #a9cbe6, #eef2ec)" }}>
        <path d="M-110,12 Q-40,-6 0,0 T110,-2 V12 Z" fill="#7aa1a6" />
        <CastleArt design="spires" seed={fx.welcomeCastleSeed} colors={{ wall: "#f5f7f9", shade: "#c5d1dc", roof: "#4f7fb3", gold: "#e8c25c" }} />
      </svg>
      <button type="button" onClick={() => set({ welcomeCastleSeed: 1 + Math.floor(Math.random() * 2_000_000_000) })} className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold" style={CHIP_ON}>
        ✦ Generate castle
      </button>
    </div>
  );
}

/** The ✎ that sits right beside the castle, with its choices. */
export function CastleEdit({ fx }: { fx: FxSettings }) {
  const [open, setOpen] = useState(false);
  const pop = useLinger(open);
  return (
    <div className="pointer-events-auto relative" onClick={(e) => e.stopPropagation()}>
      <EditButton open={open} onClick={() => setOpen((v) => !v)} label="Change the castle" />
      {pop.shown && (
        <div className={`parchment card-pop-in absolute bottom-10 right-0 z-10 w-max rounded-xl p-2 shadow-xl${pop.leaving ? " pop-leave" : ""}`}>
          <div className="relative z-[1]">
            <CastleChoices fx={fx} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The small ✎ beside a part: opens its finer options. */
export function EditButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      title={label}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full align-middle transition-colors hover:bg-[rgba(139,112,64,.14)]"
      style={open ? { background: "rgba(217,180,95,.45)", color: "#4a3913" } : { color: "#8a6c2c" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Under the heading, from its ✎: add a greeting, your own words, and which greetings take turns. */
export function GreetingOptions({ fx }: { fx: FxSettings }) {
  const [phrase, setPhrase] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <div className="reveal flex w-full flex-col gap-2 rounded-xl p-2.5 text-left" style={PANEL}>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!phrase.trim()) return;
          patchFx(addBackGreeting(loadFx(), phrase));
          setPhrase("");
          setSaved(true);
        }}
      >
        <input value={phrase} onChange={(e) => (setPhrase(e.target.value), setSaved(false))} maxLength={120} placeholder="Add a greeting, e.g. The hearth is warm, come in" aria-label="Add a greeting" className="h-9 min-w-0 flex-1 rounded-full border px-3 text-[16px]" style={FIELD} />
        <button type="submit" disabled={!phrase.trim()} className="h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold disabled:opacity-50" style={CHIP_ON}>
          Add
        </button>
      </form>
      {saved && (
        <p className="fade-in m-0 text-[12.5px] italic" style={{ color: "#3d5a1e" }}>
          ✓ Added. It takes its turn on future visits.
        </p>
      )}
      <PhraseList
        title="Greetings that take turns"
        lines={greetingPool(fx)}
        isOn={(l) => !(fx.welcomeBackOff ?? []).includes(l)}
        onToggle={(l, on) => set({ welcomeBackOff: on ? (fx.welcomeBackOff ?? []).filter((x) => x !== l) : [...(fx.welcomeBackOff ?? []), l] })}
      />
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold" style={{ color: INK }}>
          Your own greetings
        </span>
        <span className="ml-auto">
          <OwnWordsPill on={backOwnOn(fx)} onClick={() => set({ welcomeBackOwn: !backOwnOn(fx) })} label="Use them" />
        </span>
      </div>
      {backOwnOn(fx) && (
        <textarea
          value={ownGreetings(fx).join("\n")}
          onChange={(e) => set({ welcomeBackText: e.target.value.slice(0, 1200), welcomeText: "" })}
          rows={3}
          placeholder={"One per line; they take turns with the others."}
          aria-label="Your own greetings"
          className="reveal rounded-lg border px-3 py-2 text-[16px]"
          style={FIELD}
        />
      )}
    </div>
  );
}

const HAS_OPTIONS: WelcomeEl[] = ["checkin", "line", "focus", "reflect", "habits"];

/**
 * The card's parts while arranging: drag a part itself to move it; its hide
 * button sits in its top-right corner; its ✎ opens its finer options. Hidden
 * parts wait at the end, faded, to be shown again.
 */
export function ArrangeList({ fx, order, parts, empty, focusEl }: { fx: FxSettings; order: WelcomeEl[]; parts: Partial<Record<WelcomeEl, React.ReactNode>>; empty: Partial<Record<WelcomeEl, string>>; /** Opened by a long press on this part: its options start open. */ focusEl?: WelcomeEl | null }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // A finger holds a moment before a part lifts, so scrolling the list never grabs one.
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  // Hidden parts stay where they are (dimmed, eye closed); archived ones wait at the very bottom.
  const archived = order.filter((el) => (fx.welcomeArchived ?? []).includes(el));
  const active = order.filter((el) => !archived.includes(el));
  const [archiveOpen, setArchiveOpen] = useState(false);
  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const next = arrayMove(active, active.indexOf(a.id as WelcomeEl), active.indexOf(over.id as WelcomeEl));
    set({ welcomeOrder: [...next, ...archived] });
  }
  const archive = (el: WelcomeEl) => {
    const hide = welcomeShows(fx, el) ? toggleEl(fx, el) : {};
    set({ ...hide, welcomeArchived: [...new Set([...(fx.welcomeArchived ?? []), el])] });
  };
  const unarchive = (el: WelcomeEl) => set({ welcomeArchived: (fx.welcomeArchived ?? []).filter((x) => x !== el) });
  return (
    <div className="flex w-full flex-col gap-1.5">
      <DndContext
        id="dnd-welcome"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        // Only the card scrolls while dragging, gently, near its edges (the page behind never does).
        autoScroll={{ threshold: { x: 0, y: 0.12 }, acceleration: 5, canScroll: (el) => el.hasAttribute("data-welcome-card") }}
      >
        <SortableContext items={active} strategy={verticalListSortingStrategy}>
          {active.map((el) => (
            <Part key={el} el={el} fx={fx} empty={empty[el]} onArchive={() => archive(el)} startOpen={el === focusEl}>
              {parts[el]}
            </Part>
          ))}
        </SortableContext>
      </DndContext>
      {/* Archived: out of the way, at the very bottom; tap one to bring it back (hidden, ready to show). */}
      {archived.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: "rgba(139,112,64,.25)" }}>
          <button type="button" onClick={() => setArchiveOpen((v) => !v)} aria-expanded={archiveOpen} className="flex items-center gap-1.5 self-start text-[12px] font-semibold" style={{ color: SOFT }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: archiveOpen ? "rotate(90deg)" : undefined }}>
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Archived ({archived.length})
          </button>
          <Fold open={!!archiveOpen}>
            <div className="flex flex-wrap gap-1.5">
              {archived.map((el) => {
                const meta = WELCOME_ELS.find((m) => m.key === el)!;
                return (
                  <button key={el} type="button" onClick={() => unarchive(el)} title={`Bring back ${meta.label} (hidden)`} className="flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold" style={{ ...CHIP, borderStyle: "dashed" }}>
                    <span aria-hidden>↩</span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </Fold>
        </div>
      )}
    </div>
  );
}

/** What each part is, in a few words (compact rows while arranging). */
const SHORT: Record<WelcomeEl, string> = {
  checkin: "energy, mood and more",
  sleep: "last night, factors, quality",
  focus: "your own words",
  quests: "due soon and today's",
  streak: "days in a row",
  line: "a wise line a day",
  reflect: "your own questions",
  habits: "the ones you pick",
  bar: "level and XP",
  reward: "XP and coins",
  due: "quests due soon",
};

/**
 * One part while arranging: a slim row (its name, a few words, ✎, the eye), so the
 * whole list fits on a phone and a drag never has far to go. Press and hold (or drag
 * with a mouse) to move it; a tap opens its options right under it.
 */
function Part({ el, fx, empty, children, onArchive, startOpen = false }: { el: WelcomeEl; fx: FxSettings; empty?: string; children: React.ReactNode; onArchive: () => void; startOpen?: boolean }) {
  const meta = WELCOME_ELS.find((m) => m.key === el)!;
  const showing = welcomeShows(fx, el);
  const hasOptions = HAS_OPTIONS.includes(el);
  const [open, setOpen] = useState(startOpen && hasOptions);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: el });
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Opened by a long press on the part itself: bring it into view.
  useEffect(() => {
    if (startOpen) rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [startOpen]);
  return (
    <div
      ref={(n) => {
        setNodeRef(n);
        rowRef.current = n;
      }}
      {...attributes}
      {...listeners}
      data-arrange-part={el}
      className={`arrange-row relative flex w-full flex-col rounded-xl ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
        border: "1.5px solid rgba(139,112,64,.4)",
        background: isDragging ? "rgba(255,248,228,.97)" : showing ? "rgba(255,250,238,.45)" : "rgba(120,100,60,.05)",
        borderStyle: showing ? "solid" : "dashed",
        boxShadow: isDragging ? "0 10px 24px rgba(0,0,0,.25)" : undefined,
      }}
    >
      {/* Its name and a few words (a tap opens its options), its ✎, and the eye on the right. */}
      <div className="flex h-9 items-center gap-1 pl-2.5 pr-1" onClick={hasOptions ? () => setOpen((v) => !v) : undefined} title={meta.hint}>
        <span className={`flex min-w-0 flex-1 items-baseline gap-1.5 text-left ${showing ? "" : "opacity-55"}`}>
          <span className="shrink-0 text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
            {meta.label}
          </span>
          <span className="min-w-0 truncate text-[12px] italic" style={{ color: SOFT }}>
            {children ? SHORT[el] : (empty ?? SHORT[el])}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {hasOptions && <EditButton open={open} onClick={() => setOpen((v) => !v)} label={`Edit ${meta.label}`} />}
          {!showing && (
            <button type="button" onClick={onArchive} title="Archive it (out of the way, at the bottom)" aria-label={`Archive ${meta.label}`} className="flex h-8 items-center rounded-full px-1.5 text-[11.5px] underline underline-offset-2 hover:bg-black/[.06]" style={{ color: SOFT }}>
              Archive
            </button>
          )}
          <button
            type="button"
            onClick={() => set(toggleEl(fx, el))}
            aria-pressed={showing}
            aria-label={showing ? `${meta.label}: showing. Hide it` : `${meta.label}: hidden. Show it`}
            title={showing ? "Showing · tap to hide" : "Hidden · tap to show"}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]"
            style={{ color: showing ? GOLD : SOFT, background: showing ? "rgba(217,180,95,.18)" : "transparent" }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              {showing ? <circle cx="12" cy="12" r="3" fill="currentColor" /> : <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />}
            </svg>
          </button>
        </span>
      </div>
      {/* Its options slide open under it. Typing there: keys stay in the field (Space mustn't pick the part up). */}
      {hasOptions && (
        <Fold open={open}>
          <div className="flex flex-col gap-1.5 px-2.5 pb-2" onKeyDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {el === "checkin" && <CheckinOptions fx={fx} />}
            {el === "line" && <LineOptions fx={fx} />}
            {el === "habits" && <HabitOptions fx={fx} />}
            {el === "reflect" && <ReflectionList list={reflectQuestions(fx)} onChange={(l) => set({ reflectQuestions: l })} />}
            {el === "focus" && <QuestionOptions fx={fx} k="welcomeFocusQ" label="The question" fallback="What are your top priorities today?" />}
          </div>
        </Fold>
      )}
    </div>
  );
}

/** Your own words for one of the screen's questions. */
function QuestionOptions({ fx, k, label, fallback }: { fx: FxSettings; k: "welcomeFocusQ" | "welcomeIntentionQ" | "welcomeIntentionHint"; label: string; fallback: string }) {
  return (
    <label className="reveal flex flex-col gap-1 rounded-xl p-2.5 text-left text-[12.5px] font-semibold" style={{ ...PANEL, color: INK }}>
      {label}
      <input value={fx[k] ?? ""} onChange={(e) => set({ [k]: e.target.value.slice(0, 140) })} placeholder={fallback} className="h-9 rounded-lg border px-2.5 text-[16px] font-normal" style={FIELD} />
    </label>
  );
}

function CheckinOptions({ fx }: { fx: FxSettings }) {
  return (
    <div className="reveal flex flex-col gap-2 rounded-xl p-2.5 text-left" style={PANEL}>
      <span className="text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
        The button
      </span>
      <div role="radiogroup" aria-label="The Check in button's look" className="flex flex-wrap justify-center gap-1.5">
        {CHECKIN_STYLES.map((c) => {
          const on = checkinStyleOf(fx).key === c.key;
          return (
            <button key={c.key} type="button" role="radio" aria-checked={on} aria-label={c.label} title={c.hint} onClick={() => set({ checkinStyle: c.key })} className="rounded-full p-0.5" style={{ boxShadow: on ? `0 0 0 2px ${GOLD}` : undefined }}>
              <span className="font-display flex h-8 items-center gap-1 rounded-full px-3 text-[13.5px]" style={c.style}>
                <CheckinIcon icon={checkinIconOf(fx)} /> {checkinLabel(fx)}
              </span>
            </button>
          );
        })}
      </div>
      <label className="flex flex-col gap-1 text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
        Its words
        <input value={fx.checkinText ?? ""} onChange={(e) => set({ checkinText: e.target.value.slice(0, 40) })} placeholder="Emotional check-in" className="h-9 rounded-lg border px-2.5 text-[16px] font-normal normal-case tracking-normal" style={FIELD} />
      </label>
      <span className="text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
        Its icon
      </span>
      <div role="radiogroup" aria-label="The Check in button's icon" className="flex flex-wrap gap-1">
        {CHECKIN_ICONS.map((c) => {
          const on = checkinIconOf(fx) === c.key;
          return (
            <button key={c.key} type="button" role="radio" aria-checked={on} aria-label={c.label} title={c.label} onClick={() => set({ checkinIcon: c.key })} className="flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-[12px] font-semibold" style={on ? checkinStyleOf(fx).style : CHIP}>
              {c.key === "none" ? "None" : <CheckinIcon icon={c.key} size={18} />}
            </button>
          );
        })}
      </div>
      {(
        [
          ["welcomeSleep", "Last night's sleep times, on the day's first visit"],
          ["welcomeMetrics", "Mood and everything else you track, open"],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="flex min-h-8 items-center gap-2 text-[13px]" style={{ color: INK }}>
          <input type="checkbox" className="h-4 w-4 accent-[var(--t-gold-deep)]" checked={fx[k] !== false} onChange={() => set({ [k]: fx[k] === false })} />
          {label}
        </label>
      ))}
    </div>
  );
}

/** One list of the wise lines, with "+ My own words" beside its header. */
function LineOptions({ fx }: { fx: FxSettings }) {
  return (
    <div className="reveal flex flex-col gap-2 rounded-xl p-2.5 text-left" style={PANEL}>
      <WiseLines
        own={ownLines(fx)}
        alwaysOpen
        extra={<OwnWordsPill on={ownLinesOn(fx)} onClick={() => set({ welcomeOwnOn: !ownLinesOn(fx) })} />}
        ownBox={
          ownLinesOn(fx) && (
            <textarea
              value={fx.welcomeOwnLines ?? ""}
              onChange={(e) => set({ welcomeOwnLines: e.target.value.slice(0, 2400) })}
              rows={3}
              placeholder={"One per line; mixed in with the built-in lines."}
              aria-label="Your own wise lines"
              className="reveal rounded-lg border px-3 py-2 text-[16px]"
              style={FIELD}
            />
          )
        }
      />
    </div>
  );
}

/** A gilded checkbox: a small wax-gold square that fills with a drawn check. */
export function GoldCheck({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-start gap-2.5 text-left text-[14px] leading-snug" style={{ color: INK }}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[#8a6116]"
        style={
          checked
            ? { background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "1.5px solid #4a3913", boxShadow: "0 0 8px rgba(242,210,126,.55), inset 0 1px 0 rgba(255,255,255,.6)" }
            : { background: "rgba(255,250,238,.85)", border: "1.5px solid #b39a6a", boxShadow: "inset 0 1px 2px rgba(0,0,0,.12)" }
        }
      >
        {checked && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="gold-check-draw">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#3a2a10" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span>{children}</span>
    </label>
  );
}
