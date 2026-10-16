"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { addJournalEntryAction } from "@/app/actions";

/** Ask the dock to open from anywhere (e.g. the + sheet's Feedback choice). */
export const OPEN_FEEDBACK_EVENT = "open-feedback";
export function openFeedback() {
  window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT));
}

/** A speech bubble: the feedback button's icon. */
export function ChatIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.3 3.4c-.4.3-.9 0-.9-.4V17.5h-.3A1.5 1.5 0 0 1 3 16V7a1.5 1.5 0 0 1 1.5-1.5z"
        fill="#fffaf0"
        stroke="#5a4214"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8.3" cy="11.5" r="1.15" fill="#5a4214" />
      <circle cx="12" cy="11.5" r="1.15" fill="#5a4214" />
      <circle cx="15.7" cy="11.5" r="1.15" fill="#5a4214" />
    </svg>
  );
}

/**
 * Where the panel may sit right now. On a phone, while typing, it docks to
 * the top of what's visible above the keyboard (iPhone's keyboard covers the
 * page instead of shrinking it); otherwise it floats in the corner.
 */
function useTypingDock(panel: React.RefObject<HTMLElement | null>, active: boolean) {
  const [dock, setDock] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (!vv || !touch) return;
    const update = () => {
      const el = panel.current;
      const typing = !!el && el.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "");
      setDock(typing ? { top: Math.round(vv.offsetTop) + 8, height: Math.round(vv.height) - 16 } : null);
    };
    const later = () => window.setTimeout(update, 60);
    const first = requestAnimationFrame(update);
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
      cancelAnimationFrame(first);
      setDock(null);
    };
  }, [active, panel]);
  return dock;
}

const DRAFT_KEY = "feedback-draft";
const POS_KEY = "feedback-dock-pos";

const WHEN = [
  ["feedback", "Next iteration", "The next update"],
  ["refill", "When credits refill", "The next scheduled update"],
  ["future", "For the future", "Keep it in the ideas log"],
] as const;
type WhenKind = (typeof WHEN)[number][0];

type Pos = { x: number; y: number };

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

/**
 * A feedback button that lives in the bottom-right corner of every screen.
 * Its panel doesn't dim or block anything — the app keeps working behind it,
 * so feedback can be written while using the very thing it's about. The
 * panel can be dragged anywhere and tucked into a small draggable pill.
 * Shortcut: press F (when not typing).
 */
