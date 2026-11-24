import { ToucanArt } from "./ToucanArt";
import { talkToToucan } from "./talk";
import { tomorrowMorning } from "./snooze-store";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { TimeToken } from "@/components/xp/NightFields";
import { BUBBLE_PAINT } from "@/lib/toucan-flourish";
import { useBubbleStyle } from "@/lib/use-bubble-style";
import { useEscape } from "@/lib/use-escape";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export type NoteAction = { label: string; run: () => void };

/** The longer snoozes: in a couple of hours, this evening, tomorrow morning. */
function laterChoices(): { label: string; at: number }[] {
  const now = Date.now();
  const evening = new Date();
  evening.setHours(18, 0, 0, 0);
  return [
    { label: "2 hours", at: now + 2 * 3_600_000 },
    { label: "3 hours", at: now + 3 * 3_600_000 },
    ...(evening.getTime() - now > 3.5 * 3_600_000 ? [{ label: "This evening", at: evening.getTime() }] : []),
    { label: "Tomorrow", at: tomorrowMorning() },
  ];
}

/** Choose when a reminder comes back: a quick choice, a time today, or tomorrow if that time has passed. */
export function PickTime({ onPick, onClose }: { onPick: (when: number) => void; onClose: () => void }) {
  useEscape(onClose);
  const nextAt = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d;
  };
  const [{ value, when, today }, setPick] = useState(() => {
    const d = new Date(Date.now() + 3 * 3_600_000);
    const value = `${String(d.getHours()).padStart(2, "0")}:00`;
    const when = nextAt(value);
    return { value, when, today: when?.toDateString() === new Date().toDateString() };
  });
  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Bring it back at" onClick={(e) => e.stopPropagation()} className="card-pop-in relative flex w-[min(320px,calc(100vw-32px))] flex-col gap-3 rounded-2xl p-4" style={{ background: "linear-gradient(180deg, rgba(14,38,40,.98), rgba(8,22,26,.99))", border: "1.5px solid rgba(140,240,220,.55)", color: "#e8fff8", boxShadow: "0 10px 28px rgba(0,0,0,.5)" }}>
        <button type="button" onClick={onClose} aria-label="Back to the snooze choices" title="Back" className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-[16px] leading-none" style={{ color: "rgba(232,255,248,.75)" }}>
          ‹
        </button>
        <p className="m-0 text-[15px] font-semibold">Bring it back…</p>
        <div className="flex flex-wrap gap-1.5">
          {laterChoices().map((c) => (
            <button key={c.label} type="button" onClick={() => onPick(c.at)} className="h-9 rounded-full px-3 text-[13.5px] font-semibold" style={{ background: "rgba(140,240,220,.14)", border: "1px solid rgba(140,240,220,.45)", color: "#e8fff8" }}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="m-0 text-[12.5px]" style={{ color: "rgba(232,255,248,.7)" }}>
          Or at a time of your own:
        </p>
        <span className="flex">
          <TimeToken
            value={value}
            onChange={(v) => {
              const when = nextAt(v);
              setPick({ value: v, when, today: when?.toDateString() === new Date().toDateString() });
            }}
            label="Time"
            kind="any"
            variant="spirit"
          />
        </span>
        {when && (
          <p className="m-0 text-[13px]" style={{ color: "rgba(232,255,248,.7)" }}>
            {today ? "Today" : "Tomorrow"} at {when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </p>
        )}
        <button type="button" disabled={!when} onClick={() => when && onPick(when.getTime())} className="h-11 rounded-full text-[14.5px] font-bold disabled:opacity-60" style={{ background: "linear-gradient(180deg, #8cf0dc, #4fbfa9)", color: "#0a2a26" }}>
          Remind me then
        </button>
      </div>
    </div>,
    document.body
  );
}

export function NudgeNote({ text, actions, onClose, instant = false }: { text: string; actions: NoteAction[]; onClose: () => void; instant?: boolean }) {
  // × closes only his bubble: the toucan stays where he is (owner, Nov 2); a tap on him brings his words back.
  const [quiet, setQuiet] = useState(false);
  // His bubble's look and way, as chosen in Toucan settings (notes: the glow and everything showing, unless chosen).
  const style = useBubbleStyle();
  const paint = BUBBLE_PAINT[style.look === "parchment" ? "parchment" : "spirit"];
  const [unfolded, setUnfolded] = useState(false);
  const showRest = style.way !== "quiet" || unfolded;
  useEscape(() => (quiet ? onClose() : setQuiet(true)));
  // Drag it anywhere by its body; it remembers where you put it.
  const [at, setAt] = useState<{ x: number; y: number } | null>(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem("toucan-note-at") || "null") as { fx: number; fy: number } | null;
      return v ? { x: v.fx * window.innerWidth, y: v.fy * window.innerHeight } : null;
    } catch {
      return null;
    }
  });
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const movedLast = useRef(false);
  // After a choice he stays, resting: a tap on him then starts a talk (his note has had its say).
  const acted = useRef(false);
  const place = at
    ? { left: Math.max(8, Math.min(window.innerWidth - 200, at.x)), top: Math.max(8, Math.min(window.innerHeight - 80, at.y)) }
    : null;
  return createPortal(
    <div
      role="status"
      // The toucan himself flies in and says it: the bird on the left, his words in a bubble beside him.
      // Centred with margins, not a half-width translate: a half-pixel offset made the words shimmer while the bird moved.
      className={`fixed z-[58] flex w-[min(380px,calc(100vw-24px))] cursor-grab touch-none items-end gap-1 ${place ? "" : "inset-x-0 bottom-24 mx-auto"}`}
      style={place ?? undefined}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button:not([data-bird])")) return;
        const r = e.currentTarget.getBoundingClientRect();
        drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.moved = true;
        setAt({ x: e.clientX - d.dx, y: e.clientY - d.dy });
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        movedLast.current = !!d?.moved;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        if (d?.moved && at) {
          try {
            window.localStorage.setItem("toucan-note-at", JSON.stringify({ fx: at.x / window.innerWidth, fy: at.y / window.innerHeight }));
          } catch {}
        }
      }}
    >
      <button type="button" data-bird onClick={() => (movedLast.current ? undefined : acted.current ? talkToToucan() : setQuiet(false))} aria-label={quiet ? "The toucan: show what he said" : "The toucan"} className={`${instant ? "" : "nudge-bird"} nudge-shadow shrink-0 cursor-pointer`}>
        <ToucanArt size={58} />
      </button>
      <div
        // The arrival animation fills "both", which held opacity at 1 and so the × never hid the bubble (owner, Nov 3): it goes once he's quiet.
        className={`${instant || quiet ? "" : "nudge-bubble"} relative mb-6 flex min-w-0 flex-1 flex-col gap-2 rounded-2xl p-3 pr-8 transition-[opacity,scale] duration-200 ${quiet ? "pointer-events-none scale-95 opacity-0" : ""}`}
        aria-hidden={quiet || undefined}
        style={paint.bubble}
        // Words first: a tap on the bubble shows his choices and the answer line.
        onClick={(e) => {
          if (showRest || movedLast.current || (e.target as HTMLElement).closest("button, input")) return;
          setUnfolded(true);
        }}
      >
        {/* The bubble's tail points back at his bill. */}
        <span aria-hidden className="absolute -left-[7px] bottom-4 h-3 w-3 rotate-45" style={{ background: paint.tail, borderLeft: `1.5px solid ${paint.edge}`, borderBottom: `1.5px solid ${paint.edge}` }} />
        <button type="button" onClick={() => setQuiet(true)} aria-label="Close what he said" title="Close" className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-[18px] leading-none" style={{ color: paint.soft }}>
          <CloseIcon size={11} />
        </button>
        <p className="m-0 text-[14px] leading-snug">{text}</p>
        {!showRest && (
          <button type="button" onClick={() => setUnfolded(true)} aria-label="Answer or choose" title="Answer or choose" className="-mt-1 self-start rounded-full px-1.5 text-[16px] leading-none tracking-widest" style={paint.quietBtn}>
            ⋯
          </button>
        )}
        <Fold open={showRest}>
        <span className="flex flex-col gap-2">
        <NoteReply
          spirit={paint === BUBBLE_PAINT.spirit}
          onSend={(words) => {
            acted.current = true;
            setQuiet(true);
            talkToToucan(undefined, "talk", `You said: “${text}”\nMe: ${words}`);
          }}
        />
        <span className="flex flex-wrap gap-1.5">
          {(actions.length ? actions : [{ label: "OK", run: () => {} }]).map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                // He stays (owner, Nov 2: "he disappeared completely when I said skip it"); only his words go.
                acted.current = true;
                setQuiet(true);
                a.run();
              }}
              className="h-8 rounded-full px-3 text-[12.5px]"
              style={i === 0 ? { ...paint.btn, fontWeight: 700 } : paint.quietBtn}
            >
              {a.label}
            </button>
          ))}
        </span>
        </span>
        </Fold>
      </div>
    </div>,
    document.body
  );
}

