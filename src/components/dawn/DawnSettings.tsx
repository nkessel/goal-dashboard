"use client";

import { useState } from "react";
import { ON_LABELS, chapterFor, weekOf, type Chapter, type Dawn, type DawnOn, type Stone } from "@/lib/dawn";
import { GoldCheck } from "@/components/xp/WelcomeArrange";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { GILT, INK, Pill, SOFT, StoneIdeas } from "./parts";

type Save = (patch: Partial<Pick<Dawn, "on" | "stones" | "cards" | "prompts" | "chapters" | "chapterPinned">>) => void;

const field = "bare-input h-8 min-w-0 bg-transparent px-1 text-[16px] outline-none sm:text-[14px]";
const line = { borderBottom: "1px solid rgba(168,138,63,.45)", color: INK } as const;

/** A folding section header: the whole bar opens it. */
function Section({ title, hint, open, onToggle, children }: { title: string; hint?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-t" style={{ borderColor: "rgba(168,138,63,.3)" }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-10 w-full items-center gap-2 text-left">
        <span className="font-display text-[14.5px]" style={{ color: INK }}>
          {title}
        </span>
        {hint && (
          <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: SOFT }}>
            {hint}
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="ml-auto shrink-0 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined, color: SOFT }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Fold open={open}>
        <div className="pb-3">{children}</div>
      </Fold>
    </div>
  );
}

/**
 * Everything about your mornings and evenings in one place (owner, Nov 9: "very customizable, but
 * every aspect very easy to use"): which parts you use (each one switch), your stones, the offering
 * cards, your evening reflections and the habits of the week. Shown in Settings and from the gear
 * on the Dawn path and the evening plan.
 */