export function FeedbackDock({ theme = "calm" }: { theme?: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [offset, setOffset] = useState<Pos>({ x: 0, y: 0 });
  const [pillPos, setPillPos] = useState<Pos>({ x: 0, y: 0 });
  const latest = useRef({ offset, pill: pillPos });
  useEffect(() => {
    latest.current = { offset, pill: pillPos };
  }, [offset, pillPos]);
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean; target: "panel" | "pill" } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const dock = useTypingDock(panelRef, open && !minimized);

  // A spot remembered from a bigger screen (or a rotated phone) can leave the
  // panel or pill partly off screen: bring it back to its home corner.
  useLayoutEffect(() => {
    const offscreen = (el: HTMLElement | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight;
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- correcting a measured position
    if (open && !minimized && !dock && offscreen(panelRef.current)) setOffset({ x: 0, y: 0 });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- correcting a measured position
    if (open && minimized && offscreen(pillRef.current)) setPillPos({ x: 0, y: 0 });
  }, [open, minimized, dock]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only after hydration
    setMounted(true);
    const saved = readJson<{ offset: Pos; pill: Pos }>(POS_KEY);
    if (saved) {
      setOffset(saved.offset ?? { x: 0, y: 0 });
      setPillPos(saved.pill ?? { x: 0, y: 0 });
    }
  }, []);

  const show = useCallback(() => {
    setOpen(true);
    setMinimized(false);
  }, []);

  useEffect(() => {
    const onOpen = () => show();
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      show();
    };
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [show]);

  function startDrag(e: React.PointerEvent, target: "panel" | "pill") {
    if (target === "panel" && (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const from = target === "panel" ? offset : pillPos;
    drag.current = { px: e.clientX, py: e.clientY, x: from.x, y: from.y, moved: false, target };
  }
  function moveDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.px, e.clientY - d.py) > 5) d.moved = true;
    if (!d.moved) return;
    const next = { x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py };
    if (d.target === "panel") setOffset(next);
    else setPillPos(next);
  }
  function endDrag() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.target === "pill" && !d.moved) setMinimized(false);
    // Remember where the panel and pill were left.
    if (d.moved) writeJson(POS_KEY, latest.current);
  }

  const gold = "linear-gradient(180deg,#f2d58a,#d9b45f)";

  const button = (
    <button
      type="button"
      onClick={() => (open && !minimized ? setOpen(false) : show())}
      aria-label="Feedback (F)"
      title="Feedback (F)"
      aria-expanded={open && !minimized}
      data-hide-when-typing
      className="hover-glow fixed right-3 z-[60] flex h-10 w-10 items-center justify-center rounded-full text-[17px] shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-5"
      style={{
        bottom: "calc(5.75rem + env(safe-area-inset-bottom))",
        background: isAdventure ? gold : "var(--t-card)",
        border: `1.5px solid ${isAdventure ? "#8a6116" : "var(--t-card-border)"}`,
        color: "#2a1c10",
      }}
    >
      <ChatIcon size={20} />
    </button>
  );

  if (!mounted) return null;

  return createPortal(
    <>
      {button}
      {open && minimized && (
        <button
          ref={pillRef}
          type="button"
          onPointerDown={(e) => startDrag(e, "pill")}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={() => (drag.current = null)}
          className="create-sheet-in fixed right-3 z-[60] flex h-11 cursor-grab touch-none select-none items-center gap-2 rounded-full px-4 text-[14px] font-semibold shadow-xl sm:right-5"
          style={{
            bottom: "calc(9rem + env(safe-area-inset-bottom))",
            translate: `${pillPos.x}px ${pillPos.y}px`,
            background: gold,
            color: "#2a1c10",
            border: "1.5px solid #8a6116",
          }}
        >
          <ChatIcon size={18} /> Feedback draft · tap to finish
        </button>
      )}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal={false}
          aria-label="Feedback"
          className={`fixed z-[60] flex flex-col ${dock ? "inset-x-2" : "inset-x-2 sm:left-auto sm:right-5 sm:w-[380px]"} ${minimized ? "hidden" : ""}`}
          style={
            dock
              ? { top: dock.top, maxHeight: dock.height }
              : {
                  bottom: "calc(9rem + env(safe-area-inset-bottom))",
                  maxHeight: "calc(100dvh - 10rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
                  translate: `${offset.x}px ${offset.y}px`,
                }
          }
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setMinimized(true);
            }
          }}
        >
          <div
            className="create-sheet-in flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl"
            style={{
              background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
              border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              color: "var(--t-ink)",
            }}
          >
            <div
              className={`relative z-[1] flex shrink-0 select-none items-center gap-1 px-2 pt-2 ${dock ? "" : "cursor-move touch-none"}`}
              onPointerDown={(e) => !dock && startDrag(e, "panel")}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={() => (drag.current = null)}
              title={dock ? undefined : "Drag to move"}
            >
              <span aria-hidden className={`pl-2 text-[15px] tracking-[-2px] ${dock ? "invisible" : ""}`} style={{ color: "var(--t-ink-soft)" }}>
                ⋮⋮
              </span>
              <span className={`flex-1 py-1.5 pl-1 ${isAdventure ? "font-display text-[19px]" : "text-base font-bold"}`}>Feedback</span>
              <button type="button" onClick={() => setMinimized(true)} aria-label="Minimize" title="Minimize" className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: "var(--t-ink-soft)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 17h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" title="Close (your draft is kept)" className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
                ×
              </button>
            </div>
            <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <FeedbackComposer isAdventure={isAdventure} compact={!!dock} onSent={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

/** The form itself: where it goes, what to change, submit. */
function FeedbackComposer({ isAdventure, compact = false, onSent }: { isAdventure: boolean; compact?: boolean; onSent: () => void }) {
  // Closing the panel never loses words: the draft is kept until it's sent.
  const [draft] = useState(() => readJson<{ body: string; kind: WhenKind }>(DRAFT_KEY));
  const [body, setBody] = useState(draft?.body ?? "");
  const [kind, setKind] = useState<WhenKind>(draft?.kind ?? "feedback");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<WhenKind | null>(null);
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    writeJson(DRAFT_KEY, body.trim() ? { body, kind } : null);
  }, [body, kind]);

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        await addJournalEntryAction(body, null, kind);
        writeJson(DRAFT_KEY, null);
        setSent(kind);
        setBody("");
        setKind("feedback");
        setTimeout(onSent, 2600);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send.");
      }
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center" role="status">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" aria-hidden className="card-pop-in">
          <circle cx="12" cy="12" r="10.5" fill="#58a04a" stroke="#2f5a26" strokeWidth="1.2" />
          <path d="M6.8 12.4l3.4 3.4 7-7.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className={`m-0 ${isAdventure ? "font-display text-xl" : "text-lg font-bold"}`}>
          {sent === "future" ? "Saved to the future ideas log" : sent === "refill" ? "Saved for when credits refill" : "Feedback sent — it goes into the next update"}
        </p>
        <button type="button" onClick={() => setSent(null)} className="mt-1 text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
          Write another
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 px-4 pb-4 pt-1.5"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim() && !isSaving) {
          e.preventDefault();
          save();
        }
      }}
    >
      <div role="radiogroup" aria-label="When" className="grid grid-cols-3 gap-1.5">
        {WHEN.map(([k, label, hint]) => {
          const on = kind === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setKind(k)}
              className="create-kind flex flex-col items-start rounded-xl px-2.5 py-2 text-left"
              style={{ background: on ? "rgba(217,180,95,.45)" : "rgba(70,50,20,.07)", border: `1.5px solid ${on ? "#a88a3f" : "transparent"}`, color: "var(--t-ink)" }}
            >
              <span className="text-[13.5px] font-semibold leading-tight">{label}</span>
              {!compact && (
                <span className="mt-0.5 hidden text-[11.5px] leading-snug sm:block" style={{ color: "var(--t-ink-soft)" }}>
                  {hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={compact ? 3 : 5}
        placeholder={kind === "future" ? "An idea for later — kept in the future enhancements log." : "What would make this app better?"}
        aria-label="Feedback"
        className="resize-y rounded-lg border px-3 py-2 text-[16px] leading-relaxed"
        style={{ borderColor: "var(--t-panel-border)" }}
      />
      {error && (
        <p className="m-0 text-sm" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <span className="hidden text-[12px] sm:inline" style={{ color: "var(--t-ink-soft)" }}>
          Ctrl + Enter
        </span>
        <button
          type="button"
          onClick={save}
          disabled={isSaving || !body.trim()}
          className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold disabled:opacity-45"
          style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
        >
          {isSaving ? "Sending…" : "Submit Feedback"}
        </button>
      </div>
    </div>
  );
}
