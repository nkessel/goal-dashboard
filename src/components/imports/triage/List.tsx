"use client";

import { FileChips } from "@/components/ui/FileChips";
import { useRef, useState } from "react";
import type { ImportCard } from "@/lib/data/import-cards";
import { ScheduleWithin as SchedRate } from "@/components/tasks/ScheduleWithin";
import { AttrKey, Attrs, Kind, SOFT, chip, dayLabel, keyOf, rateable, withAttrs } from "./types";
import { BoardFold, PortraitBoard } from "./Boards";
import { SubQuests } from "./SubQuests";
import { AttrPills } from "./AttrPills";
import { ImportFoot, InlineCardText, KindBadge, KindPicker, LandsLine, LaterRow } from "./Card";

/** All of them at once: each row shows what it is and keeps Skip, Snooze… and Import. */
export function ListView({ cards, frame, active, onEdit, onQuick, onRetag, onRate, attrsOf, shownAttrs, onAttrs, onImport, onDone, onSnooze, onSkip, onDelete }: { cards: ImportCard[]; frame: React.CSSProperties; /** The card being added: its import flow shows in its row's place. */ active: { id: string; node: React.ReactNode } | null; onQuick: (c: ImportCard, until: Date, label: string) => void; onEdit: (c: ImportCard, p: { title: string; description: string }) => void; onRetag: (c: ImportCard, k: Kind) => void; onRate: (c: ImportCard, days: number | null) => void; attrsOf: (id: string) => Attrs; shownAttrs: AttrKey[]; onAttrs: (id: string, a: Attrs) => void; onImport: (c: ImportCard) => void; onDone: (c: ImportCard) => void; onSnooze: (c: ImportCard) => void; onSkip: (c: ImportCard) => void; onDelete: (c: ImportCard) => void }) {
  return (
    <ul className="card-pop-in parchment m-0 flex list-none flex-col rounded-3xl p-1.5" style={frame}>
      {cards.map((c, i) => (
        active?.id === c.id ? (
          <li key={c.id} className="list-none p-1">{active.node}</li>
        ) : (
        <ListRow key={c.id} card={c} first={i === 0} onQuick={(u, l) => onQuick(c, u, l)} onEdit={(p) => onEdit(c, p)} onRetag={(k) => onRetag(c, k)} onRate={(d) => onRate(c, d)} attrs={attrsOf(c.id)} shownAttrs={shownAttrs} onAttrs={(a) => onAttrs(c.id, a)} onImport={() => onImport(c)} onDone={() => onDone(c)} onSnooze={() => onSnooze(c)} onSkip={() => onSkip(c)} onDelete={() => onDelete(c)} />
        )
      ))}
    </ul>
  );
}

export function ListRow({ card, first, onEdit, onRetag, onRate, attrs, shownAttrs, onAttrs, onImport, onDone, onSnooze, onQuick, onSkip, onDelete }: { card: ImportCard; first: boolean; onRate: (days: number | null) => void; attrs: Attrs; shownAttrs: AttrKey[]; onAttrs: (a: Attrs) => void; onQuick: (until: Date, label: string) => void; onEdit: (p: { title: string; description: string }) => void; onRetag: (k: Kind) => void; onImport: () => void; onDone: () => void; onSnooze: () => void; onSkip: () => void; onDelete: () => void }) {
  const [picking, setPicking] = useState(false);
  const [more, setMore] = useState(false);
  const [boarding, setBoarding] = useState(false);
  // Swipe the row left for Snooze, Archive and Delete (owner, Nov 6); right to put them away. Right-click too.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  return (
    <li
      className="due-in flex flex-col gap-1 px-2.5 py-2"
      style={{ ...(first ? {} : { borderTop: "1px solid rgba(139,112,64,.22)" }), transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform 200ms ease", touchAction: "pan-y" }}
      onContextMenu={(e) => (e.preventDefault(), setMore(true))}
      onTouchStart={(e) => (swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchMove={(e) => {
        const s0 = swipe.current;
        if (!s0) return;
        const mx = e.touches[0].clientX - s0.x;
        const my = e.touches[0].clientY - s0.y;
        if (Math.abs(my) > Math.abs(mx) + 6) return (swipe.current = null, setDx(0));
        if (mx < 0 || more) setDx(Math.max(-60, Math.min(more ? 40 : 0, mx / 2)));
      }}
      onTouchEnd={(e) => {
        const s0 = swipe.current;
        swipe.current = null;
        setDx(0);
        if (!s0) return;
        const mx = e.changedTouches[0].clientX - s0.x;
        if (mx < -50) setMore(true);
        else if (mx > 50) setMore(false);
      }}
    >
      <div className="flex items-start gap-2">
        {withAttrs(card.kind) && <PortraitBoard card={card} attrs={attrs} small open={boarding} onToggle={() => setBoarding((v) => !v)} onAttrs={onAttrs} />}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <InlineCardText card={card} onEdit={onEdit} small />
        </span>
        <KindBadge kind={card.kind} open={picking} onToggle={() => setPicking((v) => !v)} small />
      </div>
      {withAttrs(card.kind) && <BoardFold card={card} attrs={attrs} open={boarding} onAttrs={onAttrs} onClose={() => setBoarding(false)} />}
      <SubQuests card={card} small attrs={attrs} onAttrs={onAttrs} />
      <FileChips files={card.attachments} />
      <KindPicker open={picking} kind={card.kind} onPick={(k) => (onRetag(k), setPicking(false))} />
      {rateable(card.kind) && !withAttrs(card.kind) && <SchedRate days={card.plan_within_days} onRate={onRate} small />}
      {/* The pills get the row's whole width; Import sits under them at the right. */}
      {withAttrs(card.kind) && <AttrPills card={card} attrs={attrs} shown={shownAttrs} onChange={onAttrs} onRate={onRate} small />}
      <span className="text-[11.5px] leading-snug" style={{ color: "#6b5631" }}>
        <LandsLine card={card} attrs={attrs} />
      </span>
      <ImportFoot card={card} small later={more} onLater={() => setMore((v) => !v)} onImport={onImport} onDone={onDone} onDelete={onDelete} />
      <LaterRow open={more} small done={card.kind === "done"} onSnooze={onSnooze} onSkip={onSkip} onDelete={onDelete} onQuick={onQuick} />
    </li>
  );
}

export function SetAside({ cards, onBack, isAdventure }: { cards: ImportCard[]; onBack: (c: ImportCard) => void; isAdventure: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 self-start text-[13.5px]" style={{ color: isAdventure ? "rgba(242,226,180,.85)" : SOFT }}>
        <span aria-hidden className="inline-block transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>
          ›
        </span>
        Archived ({cards.length})
      </button>
      <div className="drawer-body" data-open={open || undefined}>
        <div className="drawer-inner">
          <div className="parchment flex flex-col gap-1 rounded-2xl p-2" style={{ border: "1px solid #a88a3f", background: "linear-gradient(180deg,#fbf3df,#f1e3c0)" }}>
            {cards.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: "#2a1c10" }}>
                  {c.title}
                </span>
                <span className="shrink-0 text-[12px] italic" style={{ color: "#7a6440" }}>
                  {c.status === "snoozed" && c.snoozed_until ? `until ${dayLabel(keyOf(new Date(c.snoozed_until)))}` : "skipped"}
                </span>
                <button type="button" onClick={() => onBack(c)} className="h-8 shrink-0 rounded-full px-3 text-[12.5px] font-semibold" style={chip(false)}>
                  Bring back
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
