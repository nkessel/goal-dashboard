"use client";

import { Fold } from "@/components/ui/Fold";
import { SnoozeIcon } from "@/components/ui/Icons";
import { FileChips } from "@/components/ui/FileChips";
import { useContext, useState } from "react";
import type { ImportCard } from "@/lib/data/import-cards";
import { dueChipLabel, slotWords } from "@/components/tasks/editor/dates";
import { ScheduleWithin as SchedRate } from "@/components/tasks/ScheduleWithin";
import { AttrKey, Attrs, BoardsCtx, GOLD, KINDS, KIND_ONE, Kind, chip, dayLabel, findBoard, importLabel, importWhere, minutesLabel, rateable, withAttrs } from "./types";
import { BoardFold, PortraitBoard } from "./Boards";
import { SubQuests } from "./SubQuests";
import { AttrPills, firmOf, rangeLabel } from "./AttrPills";

export function CardView({ card, frame, onEdit, onRetag, onRate, attrs, shownAttrs, onAttrs, onImport, onDone, onSnooze, onQuick, onSkip, menu, setMenu, onDelete }: { card: ImportCard; frame: React.CSSProperties; onRate: (days: number | null) => void; attrs: Attrs; shownAttrs: AttrKey[]; onAttrs: (a: Attrs) => void; onQuick: (until: Date, label: string) => void; onEdit: (p: { title: string; description: string }) => void; onRetag: (k: Kind) => void; onImport: () => void; onDone: () => void; onSnooze: () => void; onSkip: () => void; menu: boolean; setMenu: (v: boolean) => void; onDelete: () => void }) {
  const [source, setSource] = useState(false);
  const [picking, setPicking] = useState(false);
  const [later, setLater] = useState(false);
  const [boarding, setBoarding] = useState(false);
  // Files kept with the card go with it onto the quest (adding one is in the quest editor's More).
  const files = card.attachments ?? [];
  const pills = withAttrs(card.kind);
  const facts = [card.repeat_text, card.due_on && !pills ? `Due ${dayLabel(card.due_on)}` : null, card.minutes && !pills ? minutesLabel(card.minutes) : null, card.board_hint && !pills ? `Board: ${card.board_hint}` : null].filter(Boolean) as string[];
  return (
    <div className="card-pop-in parchment relative flex flex-col gap-2.5 rounded-3xl p-4" style={frame} onContextMenu={(e) => (e.preventDefault(), setMenu(true))}>
      <div className="flex items-center gap-2 pr-9">
        {/* One tap retags it: quest, to schedule, habit. */}
        <KindBadge kind={card.kind} open={picking} onToggle={() => setPicking((v) => !v)} />
      </div>
      <KindPicker open={picking} kind={card.kind} onPick={(k) => (onRetag(k), setPicking(false))} />
      <button type="button" onClick={() => setMenu(!menu)} aria-label="More choices" aria-expanded={menu} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[18px] hover:bg-black/[.06]" style={{ color: "#6b5631" }}>
        ⋯
      </button>
      {menu && (
        <div className="reveal absolute right-2 top-11 z-[5] flex min-w-[160px] flex-col rounded-xl p-1" style={{ background: "#fbf3df", border: "1px solid #a88a3f", boxShadow: "0 8px 20px rgba(0,0,0,.25)" }}>
          <button type="button" onClick={() => (setLater(true), setMenu(false))} className="h-9 rounded-lg px-3 text-left text-[14px] hover:bg-black/[.05]" style={{ color: "#2a1c10" }}>
            Snooze…
          </button>
          <button type="button" onClick={onDelete} className="h-9 rounded-lg px-3 text-left text-[14px] hover:bg-black/[.05]" style={{ color: "#8b2c1a" }}>
            Delete for good
          </button>
        </div>
      )}
      {/* Portrait left with its board on it, name, notes and sub-quests right: like a quest card (owner, Nov 12). */}
      <div className="flex items-start gap-3">
        {pills && <PortraitBoard card={card} attrs={attrs} open={boarding} onToggle={() => setBoarding((v) => !v)} onAttrs={onAttrs} />}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* Tap the name or the notes to edit them where they sit (owner, Nov 14: no ✎). */}
          <InlineCardText card={card} onEdit={onEdit} />
        </div>
      </div>
      {/* The full width of the card (owner, Nov 12), and edited right here. */}
      <SubQuests card={card} attrs={attrs} onAttrs={onAttrs} />
      {pills && <BoardFold card={card} attrs={attrs} open={boarding} onAttrs={onAttrs} onClose={() => setBoarding(false)} />}
      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FileChips files={files} />
        </div>
      )}
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {facts.map((f) => (
            <span key={f} className="rounded-full px-2.5 py-1 text-[12.5px]" style={{ background: "rgba(255,250,238,.7)", border: "1px solid #c8b38a", color: "#4a3a22" }}>
              {f}
            </span>
          ))}
        </div>
      )}
      {rateable(card.kind) && !withAttrs(card.kind) && <SchedRate days={card.plan_within_days} onRate={onRate} />}
      {withAttrs(card.kind) && <AttrPills card={card} attrs={attrs} shown={shownAttrs} onChange={onAttrs} onRate={onRate} />}
      {(card.source_label || card.source_text) && (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => setSource(!source)} disabled={!card.source_text} aria-expanded={source} className="flex items-center gap-1 self-start text-[12.5px]" style={{ color: "#7a6440" }}>
            From {card.source_label || "your notes"}
            {card.source_text && <span aria-hidden className="inline-block transition-transform" style={{ transform: source ? "rotate(90deg)" : undefined }}>›</span>}
          </button>
          <div className="drawer-body" data-open={source || undefined}>
            <div className="drawer-inner">
              <p className="m-0 max-h-[180px] overflow-y-auto whitespace-pre-wrap rounded-lg px-2.5 py-2 text-[13px] italic" style={{ background: "rgba(255,250,238,.55)", color: "#5a4a30", border: "1px dashed #c8b38a" }}>
                {card.source_text}
              </p>
            </div>
          </div>
        </div>
      )}
      <span className="text-[12.5px] leading-snug" style={{ color: "#6b5631" }}>
        <LandsLine card={card} attrs={attrs} />
      </span>
      <ImportFoot card={card} later={later} onLater={() => setLater((v) => !v)} onImport={onImport} onDone={onDone} onArchive={onSkip} onDelete={onDelete} />
      <LaterRow open={later} done={card.kind === "done"} onSnooze={onSnooze} onSkip={onSkip} onDelete={onDelete} onQuick={onQuick} />
    </div>
  );
}