export function DawnSettings({ dawn, save, day }: { dawn: Dawn; save: Save; day: string }) {
  const [open, setOpen] = useState<string | null>("use");
  const [adding, setAdding] = useState(false);
  const [cardsFor, setCardsFor] = useState<"am" | "pm">("am");
  const [newCard, setNewCard] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k));
  const setOn = (k: keyof DawnOn, v: boolean) => save({ on: { ...dawn.on, [k]: v } });
  const setStone = (id: string, patch: Partial<Stone>) => save({ stones: dawn.stones.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const now = chapterFor(dawn, day);
  const groups: ("Evening" | "Morning" | "Both")[] = ["Evening", "Morning", "Both"];
  const onCount = ON_LABELS.filter((l) => dawn.on[l.key]).length;

  return (
    <div className="flex flex-col" style={{ color: INK }}>
      <Section title="What you use" hint={`${onCount} parts on`} open={open === "use"} onToggle={() => toggle("use")}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g} className="flex flex-col">
              <span className="mt-1 text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: SOFT }}>
                {g === "Both" ? "Morning and evening" : g}
              </span>
              {ON_LABELS.filter((l) => l.group === g).map((l) => (
                <GoldCheck key={l.key} checked={dawn.on[l.key]} onChange={(v) => setOn(l.key, v)}>
                  <span>
                    {l.label}
                    <span className="block text-[12px]" style={{ color: SOFT }}>
                      {l.hint}
                    </span>
                  </span>
                </GoldCheck>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Your stones" hint="the habits you choose from" open={open === "stones"} onToggle={() => toggle("stones")}>
        <p className="m-0 mb-1.5 text-[12.5px]" style={{ color: SOFT }}>
          Each has its usual minutes and a 2-minute version for short mornings. Stones tied to a habit tick it too.
        </p>
        <div className="flex flex-col gap-1">
          {dawn.stones.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg py-1">
              <input value={s.emoji} onChange={(e) => setStone(s.id, { emoji: e.target.value })} aria-label={`${s.title}'s emoji`} className={`${field} w-9 text-center`} style={line} maxLength={8} />
              <input value={s.title} onChange={(e) => setStone(s.id, { title: e.target.value })} aria-label="Name" className={`${field} min-w-[120px] flex-1 font-semibold`} style={line} maxLength={80} />
              <span className="flex items-center gap-0.5 text-[12.5px]" style={{ color: SOFT }}>
                <input type="number" inputMode="numeric" value={s.min} min={1} max={180} onChange={(e) => setStone(s.id, { min: Number(e.target.value) || 1 })} aria-label={`${s.title}: minutes`} className={`${field} w-10 text-right [appearance:textfield]`} style={line} />
                min
              </span>
              {s.ref && (
                <span title="Tied to one of your habits: ticking it ticks the habit" className="text-[12px]" style={{ color: SOFT }}>
                  ⛓
                </span>
              )}
              <button type="button" onClick={() => save({ stones: dawn.stones.filter((x) => x.id !== s.id) })} aria-label={`Remove ${s.title}`} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5" style={{ color: SOFT }}>
                <CloseIcon size={10} />
              </button>
              <input value={s.short ?? ""} onChange={(e) => setStone(s.id, { short: e.target.value })} placeholder="2-minute version (e.g. one page)" aria-label={`${s.title}: 2-minute version`} className={`${field} ml-10 w-full text-[13px] italic`} style={{ ...line, borderBottomStyle: "dotted" }} maxLength={80} />
            </div>
          ))}
        </div>
        <div className="mt-2">
          <Pill on={adding} onClick={() => setAdding((v) => !v)}>
            ＋ Add a stone
          </Pill>
          {adding && (
            <div className="mt-1.5">
              <StoneIdeas stones={dawn.stones} onAdd={(s) => save({ stones: [...dawn.stones, s] })} />
            </div>
          )}
        </div>
      </Section>

      <Section title="Offering cards" hint="small ideas for variety" open={open === "cards"} onToggle={() => toggle("cards")}>
        <div className="mb-1.5 flex gap-1">
          <Pill sm on={cardsFor === "am"} onClick={() => setCardsFor("am")}>
            ☀️ Morning
          </Pill>
          <Pill sm on={cardsFor === "pm"} onClick={() => setCardsFor("pm")}>
            🌙 Evening
          </Pill>
        </div>
        <div className="flex flex-col">
          {dawn.cards
            .filter((c) => c.on === cardsFor)
            .map((c) => (
              <div key={c.id} className="flex items-center gap-1">
                <input value={c.text} onChange={(e) => save({ cards: dawn.cards.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)) })} aria-label="Card" className={`${field} flex-1`} style={line} maxLength={140} />
                <button type="button" onClick={() => save({ cards: dawn.cards.filter((x) => x.id !== c.id) })} aria-label="Remove this card" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5" style={{ color: SOFT }}>
                  <CloseIcon size={10} />
                </button>
              </div>
            ))}
        </div>
        <form
          className="mt-1.5 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newCard.trim()) return;
            save({ cards: [...dawn.cards, { id: Math.random().toString(36).slice(2, 10), text: newCard.trim(), on: cardsFor }] });
            setNewCard("");
          }}
        >
          <input value={newCard} onChange={(e) => setNewCard(e.target.value)} placeholder="A new card…" aria-label="A new card" className={`${field} flex-1`} style={line} maxLength={140} />
          <button type="submit" disabled={!newCard.trim()} className="h-8 rounded-full px-3 text-[13px] font-semibold disabled:opacity-40" style={GILT}>
            Add
          </button>
        </form>
      </Section>

      <Section title="Evening reflections" hint="from your planners" open={open === "prompts"} onToggle={() => toggle("prompts")}>
        <div className="flex flex-col">
          {dawn.prompts.map((p) => (
            <div key={p.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <GoldCheck checked={p.on} onChange={(v) => save({ prompts: dawn.prompts.map((x) => (x.id === p.id ? { ...x, on: v } : x)) })}>
                  {p.q}
                </GoldCheck>
              </div>
              <button type="button" onClick={() => save({ prompts: dawn.prompts.filter((x) => x.id !== p.id) })} aria-label={`Remove “${p.q}”`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/5" style={{ color: SOFT }}>
                <CloseIcon size={10} />
              </button>
            </div>
          ))}
        </div>
        <form
          className="mt-1.5 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newPrompt.trim()) return;
            save({ prompts: [...dawn.prompts, { id: Math.random().toString(36).slice(2, 10), q: newPrompt.trim(), on: true }] });
            setNewPrompt("");
          }}
        >
          <input value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} placeholder="Your own question…" aria-label="Your own evening question" className={`${field} flex-1`} style={line} maxLength={140} />
          <button type="submit" disabled={!newPrompt.trim()} className="h-8 rounded-full px-3 text-[13px] font-semibold disabled:opacity-40" style={GILT}>
            Add
          </button>
        </form>
        <p className="m-0 mt-1.5 text-[12px]" style={{ color: SOFT }}>
          Morning ones (Today I will be…, Last night I dreamt…, Help from the Universe) are pills in the welcome screen&apos;s Journal.
        </p>
      </Section>

      <Section title="Habit of the week" hint={now ? `now: ${now.chapter.title}` : undefined} open={open === "week"} onToggle={() => toggle("week")}>
        <p className="m-0 mb-1 text-[12.5px]" style={{ color: SOFT }}>
          A new one each Monday, in this order. Tap ☆ to make one this week&apos;s.
        </p>
        <div className="flex flex-col gap-1">
          {dawn.chapters.map((c, i) => {
            const set = (patch: Partial<Chapter>) => save({ chapters: dawn.chapters.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            const cur = now?.i === i;
            return (
              <div key={i} className="flex flex-wrap items-center gap-x-1.5 rounded-lg px-1 py-0.5" style={cur ? { background: "rgba(217,180,95,.22)" } : undefined}>
                <button type="button" onClick={() => save({ chapterPinned: { week: weekOf(day), i } })} aria-label={cur ? "This week's" : "Make it this week's"} title={cur ? "This week's" : "Make it this week's"} className="flex h-8 w-7 items-center justify-center text-[15px]" style={{ color: cur ? "#a8740f" : SOFT }}>
                  {cur ? "★" : "☆"}
                </button>
                <input value={c.emoji} onChange={(e) => set({ emoji: e.target.value })} aria-label="Emoji" className={`${field} w-9 text-center`} style={line} maxLength={8} />
                <input value={c.title} onChange={(e) => set({ title: e.target.value })} aria-label="Name" className={`${field} min-w-[120px] flex-1 font-semibold`} style={line} maxLength={60} />
                <button type="button" onClick={() => save({ chapters: dawn.chapters.filter((_, j) => j !== i) })} aria-label={`Remove ${c.title}`} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5" style={{ color: SOFT }}>
                  <CloseIcon size={10} />
                </button>
                <input value={c.practice} onChange={(e) => set({ practice: e.target.value })} placeholder="The practice" aria-label={`${c.title}: the practice`} className={`${field} ml-[76px] w-full text-[13px] italic`} style={{ ...line, borderBottomStyle: "dotted" }} maxLength={120} />
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => save({ chapters: [...dawn.chapters, { title: "The Week of …", emoji: "✦", practice: "" }] })} className="mt-1.5 h-8 rounded-full border border-dashed px-3 text-[13px]" style={{ borderColor: "#b39a6a", color: SOFT }}>
          ＋ Add a week
        </button>
      </Section>
    </div>
  );
}
