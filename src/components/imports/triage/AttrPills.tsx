"use client";

import { PillTrays } from "@/components/ui/PillTrays";
import { Fold, useLingerValue } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { useContext, useEffect, useRef, useState } from "react";
import type { ImportCard } from "@/lib/data/import-cards";
import { DateField } from "@/components/ui/DateField";
import { ESTIMATE_PICKS, dueChipLabel, shortTime, slotWords } from "@/components/tasks/editor/dates";
import { WhenPicker } from "@/components/calendar/WhenPicker";
import { IconScale } from "@/components/tasks/IconScale";
import { LevelScales } from "@/components/ui/LevelScales";
import { CoinIcon } from "@/components/ui/Icons";
import { NumberInput } from "@/components/ui/NumberInput";
import { withinLabel } from "@/components/tasks/ScheduleWithin";
import { ATTRS, AttrKey, Attrs, BoardsCtx, COIN_DEFAULT, XP_DEFAULT, fieldStyle, findBoard, inDays, pickOff, pickOn, tinyAttrs, XP_MAX } from "./types";
import { BoardStep } from "./Boards";

export function Glyph({ src, size = 14 }: { src: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- the quest card's own glyphs
  return <img src={src} alt="" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />;
}

/** The pills: the ones you chose show; the rest wait under "More". One opens its panel in place at a time. */
/** The quest editor's Calendar row: "Calendar · Sat 3–3:30pm · Change ×", Find a time opens the day picker in place. */
export function CalendarRow({ title, minutes, slot, onSlot }: { title: string; minutes: number | null; slot: { start: string; end: string } | null; onSlot: (s: { start: string; end: string } | null) => void }) {
  const { adventure } = useContext(BoardsCtx);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Once the day has slid open, bring it all into view above the bottom bar.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 340);
    return () => clearTimeout(t);
  }, [open]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-8 items-center gap-2">
        <Glyph src="/design/ui-calendar.png" />
        <span className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
          {slot ? "On your calendar" : "Pick a time"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] tabular-nums" style={{ color: slot ? "var(--t-ink)" : "var(--t-ink-soft)" }}>
          {slot ? slotWords(slot) : "optional"}
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="qe-fact flex h-8 shrink-0 items-center rounded-full px-3 text-[12.5px] font-semibold" data-open={open ? "true" : undefined}>
          {slot ? "Change" : "Open the day"}
        </button>
        {slot && (
          <button type="button" onClick={() => (onSlot(null), setOpen(false))} aria-label="Take it off the calendar" title="Take it off the calendar" className="h-8 w-6 shrink-0 leading-none" style={{ color: "var(--t-ink-soft)" }}>
            <CloseIcon size={10} />
          </button>
        )}
      </div>
      <Fold open={open}>
        {open && (
          <div ref={box} className="pt-1" style={{ scrollMarginBottom: 120, scrollMarginTop: 80 }}>
            <WhenPicker minutes={Math.max(15, minutes || 30)} title={title || "This quest"} isAdventure={!!adventure} initial={slot?.start ?? null} onPick={(s) => (onSlot({ start: s.start, end: s.end }), setOpen(false))} />
          </div>
        )}
      </Fold>
    </div>
  );
}

/** Fixed unless set otherwise: a date the notes gave reads as Fixed; a date picked here starts Flexible. */
export const firmOf = (attrs: Attrs, due: string | null) => (due ? (attrs.firm ?? true) : false);

/** The When panel's ranges, in the owner's words (Nov 18: "within a week" etc). */
export const RANGES = [
  { label: "Within a week", days: 7 },
  { label: "Within 2 weeks", days: 14 },
  { label: "Within a month", days: 30 },
];

export const rangeLabel = (n: number) => RANGES.find((r) => r.days === n)?.label ?? withinLabel(n);

export const weekdayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short" });