/**
 * One line, just above Import, naming where this card lands (owner, Nov 15): the board, the due day,
 * the calendar time or the auto-scheduler's list. Other kinds keep their plain line.
 */
export function LandsLine({ card, attrs }: { card: ImportCard; attrs: Attrs }) {
  const { boards } = useContext(BoardsCtx);
  let words = importWhere(card.kind, card.plan_within_days);
  if (card.kind === "quest" || card.kind === "schedule" || card.kind === "shopping") {
    const boardId = attrs.board === undefined ? (findBoard(boards, card.board_hint)?.id ?? null) : attrs.board;
    const board = boards.find((b) => b.id === boardId);
    const due = attrs.due === undefined ? (card.due_on ?? null) : attrs.due;
    words = landsWords(board?.title ?? null, attrs.slot ?? null, card.plan_within_days ?? null, due, firmOf(attrs, due), !!attrs.oneDay);
  }
  return <>{words}</>;
}

/**
 * What happens to a quest when you press Import, in one or two plain sentences (owner, Nov 18: "make sure
 * that the user knows what's happening to it when they accept the import"). Nothing goes on the calendar
 * without the user's own pick: a picked time puts it there; "Schedule within" puts it on the auto-scheduler's list.
 */
export function landsWords(board: string | null, slot: { start: string; end: string } | null, withinDays: number | null, due: string | null, firm = true, oneDay = false): string {
  const where = board ? `Goes on the ${board} board and in Additional Quests` : "Goes in Additional Quests";
  const by = due ? (firm ? `, to be done by ${dueChipLabel(due)} (fixed)` : `, aiming for ${dueChipLabel(due)}`) : "";
  const later = " It won't be on your calendar until you Auto-schedule it.";
  if (slot) return `${where}, and on your calendar ${slotWords(slot)}${by}.`;
  if (due) return `${where}, and onto the auto-scheduler's list ${firm ? `to be placed before ${dueChipLabel(due)} (fixed)` : `to get a time around ${dueChipLabel(due)}`}.${later}`;
  if (withinDays != null) return `${where}, and onto the auto-scheduler's list to get a time ${withinWords(withinDays)}.${later}`;
  if (oneDay) return `${where}, for one day. No timeframe, so the auto-scheduler leaves it alone.`;
  return `${where}. Not on your calendar.`;
}

/** "within a week", "today", "within 2 weeks": the Schedule within pick, as the end of a sentence. */
export function withinWords(days: number): string {
  if (days <= 0) return "today";
  const label = rangeLabel(days).toLowerCase();
  return label.startsWith("within") || label.startsWith("this") ? label : `within ${label}`;
}

/**
 * The card's foot (owner, Nov 12): a trash can at the lower left (deleted after a moment, with Undo),
 * "Already done ✓" beside Import as in the quest editor (logs it done: XP now, nothing left open), then Import.
 */
