"use client";

// The welcome screen's greeting (split plan W5): yours to rewrite in place, with ✎, thumbs, why and a note, and the
// "keep it?" choices after a rewrite. Dragging it moves the whole screen, so the card's placement comes down as props.
import { useEffect, useRef, useState, type RefObject } from "react";
import { Confirm, NoteButton, WhyBox } from "@/components/toucan/SayingFeedback";
import { loadFx, patchFx, type FxSettings } from "@/lib/celebration-fx";
import { addBackGreeting } from "@/lib/welcome";
import { EditButton, GoldCheck } from "../WelcomeArrange";
import { GILT, greetingSize, writeJson } from "./shared";
import { LineVote } from "./Lines";

export function GreetingLine({ heading, arranging, greetingOpen, setGreetingOpen, cardRef, at, setAt, movingRef }: {
  heading: string;
  arranging: boolean;
  greetingOpen: boolean;
  setGreetingOpen: (v: boolean) => void;
  cardRef: RefObject<HTMLDivElement | null>;
  at: { x: number; y: number };
  setAt: (v: { x: number; y: number }) => void;
  movingRef: RefObject<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>;
}) {
  // The same for the greeting: thumbs, why, a note, and a word that it landed.
  const [greetVerdict, setGreetVerdict] = useState<"like" | "dislike" | null>(null);
  const [greetWhy, setGreetWhy] = useState<"down" | "note" | null>(null);
  const [greetSaid, setGreetSaid] = useState<string | null>(null);
  // Phones: the ✎ and thumbs wait until you tap the words (no tools always showing).
  const [greetTools, setGreetTools] = useState(false);
  const movedRef = useRef(false);
  const [greeting, setGreeting] = useState(heading);
  // "Good morning!" before it (unless it already speaks of the time of day). Shown only, never saved into the line.
  const [hour] = useState(() => new Date().getHours());
  const hello = /\b(good|morning|afternoon|evening|night|dawn|dusk)\b/i.test(greeting) ? "" : hour < 5 ? "Good evening! " : hour < 12 ? "Good morning! " : hour < 17 ? "Good afternoon! " : "Good evening! ";
  const [writing, setWriting] = useState<string | null>(null);
  const greetingRef = useRef<HTMLParagraphElement>(null);
  // Writing: the cursor goes to the end of the greeting itself.
  useEffect(() => {
    const el = greetingRef.current;
    if (writing === null || !el || document.activeElement === el) return;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }, [writing]);
  const [keepAsk, setKeepAsk] = useState<{ text: string; was: string; keep: boolean; retire: boolean } | null>(null);
  function finishWriting() {
    const t = (writing ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    setWriting(null);
    if (!t || t === greeting || t === (hello + greeting).trim()) return;
    setKeepAsk({ text: t, was: greeting, keep: true, retire: true });
    setGreeting(t);
  }
  // Thumbs on the greeting: liked ones come round more often; a thumbs down retires it (and asks why).
  function voteGreeting(v: "like" | "dislike" | null) {
    const now = loadFx();
    const without = (xs?: string[]) => (xs ?? []).filter((x) => x !== greeting);
    patchFx({
      welcomeBackLiked: v === "like" ? [...without(now.welcomeBackLiked), greeting] : without(now.welcomeBackLiked),
      welcomeBackOff: v === "dislike" ? [...without(now.welcomeBackOff), greeting] : without(now.welcomeBackOff),
    });
    const was = greetVerdict;
    setGreetVerdict(v);
    setGreetWhy(v === "dislike" ? "down" : null);
    setGreetSaid(v === "like" ? "Saved: it'll greet you more often" : v === "dislike" ? "Got it: it won't greet you again" : was === "dislike" ? "It's back in the rotation" : "Taken back");
  }
  function settleGreeting() {
    if (!keepAsk) return;
    const now = loadFx();
    const patch: Partial<FxSettings> = keepAsk.keep ? addBackGreeting(now, keepAsk.text) : {};
    if (keepAsk.retire) patch.welcomeBackOff = [...new Set([...(patch.welcomeBackOff ?? now.welcomeBackOff ?? []), keepAsk.was])];
    if (Object.keys(patch).length) patchFx(patch);
    setKeepAsk(null);
  }
  return (
    <>
    {/* The greeting, with its ✎ at its upper right. Editing keeps the exact look and layout it will have. */}
    <div
      className={`relative w-full px-2 ${writing === null ? "cursor-grab" : ""}`}
      // Drag the heading to move the whole screen (a tap still writes the greeting); a double-click puts it back.
      onPointerDown={(e) => {
        if (writing !== null || (e.target as HTMLElement).closest("button, input, textarea, [contenteditable='true']")) return;
        movingRef.current = { x: e.clientX, y: e.clientY, ox: at.x, oy: at.y, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = movingRef.current;
        if (!d) return;
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
        d.moved = true;
        const half = Math.max(0, (window.innerWidth - (cardRef.current?.offsetWidth ?? 0)) / 2 - 16);
        setAt({ x: Math.max(-half, Math.min(half, d.ox + e.clientX - d.x)), y: Math.max(0, Math.min(window.innerHeight * 0.4, d.oy + e.clientY - d.y)) });
      }}
      onPointerUp={() => {
        movedRef.current = !!movingRef.current?.moved;
        if (movingRef.current?.moved) writeJson("welcome-card-at", at);
        movingRef.current = null;
      }}
      onClick={(e) => {
        if (movedRef.current || writing !== null || (e.target as HTMLElement).closest("button")) return;
        setGreetTools((v) => !v);
      }}
      onDoubleClick={() => (setAt({ x: 0, y: 0 }), writeJson("welcome-card-at", { x: 0, y: 0 }))}
    >
      {/* The greeting itself is where you write: same font, size, wrapping and place (no box). */}
      <span className="relative inline-block max-w-full">
        <p
          key={writing === null ? `show:${greeting}` : "writing"}
          ref={greetingRef}
          contentEditable={writing !== null}
          suppressContentEditableWarning
          role={writing !== null ? "textbox" : undefined}
          aria-label={writing !== null ? "Your own greeting" : undefined}
          onInput={(e) => setWriting((e.currentTarget.textContent ?? "").slice(0, 120))}
          onKeyDown={(e) => {
            if (writing === null) return;
            if (e.key === "Enter") {
              e.preventDefault();
              finishWriting();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setWriting(null);
            }
          }}
          onBlur={() => writing !== null && finishWriting()}
          className={`font-display m-0 leading-tight outline-none [text-wrap:balance] ${writing !== null ? "cursor-text" : ""}`}
          style={{ color: "var(--t-ink)", fontSize: greetingSize(writing ?? hello + greeting), caretColor: "#8a6116", outline: "none" }}
        >
          {/* The whole greeting is yours to write over, "Good morning!" too (owner, Nov 4). */}
          {hello}
          {greeting}
          {/* Its ✎ and quiet thumbs, right after the last word. */}
          {writing === null && (
            <span contentEditable={false} data-show={arranging || greetTools ? "true" : "false"} className="touch-tools ml-1 inline-flex items-center gap-0.5 whitespace-nowrap align-middle font-sans text-[16px]">
              <span className={`transition-opacity ${arranging ? "" : "opacity-50 hover:opacity-100 focus-within:opacity-100"}`}>
                <EditButton
                  open={arranging && greetingOpen}
                  onClick={() => {
                    setWriting(hello + greeting);
                    if (arranging) setGreetingOpen(true);
                  }}
                  label="Edit the greeting"
                />
              </span>
              {!arranging && (
                <span className="flex items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100">
                  <LineVote kind="like" on={greetVerdict === "like"} onClick={() => voteGreeting(greetVerdict === "like" ? null : "like")} />
                  <LineVote kind="dislike" on={greetVerdict === "dislike"} onClick={() => voteGreeting(greetVerdict === "dislike" ? null : "dislike")} />
                  <NoteButton on={greetWhy === "note"} onClick={() => setGreetWhy((w) => (w === "note" ? null : "note"))} />
                </span>
              )}
            </span>
          )}
        </p>
      </span>
    </div>
    {writing === null && !arranging && (
      <div className="-my-1 flex w-full flex-col items-center empty:hidden">
        {greetSaid && <Confirm text={greetSaid} onDone={() => setGreetSaid(null)} />}
        {greetWhy && <WhyBox key={greetWhy} saying={greeting} source="Welcome greeting" down={greetWhy === "down"} onDone={(sent) => (setGreetWhy(null), sent && setGreetSaid("Thanks, your feedback was sent"))} />}
      </div>
    )}
    {keepAsk && (
      <div className="reveal flex w-full flex-col gap-1.5 rounded-xl px-3 py-2.5" style={{ border: "1px solid rgba(139,112,64,.45)", background: "rgba(255,250,238,.7)" }}>
        <GoldCheck checked={keepAsk.keep} onChange={(v) => setKeepAsk({ ...keepAsk, keep: v })}>
          Save &ldquo;{keepAsk.text}&rdquo; for the future, in the rotation of greetings
        </GoldCheck>
        <GoldCheck checked={keepAsk.retire} onChange={(v) => setKeepAsk({ ...keepAsk, retire: v })}>
          Retire today&rsquo;s original, &ldquo;{keepAsk.was}&rdquo;
        </GoldCheck>
        <div className="flex justify-end">
          <button type="button" onClick={settleGreeting} className="h-8 rounded-full px-4 text-[13px] font-bold" style={GILT}>
            Done
          </button>
        </div>
      </div>
    )}
    </>
  );
}