/** Answer him in your own words, right in his note (owner, Nov 3): Enter sends, and the talk opens with it. */
function NoteReply({ onSend, spirit = true }: { onSend: (words: string) => void; spirit?: boolean }) {
  const [words, setWords] = useState("");
  const send = () => {
    const w = words.trim();
    if (!w) return;
    setWords("");
    onSend(w);
  };
  return (
    <span className="flex items-center gap-1.5">
      <input
        value={words}
        onChange={(e) => setWords(e.target.value.slice(0, 400))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            send();
          }
        }}
        enterKeyHint="send"
        placeholder="Answer him…"
        aria-label="Answer the toucan in your own words"
        className="h-8 min-w-0 flex-1 rounded-full px-3 text-[16px] sm:text-[13.5px]"
        style={
          spirit
            ? { background: words ? "rgba(232,255,248,.92)" : "rgba(140,240,220,.1)", border: "1px solid rgba(140,240,220,.45)", color: words ? "#0a2a26" : "#e8fff8" }
            : { background: words ? "#fffdf6" : "rgba(242,210,126,.25)", border: "1px solid #c9a24a", color: "#2a1c10" }
        }
      />
      {words.trim() && (
        <button type="button" onClick={send} aria-label="Send" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={spirit ? { background: "linear-gradient(180deg, #8cf0dc, #4fbfa9)", color: "#0a2a26" } : { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </span>
  );
}
