"use client";

import { useRef, useState } from "react";
import { useLocalDay } from "@/components/evening/evening-clock";
import { Fold } from "@/components/ui/Fold";
import { chapterFor, clock12, dealt, type Stone } from "@/lib/dawn";
import { useDawn } from "./useDawn";
import { DawnSettings } from "./DawnSettings";
import { GearButton, INK, Offering, Pill, SOFT, StonePicker } from "./parts";

const FACES = ["😞", "😐", "🙂", "😊", "🤩"];

/**
 * The welcome screen's Dawn path (owner, Nov 9): the stones you chose last night (or your first
 * few), a sky strip that warms to gold, "one stone = a gentle dawn", a Short on time switch to the
 * 2-minute versions, the habit of the week up front, one offering card, a swipe across the stones
 * to log them afterwards, and one face for how it felt. Each of those can be switched off (gear).
 */
export function DawnPath() {
  const day = useLocalDay();
  const { dawn, doneIds, error, patchDay, saveSettings, tick } = useDawn(day);
  const [opened, setOpened] = useState(false);
  const [gear, setGear] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const tracing = useRef(false);
  if (!day || !dawn || !dawn.on.path) return null;
  const on = dawn.on;
  const d = dawn.days[day] ?? {};
  // Done here, or ticked on the habit itself (Today, the welcome Habits).
  const done = new Set([...(d.done ?? []), ...doneIds]);
  const lib = new Map(dawn.stones.map((s) => [s.id, s]));
  const planned = (d.stones ?? []).map((id) => lib.get(id)).filter((s): s is Stone => !!s);
  const stones = planned.length ? planned : dawn.stones.slice(0, 3);
  const week = on.week ? chapterFor(dawn, day) : null;
  const short = on.short && !!d.short;
  const count = stones.filter((s) => done.has(s.id)).length + (week && d.weekDone ? 1 : 0) + (d.took && d.cardDone ? 1 : 0);
  const total = stones.length + (week ? 1 : 0) + (d.took ? 1 : 0);
  const sky = total ? Math.min(1, count / total) : 0;
  const words = count === 0 ? "Your dawn" : count >= total ? "A full dawn ✦" : "A gentle dawn ✦";
  const sealed = d.sealed && !opened && count === 0;
  // One stone first: only the first not yet done shows until one is done.
  const shown = on.first && count === 0 ? stones.slice(0, 1) : stones;
  const cards = on.offerAm ? dealt(dawn, day, "am", d.draw ?? 0, on.hand ? 3 : 1) : [];
  const picked = d.card ? (dawn.cards.find((c) => c.id === d.card) ?? null) : null;

  const set = (id: string, v: boolean) => tick(day, { stone: id }, v);
  // Log afterwards: a finger dragged across the stones lights each one it passes.
  const over = (e: React.PointerEvent) => {
    if (!tracing.current || !on.trace) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-stone]");
    const id = el?.dataset.stone;
    if (!id) return;
    if (id === "week" ? !d.weekDone : !done.has(id)) {
      if (id === "week") tick(day, { extra: "week" }, true);
      else set(id, true);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2 rounded-2xl px-3 pb-3 pt-2" style={{ background: "linear-gradient(180deg,rgba(255,250,238,.75),rgba(246,234,208,.6))", border: "1px solid rgba(168,138,63,.45)", color: INK }}>
      <div className="flex items-center gap-2">
        <span className="font-display text-[16px]">☀️ {words}</span>
        {d.wake && (
          <span className="text-[12.5px]" style={{ color: SOFT }}>
            up at {clock12(d.wake)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {on.short && (
            <Pill sm on={short} onClick={() => patchDay(day, { short: !short })} title="Every stone turns into its 2-minute version, and still counts">
              ⏱ Short on time
            </Pill>
          )}
          <GearButton open={gear} onClick={() => setGear((g) => !g)} />
        </span>
      </div>

      <Fold open={gear}>
        <div className="rounded-xl px-2.5 pb-1 pt-1" style={{ background: "#fffaf0", border: "1px solid #c9a24a" }}>
          <DawnSettings dawn={dawn} save={saveSettings} day={day} />
        </div>
      </Fold>

      <div className="dawn-sky h-2.5 rounded-full" aria-hidden>
        <span style={{ width: `${Math.max(sky * 100, count ? 8 : 0)}%` }} />
      </div>

      {sealed ? (
        <button type="button" onClick={() => setOpened(true)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-left" style={{ background: "#fffaf0", border: "1px solid #c9a24a" }}>
          <span className="dawn-wax" aria-hidden>
            ✦
          </span>
          <span className="text-[14.5px] leading-snug">
            Your dawn, sealed last night
            <span className="block text-[12.5px]" style={{ color: SOFT }}>
              {d.cue ? `“${d.cue}” · ` : ""}tap to break the seal
            </span>
          </span>
        </button>
      ) : (
        <>
          {stones.length === 0 ? (
            <p className="m-0 text-[13.5px]" style={{ color: SOFT }}>
              Add a few stones (the gear, or Choose below), and they&apos;ll wait here each morning.
            </p>
          ) : (
            <div
              className="dawn-path reveal flex flex-wrap justify-center gap-x-1.5 gap-y-2 py-1"
              style={{ touchAction: on.trace ? "pan-y" : undefined }}
              onPointerDown={() => (tracing.current = true)}
              onPointerMove={over}
              onPointerUp={() => (tracing.current = false)}
              onPointerLeave={() => (tracing.current = false)}
              onPointerCancel={() => (tracing.current = false)}
            >
              {week && (
                <StoneButton id="week" emoji={week.chapter.emoji} title={week.chapter.practice || week.chapter.title} sub={week.chapter.title} done={!!d.weekDone} onTap={() => tick(day, { extra: "week" }, !d.weekDone)} accent />
              )}
              {shown.map((s) => (
                <StoneButton key={s.id} id={s.id} emoji={s.emoji} title={short ? s.short || s.title : s.title} sub={short ? "2 min" : `${s.min}m`} done={done.has(s.id)} onTap={() => set(s.id, !done.has(s.id))} big={on.first && count === 0} />
              ))}
            </div>
          )}
          {on.trace && stones.length > 1 && count === 0 && (
            <p className="m-0 -mt-1 text-center text-[12px]" style={{ color: SOFT }}>
              Tap a stone when it&apos;s done, or swipe across them afterwards
            </p>
          )}

          {on.offerAm && cards.length > 0 && (
            <Offering
              cards={cards}
              hand={on.hand}
              chosen={picked}
              took={!!d.took}
              done={!!d.cardDone}
              onPick={(c) => patchDay(day, { card: c.id })}
              onAnother={() => patchDay(day, { draw: (d.draw ?? 0) + 1, card: undefined })}
              onTake={() => patchDay(day, { took: true, card: picked?.id ?? cards[0].id })}
              onDone={(v) => tick(day, { extra: "card" }, v)}
            />
          )}

          {on.feel && count > 0 && (
            <div className="reveal flex items-center justify-center gap-1.5">
              <span className="text-[12.5px]" style={{ color: SOFT }}>
                How did it feel?
              </span>
              {FACES.map((f, i) => (
                <button key={f} type="button" onClick={() => patchDay(day, { feel: d.feel === i + 1 ? undefined : i + 1 })} aria-pressed={d.feel === i + 1} aria-label={`Felt ${i + 1} of 5`} className="flex h-8 w-8 items-center justify-center rounded-full text-[19px] transition-transform" style={{ transform: d.feel === i + 1 ? "scale(1.3)" : undefined, filter: d.feel && d.feel !== i + 1 ? "grayscale(.7) opacity(.6)" : undefined }}>
                  {f}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-center">
            <button type="button" onClick={() => setChoosing((v) => !v)} aria-expanded={choosing} className="h-7 px-2 text-[12.5px] underline decoration-dotted underline-offset-2" style={{ color: SOFT }}>
              {choosing ? "Done choosing" : planned.length ? "✎ Change today's stones" : "✎ Choose today's stones"}
            </button>
          </div>
          <Fold open={choosing}>
            <StonePicker stones={dawn.stones} chosen={planned.length ? planned.map((s) => s.id) : stones.map((s) => s.id)} onChange={(ids) => patchDay(day, { stones: ids })} onAdd={(s) => (saveSettings({ stones: [...dawn.stones, s] }), patchDay(day, { stones: [...(planned.length ? planned : stones).map((x) => x.id), s.id] }))} short={short} />
          </Fold>
        </>
      )}
      {error && (
        <p className="m-0 text-center text-[12.5px]" style={{ color: "#a33" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function StoneButton({ id, emoji, title, sub, done, onTap, big, accent }: { id: string; emoji: string; title: string; sub?: string; done: boolean; onTap: () => void; big?: boolean; accent?: boolean }) {
  return (
    <button type="button" data-stone={id} onClick={onTap} aria-pressed={done} title={title} className="flex w-[72px] flex-col items-center gap-1 text-center">
      <span className={`dawn-stone ${done ? "dawn-stone-lit" : ""} ${accent ? "dawn-stone-week" : ""}`} style={big ? { width: 64, height: 64, fontSize: 28 } : undefined}>
        {done ? "✓" : emoji}
      </span>
      <span className="line-clamp-2 text-[12px] leading-tight" style={{ color: INK }}>
        {title}
      </span>
      {sub && (
        <span className="-mt-0.5 text-[10.5px]" style={{ color: SOFT }}>
          {sub}
        </span>
      )}
    </button>
  );
}