export function ImportFoot({ card, small = false, later, onLater, onImport, onDone, onArchive, onDelete }: { card: ImportCard; small?: boolean; later: boolean; onLater: () => void; onImport: () => void; onDone: () => void; onArchive: () => void; onDelete: () => void }) {
  const canDone = card.kind === "quest" || card.kind === "schedule" || card.kind === "shopping" || card.kind === "project";
  // Archive (owner, Nov 25): asks Archive, Delete or Cancel, right here in the foot.
  const [asking, setAsking] = useState(false);
  const h = small ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-[13.5px]";
  if (asking)
    return (
      <div className="reveal flex flex-wrap items-center gap-1.5" data-import-foot data-archive-ask>
        <span className="text-[13px]" style={{ color: "#6b5631" }}>
          Put it away?
        </span>
        <button type="button" onClick={() => (setAsking(false), onArchive())} title="Into the Archived list at the bottom (bring it back any time)" className={`${h} rounded-full font-semibold`} style={chip(false)}>
          Archive
        </button>
        <button type="button" onClick={() => (setAsking(false), onDelete())} title="Deleted for good (Undo for a few seconds)" className={`${h} rounded-full font-semibold`} style={{ color: "#fff", background: "#8b2c1a", border: "1px solid #6b1f12" }}>
          Delete
        </button>
        <button type="button" onClick={() => setAsking(false)} className={`${h} rounded-full`} style={{ color: "#6b5631" }}>
          Cancel
        </button>
      </div>
    );
  return (
    <div className="flex items-center gap-1.5" data-import-foot>
      <button type="button" onClick={() => setAsking(true)} aria-label="Archive or delete…" title="Archive or delete" className={`${small ? "h-8 w-8" : "h-10 w-10"} flex shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]`} style={{ color: "#6b5631" }}>
        <ArchiveIcon size={small ? 15 : 17} />
      </button>
      {/* Snooze (owner, Nov 12: between delete and Already done): opens Tomorrow / Next week / Next month / Other… / Archive in place. */}
      <button type="button" onClick={onLater} aria-label="Snooze…" aria-expanded={later} title="Snooze or archive" className={`${small ? "h-8 w-8" : "h-10 w-10"} flex shrink-0 items-center justify-center rounded-full`} style={{ color: "#6b5631", background: later ? "rgba(217,180,95,.28)" : "transparent" }}>
        <SnoozeIcon size={small ? 15 : 17} />
      </button>
      {/* Already done: a green check, the third quiet button at the lower left (owner, Nov 12). */}
      {canDone && (
        <button type="button" onClick={onDone} aria-label="Already done" title="Already done: log it as done now (its XP, nothing left open)" className={`${small ? "h-8 w-8" : "h-10 w-10"} flex shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]`} style={{ color: "#2f7d4f" }}>
          <svg width={small ? 17 : 20} height={small ? 17 : 20} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <span className="flex-1" />
      <button type="button" onClick={onImport} className={`${small ? "h-8 px-4 text-[13.5px]" : "h-11 px-5 text-[15px]"} shrink-0 whitespace-nowrap rounded-full font-semibold`} style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
        {importLabel(card.kind)}
      </button>
    </div>
  );
}

export function ArchiveIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3.5 4.5h17v4h-17zM5 8.5V19.5h14V8.5M10 12.5h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5.5M14 11v5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "Snooze…": snooze it (quick picks here, Other… for the full picker), archive it, or delete it. */
export function LaterRow({ open, small = false, done, onSnooze, onSkip, onDelete, onQuick }: { open: boolean; small?: boolean; done: boolean; onSnooze: () => void; onSkip: () => void; onDelete: () => void; onQuick: (until: Date, label: string) => void }) {
  const [sure, setSure] = useState(false);
  const h = small ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-[13.5px]";
  const at = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(8, 0, 0, 0);
    return d;
  };
  return (
    <Fold open={open}>
      <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
        {!done && (
          <>
            <button type="button" onClick={() => onQuick(at(1), "until tomorrow")} className={`${h} rounded-full font-semibold`} style={chip(false)}>
              Tomorrow
            </button>
            <button type="button" onClick={() => onQuick(at(7), "for a week")} className={`${h} rounded-full font-semibold`} style={chip(false)}>
              Next week
            </button>
            <button type="button" onClick={() => onQuick(at(30), "for a month")} className={`${h} rounded-full font-semibold`} style={chip(false)}>
              Next month
            </button>
            <button type="button" onClick={onSnooze} className={`${h} rounded-full font-semibold`} style={chip(false)}>
              Other…
            </button>
          </>
        )}
        <button type="button" onClick={onSkip} title="Into the Archived list at the bottom (bring it back any time)" className={`${h} rounded-full font-semibold`} style={chip(false)}>
          Archive (keep for later)
        </button>
        {sure ? (
          // Asked once more, right here.
          <span className="reveal flex items-center gap-1.5">
            <span className="text-[12.5px]" style={{ color: "#8b2c1a" }}>
              Delete this item for good?
            </span>
            <button type="button" onClick={onDelete} className={`${h} rounded-full font-semibold`} style={{ color: "#fff", background: "#8b2c1a", border: "1px solid #6b1f12" }}>
              Yes, delete
            </button>
            <button type="button" onClick={() => setSure(false)} className={`${h} rounded-full`} style={{ color: "#6b5631" }}>
              Keep it
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setSure(true)} className={`${h} rounded-full`} style={{ color: "#8b2c1a" }}>
            Delete item
          </button>
        )}
      </div>
    </Fold>
  );
}