/** The When pill's words: "Within a week", "Around Fri", "By Fri", "Thu 3pm", or "When". */
export function whenFace(withinDays: number | null, due: string | null, firm: boolean, slot: { start: string; end: string } | null): string {
  const by = due ? `${firm ? "By" : "Around"} ${dueChipLabel(due)}` : withinDays != null ? rangeLabel(withinDays) : null;
  const at = slot ? `${weekdayOf(slot.start)} ${shortTime(slot.start).replace(":00", "")}` : null;
  return [by, at].filter(Boolean).join(" · ") || "When";
}

/**
 * When, on the import card (owner, Nov 18: "the scheduling / due date situation is too complex", then picked
 * layout 5c and the words Flexible / Fixed): one "Complete by" question. A range ("Within a week") or a day;
 * once one is set, "This date is Flexible · Fixed"; then an optional time on the calendar.
 * Flexible: the auto-scheduler aims for it and it never reads late. Fixed: it has to be done by then.
 */
export function WhenPanel({ card, attrs, due, minutes, set, onRate }: { card: ImportCard; attrs: Attrs; due: string | null; minutes: number | null; set: (p: Attrs) => void; onRate: (days: number | null) => void }) {
  const within = card.plan_within_days ?? null;
  const firm = firmOf(attrs, due);
  const [other, setOther] = useState(false);
  const days = [
    { label: "Today", day: inDays(0) },
    { label: "Tomorrow", day: inDays(1) },
  ];
  const ranges = RANGES;
  const pill = (on: boolean): React.CSSProperties => ({ ...pickOff, background: on ? "rgba(217,180,95,.45)" : pickOff.background });
  const pickDay = (day: string | null) => {
    if (within != null) onRate(null);
    set({ due: day, firm: false });
  };
  const pickRange = (n: number | null) => {
    onRate(n);
    set({ due: null, firm: false });
  };
  const setFirm = (f: boolean) => {
    if (f && !due && within != null) {
      // "Within a week", made Fixed: the last day of that range, which can then be changed.
      onRate(null);
      set({ due: inDays(within), firm: true });
    } else set({ firm: f });
  };
  const anything = !!due || within != null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
          Complete by
        </span>
        {days.map((q) => (
          <button key={q.label} type="button" aria-pressed={due === q.day} onClick={() => pickDay(due === q.day ? null : q.day)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={pill(due === q.day)}>
            {q.label}
          </button>
        ))}
        {ranges.map((o) => (
          <button key={o.label} type="button" aria-pressed={within === o.days && !due} onClick={() => pickRange(within === o.days ? null : o.days)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={pill(within === o.days && !due)}>
            {o.label}
          </button>
        ))}
        <button type="button" aria-expanded={other} onClick={() => setOther((v) => !v)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={pill(other || (!!due && !days.some((q) => q.day === due)))}>
          {due && !days.some((q) => q.day === due) ? dueChipLabel(due) : "Other…"}
        </button>
      </div>
      <Fold open={other}>
        <div className="flex items-center gap-2 pb-0.5">
          <span className="shrink-0 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
            On or by
          </span>
          <DateField value={due ?? ""} min={inDays(0)} onChange={(d) => (pickDay(d || null), setOther(false))} ariaLabel="Complete by date" placeholder="Pick a day" className="h-8 min-w-0 flex-1 rounded-lg border px-2 text-[15px]" style={fieldStyle} />
        </div>
      </Fold>
      <Fold open={anything}>
        <div className="flex flex-wrap items-center gap-2" data-when-firm>
          <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
            This date is
          </span>
          <span className="inline-flex h-8 overflow-hidden rounded-full text-[12.5px] font-semibold" style={{ border: "1px solid rgba(139,112,64,.55)" }} role="group" aria-label="Flexible or fixed">
            {[
              { f: false, label: "Flexible" },
              { f: true, label: "Fixed" },
            ].map((o) => (
              <button key={o.label} type="button" aria-pressed={firm === o.f} onClick={() => setFirm(o.f)} className="px-3" style={{ background: firm === o.f ? "rgba(217,180,95,.55)" : "transparent", color: firm === o.f ? "var(--t-ink)" : "var(--t-ink-soft)" }}>
                {o.label}
              </button>
            ))}
          </span>
          <span className="min-w-0 flex-1 text-[12px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
            {firm ? "Has to be done by then." : "A goal: it can slide if your week fills up."}
          </span>
        </div>
      </Fold>
      <CalendarRow title={card.title} minutes={minutes} slot={attrs.slot ?? null} onSlot={(slot) => set({ slot })} />
    </div>
  );
}

export function AttrPills({ card, attrs, shown, onChange, onRate, small = false }: { card: ImportCard; attrs: Attrs; shown: AttrKey[]; onChange: (a: Attrs) => void; onRate: (days: number | null) => void; small?: boolean }) {
  const { boards, add } = useContext(BoardsCtx);
  const [open, setOpen] = useState<AttrKey | null>(null);
  const [more, setMore] = useState(false);
  const [timeOther, setTimeOther] = useState(false);
  const xp = attrs.xp ?? XP_DEFAULT;
  const coins = attrs.coins ?? COIN_DEFAULT;
  const due = attrs.due === undefined ? (card.due_on ?? null) : attrs.due;
  const minutes = attrs.minutes === undefined ? (card.minutes ?? null) : attrs.minutes;
  const boardId = attrs.board === undefined ? (findBoard(boards, card.board_hint)?.id ?? null) : attrs.board;
  const board = boards.find((b) => b.id === boardId);
  const set = (p: Attrs) => onChange({ ...attrs, ...p });
  // The board is picked from the tag on the portrait now (owner, Nov 12), not from a pill.
  // The board and Tiny sit on the portrait now, as in the quest editor.
  shown = shown.filter((k) => k !== "board" && k !== "tiny");
  const hidden = ATTRS.map((a) => a.key).filter((k) => k !== "board" && !shown.includes(k));
  const face: Record<AttrKey, React.ReactNode> = {
    reward: (
      <>
        <span aria-hidden style={{ color: "var(--t-accent)" }}>✦</span>
        <span className="tabular-nums">{xp} XP</span>
        <span aria-hidden className="opacity-50">·</span>
        <CoinIcon size={13} />
        <span className="tabular-nums">{coins}</span>
      </>
    ),
    time: (
      <>
        <Glyph src="/design/ui-clock.png" />
        {/* Same width either way, so Tiny (which sets 5m) doesn't shift the pills after it. */}
        <span className="inline-block min-w-[2.4em] text-center">{minutes ? `${minutes}m` : "Time"}</span>
      </>
    ),
    due: (
      <>
        <Glyph src="/design/ui-calendar.png" />
        {/* One "when" (owner, Nov 18): "Within a week", "Around Fri", "By Fri", then a picked time: "By Fri · Thu 3pm". */}
        {whenFace(card.plan_within_days ?? null, due, firmOf(attrs, due), attrs.slot ?? null)}
      </>
    ),
    tiny: (
      <>
        <Glyph src="/design/ui-bolt.png" />
        Tiny
      </>
    ),
    importance: (
      <>
        <Glyph src="/design/ui-flame-sm.png" />
        {/* Urgency and importance, as on the quest card (owner, Nov 19), next to When. */}
        {attrs.urgency || attrs.importance ? [attrs.urgency ? `Urgency ${attrs.urgency}` : "", attrs.importance ? `Importance ${attrs.importance}` : ""].filter(Boolean).join(" · ") : "Urgency & importance"}
      </>
    ),
    board: (
      <>
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: board?.color ?? "#c8b38a" }} />
        <span className="max-w-[140px] truncate">{board ? board.title : "Board"}</span>
      </>
    ),
  };
  const button = (k: AttrKey) => {
    const lit = k === "tiny" ? !!attrs.tiny : open === k;
    return (
      <button
        key={k}
        type="button"
        aria-expanded={k === "tiny" ? undefined : open === k}
        aria-pressed={k === "tiny" ? !!attrs.tiny : undefined}
        aria-label={k === "tiny" ? "Tiny task: 2 energy boosts, 15 XP, 5 minutes, 1 coin" : k === "board" ? `Board: ${board ? board.title : "none"}` : undefined}
        onClick={() => {
          if (k === "tiny") return onChange(tinyAttrs(attrs, !attrs.tiny));
          setOpen(open === k ? null : k);
        }}
        className={`qe-fact flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 font-semibold ${small ? "h-7 text-[12px]" : "h-8 text-[12.5px]"}`}
        data-open={lit ? "true" : undefined}
      >
        {face[k]}
      </button>
    );
  };
  const panel = (k: AttrKey | null): React.ReactNode => {
    if (k === "reward")
      return (
        <div className="flex flex-col gap-2">
          {/* The quest editor's XP bar: −5, the slider, +5, the amount. */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => set({ xp: Math.max(0, xp - 5) })} aria-label="5 XP less" className="xp-nudge flex h-8 shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-bold tabular-nums">
              −5
            </button>
            <input type="range" min={0} max={XP_MAX} step={5} value={Math.min(XP_MAX, xp)} onChange={(e) => set({ xp: Number(e.target.value) })} aria-label="XP reward" className="h-8 min-w-0 flex-1" style={{ accentColor: "var(--t-accent)" }} />
            <button type="button" onClick={() => set({ xp: Math.min(1000, xp + 5) })} aria-label="5 XP more" className="xp-nudge flex h-8 shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-bold tabular-nums">
              +5
            </button>
            <span className="flex h-8 shrink-0 items-center rounded-lg border pr-1.5" style={fieldStyle}>
              <NumberInput min={0} max={1000} value={xp} onValueChange={(v) => set({ xp: v })} blankZero aria-label="XP amount" className="bare-input h-full w-11 bg-transparent px-1 text-right text-[16px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" style={{ color: "var(--t-accent)" }} />
              <span className="text-[12px] font-bold" style={{ color: "var(--t-accent)" }}>
                XP
              </span>
            </span>
          </div>
          {/* The editor's coin stepper. */}
          <span className="flex h-8 items-center gap-0.5 self-end rounded-lg border px-1" style={fieldStyle} title="Coins earned on completion">
            <button type="button" onClick={() => set({ coins: Math.max(0, coins - 1) })} aria-label="Fewer coins" className="flex h-7 w-6 items-center justify-center text-[17px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
              −
            </button>
            <CoinIcon size={16} />
            <NumberInput min={0} value={coins} onValueChange={(v) => set({ coins: v })} aria-label="Coins" className="bare-input h-full w-8 bg-transparent text-center text-[16px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" style={{ color: "#8a6116" }} />
            <button type="button" onClick={() => set({ coins: coins + 1 })} aria-label="More coins" className="flex h-7 w-6 items-center justify-center text-[17px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
              +
            </button>
          </span>
        </div>
      );
    if (k === "time")
      return (
        // The editor's Time picks: 5, 10, 15 or 30 minutes, or Other.
        <div className="flex flex-wrap items-center gap-1">
          {ESTIMATE_PICKS.map((m) => {
            const on = minutes === m && !timeOther;
            return (
              <button key={m} type="button" aria-pressed={on} onClick={() => (setTimeOther(false), set({ minutes: on ? null : m }))} className="h-8 min-w-10 rounded-full px-2.5 text-[13px] font-semibold tabular-nums" style={on ? pickOn : pickOff}>
                {m}m
              </button>
            );
          })}
          {timeOther || (minutes && !ESTIMATE_PICKS.includes(minutes)) ? (
            <span className="reveal flex h-8 items-center gap-1 rounded-full border pl-1 pr-2.5" style={{ borderColor: "#8a6116" }}>
              <input
                type="number"
                autoFocus={timeOther}
                onFocus={(e) => e.currentTarget.select()}
                inputMode="numeric"
                min={0}
                step={5}
                value={minutes ?? ""}
                onChange={(e) => set({ minutes: Number(e.target.value) > 0 ? Number(e.target.value) : null })}
                placeholder="—"
                aria-label="Minutes to complete"
                style={{ background: "transparent", boxShadow: "none" }}
                className="bare-input h-7 w-14 rounded-full border-0 bg-transparent px-1 text-center text-[16px] tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                min
              </span>
            </span>
          ) : (
            <button type="button" onClick={() => setTimeOther(true)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={pickOff}>
              Other
            </button>
          )}
        </div>
      );
    if (k === "due")
      return <WhenPanel card={card} attrs={attrs} due={due} minutes={minutes} set={set} onRate={onRate} />;
    if (k === "importance")
      return (
        // The quest editor's scales: importance, urgency, difficulty, energy boost (owner, Nov 6; urgency Nov 19).
        <LevelScales
          items={[
            { key: "importance", label: "Importance", icon: "/design/ui-trophy.svg", value: attrs.importance ?? 0, onChange: (v) => set({ importance: v }) },
            { key: "urgency", label: "Urgency", icon: "/design/ui-flame-sm.png", value: attrs.urgency ?? 0, onChange: (v) => set({ urgency: v }) },
            { key: "difficulty", label: "Difficulty", icon: "/design/ui-muscle.svg", hint: "How hard it is — how much it takes out of you", value: attrs.effort ?? 0, onChange: (v) => set({ effort: v }) },
            { key: "energy", label: "Energy boost", icon: "/design/ui-bolt.png", hint: "How much energy finishing it gives you", value: attrs.energy ?? 0, onChange: (v) => set({ energy: v }) },
          ]}
          renderRow={(it) => <IconScale label={it.label} icon={it.icon} hint={it.hint} value={it.value} onChange={it.onChange} />}
        />
      );
    if (k === "board")
      return (
        <div className="flex flex-col gap-1">
          <BoardStep bare boards={boards} hint={card.board_hint} value={boardId} onPick={(id) => (set({ board: id }), setOpen(null))} onCreate={(b) => (add(b), set({ board: b.id }), setOpen(null))} />
        </div>
      );
    return null;
  };
  // The panel keeps its last contents while it slides shut.
  const shownPanel = useLingerValue(open, 340);
  return (
    <PillTrays open={!!open} data-import-attrs>
      <div className="contents">
        {shown.map(button)}
        {hidden.length > 0 && (
          <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)} className={`qe-fact flex items-center whitespace-nowrap rounded-full px-2.5 font-semibold ${small ? "h-7 text-[12px]" : "h-8 text-[12.5px]"}`} data-open={more ? "true" : undefined} style={{ borderStyle: "dashed" }}>
            {more ? "Less" : "More…"}
          </button>
        )}
      </div>
      <div className="drawer-body basis-full" data-open={(more && hidden.length > 0) || undefined}>
        <div className="drawer-inner">
          <div className="flex flex-wrap items-center gap-1.5">{hidden.map(button)}</div>
        </div>
      </div>
      {/* The tray opens under the open pill's own line, pointing at it (owner, Nov 19). */}
      <div className="drawer-body" data-open={!!open || undefined} data-pill-tray>
        <div className="drawer-inner">
          <div className="pill-tray-pad">
            <div className="qe-fact-panel pill-tray-box flex flex-col gap-2 rounded-xl p-3">{panel(shownPanel.value)}</div>
          </div>
        </div>
      </div>
    </PillTrays>
  );
}

/** The gear by "Sort your imports": which quest details show on each card; the rest wait under "More…". */
export function AttrLayout({ open, shown, onChange }: { open: boolean; shown: AttrKey[]; onChange: (s: AttrKey[]) => void }) {
  return (
    <div className="drawer-body" data-open={open || undefined}>
      <div className="drawer-inner">
        <div className="parchment mt-2 flex flex-col gap-1.5 rounded-2xl px-3 py-2.5" style={{ border: "1px solid #b39a6a" }}>
          <p className="relative z-[1] m-0 text-[13px] font-semibold" style={{ color: "#4a3a22" }}>
            Shown on each card · the rest wait under More…
          </p>
          <div className="relative z-[1] flex flex-wrap gap-1.5">
            {ATTRS.map((a) => {
              const on = shown.includes(a.key);
              return (
                <button key={a.key} type="button" aria-pressed={on} onClick={() => onChange(on ? shown.filter((k) => k !== a.key) : [...shown, a.key])} className="qe-fact flex h-8 items-center rounded-full px-3 text-[12.5px] font-semibold" data-open={on ? "true" : undefined}>
                  {on ? "✓ " : ""}
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
