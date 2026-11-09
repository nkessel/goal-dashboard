"use client";

import { useState } from "react";
import { AREA_NAMES, SUGGESTIONS, cleanStone, type Area, type Card, type Stone } from "@/lib/dawn";
import { CloseIcon, GearIcon } from "@/components/ui/Icons";

export const INK = "#2a1c10";
export const SOFT = "#6b5631";
export const GILT = { background: "linear-gradient(180deg,#f6dc8e,#d9b45f)", border: "1px solid #8a6116", color: INK } as const;

/** "1h 5m", "45 min". */
export const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m} min`);

/** A pill in the app's .qe-fact language, for light (parchment) or dark (evening) ground. */
export function Pill({ on, dark, children, onClick, title, sm }: { on?: boolean; dark?: boolean; children: React.ReactNode; onClick?: () => void; title?: string; sm?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full ${sm ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13.5px]"} transition-colors`}
      style={
        on
          ? { ...GILT, fontWeight: 600 }
          : dark
            ? { background: "rgba(255,250,238,.08)", border: "1px solid rgba(217,180,95,.45)", color: "#efe3c2" }
            : { background: "#fffaf0", border: "1px solid #c9a24a", color: INK }
      }
    >
      {children}
    </button>
  );
}

/**
 * Choose stones: your library as pills (tap to choose, tap again to drop; the order you tap is the
 * order you'll walk them), the time they add up to against the room you have, and "＋ More" for
 * nourishing ideas by area, or your own.
 */
export function StonePicker({
  stones,
  chosen,
  onChange,
  onAdd,
  room,
  short,
  dark,
}: {
  stones: Stone[];
  chosen: string[];
  onChange: (ids: string[]) => void;
  /** Add a new stone to your library (and choose it). */
  onAdd: (s: Stone) => void;
  /** Minutes you have, if known. */
  room?: number | null;
  /** Count the 2-minute versions. */
  short?: boolean;
  dark?: boolean;
}) {
  const [more, setMore] = useState(false);
  const mins = chosen.reduce((n, id) => n + (short ? 2 : (stones.find((s) => s.id === id)?.min ?? 0)), 0);
  const shortMins = chosen.length * 2;
  const soft = dark ? "#cbbd93" : SOFT;
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const fill = () => {
    if (!room) return;
    let left = room;
    const pick: string[] = [];
    for (const s of stones) if (s.min <= left) (pick.push(s.id), (left -= s.min));
    onChange(pick);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {stones.map((s) => {
          const i = chosen.indexOf(s.id);
          return (
            <Pill key={s.id} on={i >= 0} dark={dark} onClick={() => toggle(s.id)} title={`${s.title} · ${dur(s.min)}${s.short ? ` · short: ${s.short}` : ""}`}>
              {i >= 0 && <span className="text-[11px] font-bold opacity-70">{i + 1}</span>}
              <span aria-hidden>{s.emoji}</span>
              {s.title}
              <span className="text-[11.5px] opacity-70">{short ? "2m" : `${s.min}m`}</span>
            </Pill>
          );
        })}
        <Pill dark={dark} onClick={() => setMore((v) => !v)} on={more}>
          ＋ More
        </Pill>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: soft }}>
        <span>
          {chosen.length === 0 ? "Nothing chosen yet" : `${dur(mins)} chosen`}
          {room != null && room > 0 && chosen.length > 0 && (mins <= room ? ` · ${dur(room - mins)} to spare` : shortMins <= room ? " · the short versions fit" : ` · ${dur(mins - room)} more than you have`)}
        </span>
        {room != null && room > 0 && (
          <button type="button" onClick={fill} className="underline decoration-dotted underline-offset-2">
            ✨ Fill my time
          </button>
        )}
      </div>
      {more && <StoneIdeas stones={stones} onAdd={onAdd} dark={dark} />}
    </div>
  );
}


/** Nourishing ideas by area to add with one tap, or your own. */
export function StoneIdeas({ stones, onAdd, dark }: { stones: Stone[]; onAdd: (s: Stone) => void; dark?: boolean }) {
  const [area, setArea] = useState<Area>("health");
  const [own, setOwn] = useState("");
  const add = (s: Omit<Stone, "id">) => {
    const st = cleanStone(s);
    if (st) onAdd(st);
  };
  return (
    <div className="reveal flex flex-col gap-1.5 rounded-xl p-2" style={{ background: dark ? "rgba(255,250,238,.06)" : "rgba(168,138,63,.08)", border: `1px dashed ${dark ? "rgba(217,180,95,.35)" : "#c9a24a"}` }}>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(AREA_NAMES) as Area[]).map((a) => (
          <Pill key={a} sm dark={dark} on={area === a} onClick={() => setArea(a)}>
            {AREA_NAMES[a]}
          </Pill>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {SUGGESTIONS.filter((s) => s.area === area).map((s) => {
          const have = stones.some((x) => x.title.toLowerCase() === s.title.toLowerCase());
          return (
            <Pill key={s.title} sm dark={dark} on={have} onClick={() => !have && add(s)} title={have ? "Already one of your stones" : `Add: ${s.title} (${s.min} min)`}>
              {have ? "✓" : "＋"} {s.emoji} {s.title}
            </Pill>
          );
        })}
      </div>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!own.trim()) return;
          add({ title: own.trim(), emoji: "✦", min: 5, area });
          setOwn("");
        }}
      >
        <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Your own…" aria-label="Your own stone" maxLength={80} className="bare-input h-8 min-w-0 flex-1 border-b bg-transparent px-1 text-[16px] outline-none sm:text-[14px]" style={{ borderColor: "rgba(168,138,63,.6)", color: dark ? "#efe3c2" : INK }} />
        <button type="submit" disabled={!own.trim()} className="h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold disabled:opacity-40" style={GILT}>
          Add
        </button>
      </form>
    </div>
  );
}