/**
 * A card's name and notes, edited right where they sit (owner, Nov 14: "the user can just click on the title or
 * desc to start editing inline"): same font and size while typing, no box or wash (`bare-input`), saved on
 * leaving the field or Enter in the name; Esc puts it back. Empty notes show a quiet "Add notes" line.
 */
export function InlineCardText({ card, onEdit, small = false }: { card: ImportCard; onEdit: (p: { title: string; description: string }) => void; small?: boolean }) {
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.description ?? "");
  const [seen, setSeen] = useState({ t: card.title, d: card.description ?? "" });
  // A fresh card (or a change saved elsewhere) replaces what's shown.
  if (seen.t !== card.title || seen.d !== (card.description ?? "")) {
    setSeen({ t: card.title, d: card.description ?? "" });
    setTitle(card.title);
    setNotes(card.description ?? "");
  }
  const save = () => {
    const t = title.trim();
    if (!t) return setTitle(card.title);
    if (t !== card.title || notes !== (card.description ?? "")) onEdit({ title: t, description: notes });
  };
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  const keys = (reset: () => void) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      reset();
      e.currentTarget.blur();
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === "Enter" || e.key === "s")) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };
  return (
    <>
      <textarea
        ref={grow}
        rows={1}
        value={title}
        onChange={(e) => (setTitle(e.target.value.replace(/\n/g, " ")), grow(e.target))}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          } else keys(() => setTitle(card.title))(e);
        }}
        aria-label="Name"
        title="Tap to edit"
        className={`bare-input m-0 block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent p-0 leading-tight focus:outline-none [overflow-wrap:anywhere] ${small ? "text-[15px] font-semibold leading-snug" : "font-display text-[23px]"}`}
        style={{ color: "#2a1c10" }}
      />
      <textarea
        ref={grow}
        rows={1}
        value={notes}
        onChange={(e) => (setNotes(e.target.value), grow(e.target))}
        onBlur={save}
        onKeyDown={keys(() => setNotes(card.description ?? ""))}
        placeholder="Add notes"
        aria-label="Notes"
        className={`bare-input m-0 block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent p-0 leading-snug focus:outline-none [overflow-wrap:anywhere] placeholder:text-[#a08a64] ${small ? "text-[13px]" : "text-[14.5px]"}`}
        style={{ color: "#4a3a22" }}
      />
    </>
  );
}

/** What a card is: tap to change it. */
export function KindBadge({ kind, open, onToggle, small = false }: { kind: Kind; open: boolean; onToggle: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title="Tap to change what it is"
      aria-label={`${KIND_ONE[kind]}. Tap to change`}
      className={`flex shrink-0 items-center gap-1 rounded-full font-bold uppercase tracking-[.08em] ${small ? "h-6 px-2 text-[10.5px]" : "h-7 px-2.5 text-[12px]"}`}
      style={{ background: open ? "rgba(217,180,95,.45)" : "rgba(217,180,95,.25)", color: GOLD, border: "1px solid rgba(139,112,64,.4)" }}
    >
      {KIND_ONE[kind]}
      <span aria-hidden className="text-[10px] opacity-70">▾</span>
    </button>
  );
}

/** The kinds, in a row that slides open under the badge. */
export function KindPicker({ open, kind, onPick }: { open: boolean; kind: Kind; onPick: (k: Kind) => void }) {
  return (
    <div className="drawer-body" data-open={open || undefined}>
      <div className="drawer-inner">
        <div className="flex flex-wrap gap-1.5 pb-1">
          {KINDS.map((k) => (
            <button key={k.key} type="button" aria-pressed={k.key === kind} onClick={() => onPick(k.key)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ ...chip(k.key === kind), minHeight: 32 }}>
              {KIND_ONE[k.key]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