/**
 * The offering: one card face up (Take it · ↻ Another), or a hand of three face down to flip one.
 * Taken, it becomes a small line you tick when done.
 */
export function Offering({
  cards,
  hand,
  chosen,
  took,
  done,
  onPick,
  onAnother,
  onTake,
  onDone,
  dark,
  label = "Today's offering",
}: {
  cards: Card[];
  hand: boolean;
  /** The card picked from a hand (or null before). */
  chosen: Card | null;
  took: boolean;
  done: boolean;
  onPick: (c: Card) => void;
  onAnother: () => void;
  onTake: () => void;
  onDone: (on: boolean) => void;
  dark?: boolean;
  label?: string;
}) {
  const card = hand ? chosen : (cards[0] ?? null);
  const soft = dark ? "#cbbd93" : SOFT;
  if (!cards.length) return null;
  if (took && card)
    return (
      <button type="button" onClick={() => onDone(!done)} aria-pressed={done} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left text-[14px]" style={{ background: dark ? "rgba(255,250,238,.07)" : "#fffaf0", border: `1px solid ${done ? "#6f8f5c" : "#c9a24a"}`, color: dark ? "#efe3c2" : INK }}>
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px]" style={done ? { background: "#6f8f5c", color: "#fff" } : { border: "1.5px solid #c9a24a" }}>
          {done ? "✓" : "🃏"}
        </span>
        <span className={done ? "opacity-70" : ""}>{card.text}</span>
      </button>
    );
  if (hand && !chosen)
    return (
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[12.5px]" style={{ color: soft }}>
          {label}: pick a card
        </span>
        <div className="flex gap-2">
          {cards.map((c, i) => (
            <button key={c.id} type="button" onClick={() => onPick(c)} aria-label={`Card ${i + 1}`} className="dawn-facedown h-[74px] w-[54px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  if (!card) return null;
  return (
    <div className="dawn-card reveal flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13.5px] leading-snug" style={{ background: dark ? "rgba(255,250,238,.08)" : "#fffaf0", border: "1px solid #c9a24a", color: dark ? "#efe3c2" : INK }}>
      <span aria-hidden className="text-[20px]">
        🃏
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: soft }}>
          {label}
        </span>
        {card.text}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <button type="button" onClick={onTake} className="h-7 rounded-full px-2.5 text-[12.5px] font-semibold" style={GILT}>
          Take it
        </button>
        <button type="button" onClick={onAnother} className="h-6 px-1 text-[12px] underline decoration-dotted" style={{ color: soft }}>
          ↻ Another
        </button>
      </span>
    </div>
  );
}

/** A small gear in the part's corner that folds its settings open. */
export function GearButton({ open, onClick, dark }: { open: boolean; onClick: () => void; dark?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-label={open ? "Close the settings" : "Choose which parts you use"} title="Choose which parts you use" className="flex h-7 w-7 items-center justify-center rounded-full" style={{ color: dark ? "#cbbd93" : SOFT, background: open ? "rgba(217,180,95,.28)" : undefined }}>
      {open ? (
        <CloseIcon size={11} />
      ) : (
        <GearIcon size={15} />
      )}
    </button>
  );
}

/** On focus, once the keyboard is up, lift a page field above it if it's covered. */
export function keepAboveKeyboard(el: HTMLElement) {
  setTimeout(() => {
    const vv = window.visualViewport;
    const limit = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 24;
    const bottom = el.getBoundingClientRect().bottom;
    if (bottom > limit) window.scrollBy({ top: bottom - limit, behavior: "smooth" });
  }, 320);
}

/** A time as a pill: "Other…" (or its time) that opens the time field in place. */
export function TimePill({ value, onChange, label, dark, placeholder = "Other…" }: { value: string | undefined; onChange: (v: string | undefined) => void; label: string; dark?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <input
        type="time"
        autoFocus
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        onBlur={() => setOpen(false)}
        aria-label={label}
        className="time-field h-8 rounded-full px-2 text-[14px]"
      />
    );
  return (
    <Pill sm dark={dark} on={!!value} onClick={() => setOpen(true)} title={label}>
      {value ? clockOf(value) : placeholder}
    </Pill>
  );
}

const clockOf = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
