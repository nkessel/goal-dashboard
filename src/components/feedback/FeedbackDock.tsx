"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { addJournalEntryAction } from "@/app/actions";

/** Ask the dock to start (or bring back) feedback from anywhere, e.g. the + sheet. */
export const OPEN_FEEDBACK_EVENT = "open-feedback";
export function openFeedback() {
  window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT));
}

/** A plain speech-bubble outline: the feedback button's icon. */
export function ChatIcon({ size = 20, ink = "#3a2a10" }: { size?: number; ink?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4.2c-4.6 0-8.2 3.1-8.2 7 0 2.1 1 4 2.7 5.2l-.6 3c-.1.5.4.9.8.6l3.2-1.8c.7.2 1.4.3 2.1.3 4.6 0 8.2-3.1 8.2-7.2 0-3.9-3.6-7.1-8.2-7.1z"
        stroke={ink}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const WHEN = [
  ["feedback", "Next update", "Build it in the next update"],
  ["refill", "Credits refill", "When credits refill: the next scheduled update"],
  ["future", "Future idea", "Keep it in the ideas log"],
] as const;
type WhenKind = (typeof WHEN)[number][0];

/** XP you choose to earn for a piece of feedback. */
const XP_CHOICES = [1, 2, 3] as const;

type Draft = { id: string; body: string; kind: WhenKind; xp?: number };
type Geom = { x: number; y: number; w: number; h: number };
/** The round button's top-left corner, in px from the window's top-left. */
type Pos = { x: number; y: number };
type Viewport = { left: number; top: number; w: number; h: number; innerW: number; innerH: number };

const DRAFTS_KEY = "feedback-drafts";
const LEGACY_DRAFT_KEY = "feedback-draft";
const BUTTON_KEY = "feedback-button-pos";
const PANEL_KEY = "feedback-panel";
const SUBMIT_KEY = "feedback-submit-x";

const BTN = 46;
const MIN_W = 250;
/** The box can be made very thin; its content then scrolls. */
const MIN_H = 96;
/** The Submit button sits across the box's bottom edge, this far below it. */
const SUBMIT_DROP = 15;

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
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

/** The part of the screen actually visible (above an iPhone keyboard, say). */
function useViewport(): Viewport | null {
  const [vp, setVp] = useState<Viewport | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const zoomed = !!vv && vv.scale > 1.05;
      setVp({
        left: vv && !zoomed ? vv.offsetLeft : 0,
        top: vv && !zoomed ? vv.offsetTop : 0,
        w: vv && !zoomed ? vv.width : window.innerWidth,
        h: vv && !zoomed ? vv.height : window.innerHeight,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
      });
    };
    const raf = requestAnimationFrame(update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return vp;
}

/** Keep the box inside what's visible (leaving room for Submit under it), shrinking only when it can't fit. */
function fit(g: Geom, vp: Viewport): Geom {
  const w = clamp(g.w, Math.min(MIN_W, vp.w - 16), vp.w - 16);
  const h = clamp(g.h, Math.min(MIN_H, vp.h - 40), vp.h - 40);
  return {
    w,
    h,
    x: clamp(g.x, vp.left + 8, vp.left + vp.w - w - 8),
    y: clamp(g.y, vp.top + 8, vp.top + vp.h - h - 8 - SUBMIT_DROP - 8),
  };
}

/**
 * Track a press that may turn into a drag. Listens on the window so a drag
 * can never get "stuck" to the pointer, whatever element it ends over.
 * `onTap` runs for a press that didn't move.
 */
function pressOrDrag(
  e: React.PointerEvent,
  opts: { onMove: (dx: number, dy: number) => void; onEnd: (moved: boolean) => void; threshold?: number }
) {
  if (e.button !== 0) return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  const id = e.pointerId;
  let moved = false;
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    if (!moved && Math.hypot(dx, dy) < (opts.threshold ?? 6)) return;
    moved = true;
    ev.preventDefault();
    opts.onMove(dx, dy);
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    opts.onEnd(moved);
  };
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

/**
 * Feedback, from any screen. A round button (drag it anywhere — it stays
 * where you put it) opens a feedback box that doesn't block the app, so you
 * can keep using the very thing you're writing about. The box can be dragged
 * by its top and resized from its corner — even very thin, when its content
 * scrolls — and always stays in view, above the keyboard too. Submit sits
 * on the box's bottom edge, always visible (slide it along the edge to move
 * it). Minimize a draft to start another; with drafts waiting, the button
 * asks whether to continue one or start fresh. Shortcut: F (when not typing).
 */
export function FeedbackDock({ theme = "calm" }: { theme?: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const vp = useViewport();
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: string; kind: WhenKind; xp: number } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragPos, setDragPos] = useState<Pos | null>(null);
  const [geom, setGeom] = useState<Geom | null>(null);
  const [submitX, setSubmitX] = useState<number | null>(null);
  const [submitDrag, setSubmitDrag] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const justDragged = useRef(false);

  // Restore drafts and positions saved on this device.
  useEffect(() => {
    const saved = readJson<Draft[]>(DRAFTS_KEY) ?? [];
    const legacy = readJson<{ body?: string; kind?: WhenKind }>(LEGACY_DRAFT_KEY);
    if (legacy?.body?.trim()) {
      saved.push({ id: newId(), body: legacy.body, kind: legacy.kind ?? "feedback" });
      writeJson(LEGACY_DRAFT_KEY, null);
    }
    /* eslint-disable react-hooks/set-state-in-effect -- browser storage is only readable after hydration */
    setDrafts(saved.filter((d) => d && typeof d.body === "string"));
    setPos(readJson<Pos>(BUTTON_KEY));
    setGeom(readJson<Geom>(PANEL_KEY));
    setSubmitX(readJson<number>(SUBMIT_KEY));
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Keep every draft that has words in it, so nothing is lost on a reload.
  useEffect(() => {
    if (loaded) writeJson(DRAFTS_KEY, drafts.filter((d) => d.body.trim()));
  }, [drafts, loaded]);

  const open = drafts.find((d) => d.id === openId) ?? null;
  const waiting = drafts.filter((d) => d.id !== openId && d.body.trim());

  /** Leave the open draft: empty ones simply go away. */
  const leaveOpen = useCallback(() => {
    setConfirmDiscard(false);
    setError(null);
    setDrafts((ds) => ds.filter((d) => d.id !== openId || d.body.trim()));
    setOpenId(null);
  }, [openId]);

  const startNew = useCallback(() => {
    const d: Draft = { id: newId(), body: "", kind: "feedback" };
    setConfirmDiscard(false);
    setChoosing(false);
    setSent(null);
    setError(null);
    setDrafts((ds) => [...ds.filter((x) => x.id !== openId || x.body.trim()), d]);
    setOpenId(d.id);
  }, [openId]);

  /** The button (or F): with drafts waiting, ask; otherwise start one. */
  const begin = useCallback(() => {
    if (openId) {
      document.querySelector<HTMLTextAreaElement>("[data-feedback-text]")?.focus();
      return;
    }
    const hasWaiting = drafts.some((d) => d.body.trim());
    if (hasWaiting) setChoosing((v) => !v);
    else startNew();
  }, [openId, drafts, startNew]);

  function restore(id: string) {
    setConfirmDiscard(false);
    setChoosing(false);
    setError(null);
    setSent(null);
    setDrafts((ds) => ds.filter((d) => d.id !== openId || d.body.trim()));
    setOpenId(id);
  }

  function discard() {
    setConfirmDiscard(false);
    setError(null);
    setDrafts((ds) => ds.filter((d) => d.id !== openId));
    setOpenId(null);
  }

  function requestClose() {
    if (open?.body.trim() && sent?.id !== open.id) setConfirmDiscard(true);
    else discard();
  }

  function update(patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.id === openId ? { ...d, ...patch } : d)));
  }

  function submit() {
    const d = open;
    if (!d || !d.body.trim() || isSaving) return;
    setError(null);
    startSaving(async () => {
      try {
        const res = await addJournalEntryAction(d.body, null, d.kind, d.xp ?? 1);
        // The thank-you stays until it's closed (or another is started).
        setSent({ id: d.id, kind: d.kind, xp: res.xpAwarded });
        setDrafts((ds) => ds.map((x) => (x.id === d.id ? { ...x, body: "" } : x)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send it. Check your connection and try again.");
      }
    });
  }

  // The button, F, and the + sheet's Feedback choice all start feedback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      begin();
    };
    window.addEventListener(OPEN_FEEDBACK_EVENT, begin);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_FEEDBACK_EVENT, begin);
      window.removeEventListener("keydown", onKey);
    };
  }, [begin]);

  if (!loaded || !vp) return null;

  // ---- The round button: tap to start (or continue) feedback, drag to put it anywhere.
  const defaultPos: Pos = { x: vp.innerW - BTN - 12, y: vp.innerH - BTN - 92 };
  const placeBtn = (p: Pos): Pos => ({ x: clamp(p.x, 6, vp.innerW - BTN - 6), y: clamp(p.y, 6, vp.innerH - BTN - 6) });
  const btnPos = placeBtn(dragPos ?? pos ?? defaultPos);

  function onBtnDown(e: React.PointerEvent<HTMLButtonElement>) {
    const start = btnPos;
    let last = start;
    pressOrDrag(e, {
      onMove: (dx, dy) => {
        last = placeBtn({ x: start.x + dx, y: start.y + dy });
        setDragPos(last);
        setChoosing(false);
      },
      onEnd: (moved) => {
        if (!moved) return;
        justDragged.current = true;
        setTimeout(() => (justDragged.current = false), 0);
        setPos(last);
        setDragPos(null);
        writeJson(BUTTON_KEY, last);
      },
    });
  }

  // ---- The box: drag by its top, resize from its corner, always in view.
  const mobile = vp.innerW < 640;
  const defaultGeom = (): Geom => {
    const w = mobile ? vp.innerW - 16 : 380;
    const h = Math.min(mobile ? 320 : 350, vp.innerH - 170);
    const above = btnPos.y - 12 - h - SUBMIT_DROP;
    return { w, h, x: mobile ? 8 : clamp(btnPos.x + BTN - w, 20, vp.innerW - w - 20), y: above > 60 ? above : 60 };
  };
  const shown = fit(geom ?? defaultGeom(), vp);
  const isSent = !!open && sent?.id === open.id;

  function onPanelDown(e: React.PointerEvent<HTMLElement>, kind: "move" | "resize") {
    if (kind === "move" && (e.target as HTMLElement).closest("button")) return;
    if (kind === "resize") e.preventDefault();
    const g = shown;
    const view = vp!;
    let last = g;
    pressOrDrag(e, {
      threshold: kind === "resize" ? 0 : 4,
      onMove: (dx, dy) => {
        last = kind === "move" ? { ...g, x: g.x + dx, y: g.y + dy } : { ...g, w: Math.max(MIN_W, g.w + dx), h: Math.max(MIN_H, g.h + dy) };
        setGeom(last);
      },
      onEnd: (moved) => moved && writeJson(PANEL_KEY, fit(last, view)),
    });
  }

  // ---- Submit: on the bottom edge, slid anywhere along it.
  const SUBMIT_W = 112;
  const submitLeft = clamp(submitDrag ?? submitX ?? shown.w - SUBMIT_W - 34, 10, shown.w - SUBMIT_W - 30);
  function onSubmitDown(e: React.PointerEvent<HTMLButtonElement>) {
    const start = submitLeft;
    let last = start;
    pressOrDrag(e, {
      onMove: (dx) => {
        last = clamp(start + dx, 10, shown.w - SUBMIT_W - 30);
        setSubmitDrag(last);
      },
      onEnd: (moved) => {
        if (!moved) return;
        justDragged.current = true;
        setTimeout(() => (justDragged.current = false), 0);
        setSubmitX(last);
        setSubmitDrag(null);
        writeJson(SUBMIT_KEY, last);
      },
    });
  }

  const coin = isAdventure
    ? {
        background: "radial-gradient(circle at 34% 28%, #fbe7a6, #e0b75a 48%, #a9802c 100%)",
        boxShadow: "0 0 0 1.5px #2e2410, inset 0 1.5px 0 rgba(255,250,225,.65), inset 0 -3px 6px rgba(90,60,12,.35), 0 4px 10px rgba(0,0,0,.45)",
      }
    : { background: "var(--t-card)", boxShadow: "0 0 0 1px var(--t-card-border), 0 4px 12px rgba(0,0,0,.2)" };

  const chooserAbove = btnPos.y > vp.innerH / 2;
  const chooserRight = btnPos.x > vp.innerW / 2;

  return createPortal(
    <>
      <button
        type="button"
        data-feedback-hide
        onPointerDown={onBtnDown}
        onClick={() => {
          if (justDragged.current) return;
          if (openId) leaveOpen();
          else begin();
        }}
        aria-label={openId ? "Minimize feedback" : "Feedback (F)"}
        title={openId ? "Minimize feedback" : "Feedback (F) — drag to move"}
        aria-expanded={!!openId || choosing}
        className={`fixed z-[60] flex touch-none select-none items-center justify-center rounded-full ${dragPos ? "cursor-grabbing" : "cursor-pointer transition-transform hover:scale-105 active:scale-95"}`}
        style={{ left: btnPos.x, top: btnPos.y, width: BTN, height: BTN, ...coin }}
      >
        <ChatIcon size={27} />
        {waiting.length > 0 && !openId && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums"
            style={{ background: "#7a2f1f", color: "#fff6e0", border: "1.5px solid #f2d27e" }}
          >
            {waiting.length}
          </span>
        )}
      </button>

      {/* Drafts waiting: keep working on one, or start a new one. */}
      {choosing && !openId && !dragPos && (
        <div
          role="menu"
          aria-label="Your unsent feedback"
          className="card-pop-in parchment fixed z-[61] flex w-[min(300px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{
            ...(chooserRight ? { right: vp.innerW - btnPos.x - BTN } : { left: btnPos.x }),
            ...(chooserAbove ? { bottom: vp.innerH - btnPos.y + 8 } : { top: btnPos.y + BTN + 8 }),
            borderRadius: 16,
            color: "var(--t-ink)",
          }}
        >
          <p className="relative z-[1] m-0 px-4 pb-1 pt-3 text-[13px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
            Keep working on…
          </p>
          {waiting.slice(-4).reverse().map((d) => (
            <button key={d.id} type="button" role="menuitem" onClick={() => restore(d.id)} className="relative z-[1] flex min-h-11 items-center gap-2 px-4 text-left text-[14.5px] hover:bg-black/5">
              <ChatIcon size={16} />
              <span className="min-w-0 flex-1 truncate">{d.body.trim()}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={startNew}
            className="relative z-[1] flex min-h-11 items-center gap-2 border-t px-4 text-left text-[14.5px] font-semibold hover:bg-black/5"
            style={{ borderColor: "rgba(139,112,64,.3)" }}
          >
            <span aria-hidden className="w-4 text-center text-[18px] leading-none" style={{ color: "#8a6116" }}>
              +
            </span>
            New feedback
          </button>
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal={false}
          aria-label="Feedback"
          className="fixed z-[61]"
          style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              leaveOpen();
            }
          }}
        >
          {/* Positioning stays on this box; the theme's parchment frame (which sets position: relative) lives inside. */}
          <div
            className="create-sheet-in relative flex h-full flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl"
            style={{
              background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
              border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              color: "var(--t-ink)",
            }}
          >
            {/* Everything scrolls together, so a very thin box still reaches it all. */}
            <div className="feedback-scroll relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-6">
              <div
                className={`flex shrink-0 select-none items-center gap-1 px-2 pt-1.5 ${isSent ? "pl-4" : "cursor-move touch-none"}`}
                onPointerDown={isSent ? undefined : (e) => onPanelDown(e, "move")}
                title={isSent ? undefined : "Drag to move"}
              >
                {!isSent && (
                  <span aria-hidden className="flex h-9 w-6 items-center justify-center" style={{ color: "var(--t-ink-soft)" }}>
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
                      {[2, 8, 14].map((y) => (
                        <g key={y}>
                          <circle cx="2.5" cy={y} r="1.4" />
                          <circle cx="7.5" cy={y} r="1.4" />
                        </g>
                      ))}
                    </svg>
                  </span>
                )}
                <span className={`flex-1 py-1 ${isAdventure ? "font-display text-[18px]" : "text-base font-bold"}`}>Feedback</span>
                {!isSent && (
                  <button type="button" onClick={leaveOpen} aria-label="Minimize" title="Minimize — continue it later from the feedback button" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M6 16h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
                <button type="button" onClick={requestClose} aria-label="Close" title="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
                  ×
                </button>
              </div>

              {isSent && sent ? (
                <Sent kind={sent.kind} xp={sent.xp} isAdventure={isAdventure} onAnother={startNew} />
              ) : (
                <Composer key={open.id} draft={open} isAdventure={isAdventure} error={error} onChange={update} onSubmit={submit} />
              )}
            </div>

            {confirmDiscard && (
              <div role="alertdialog" aria-label="Discard this feedback?" className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 overflow-y-auto px-6 text-center" style={{ background: isAdventure ? "rgba(236,218,180,.97)" : "var(--t-card)" }}>
                <p className="m-0 text-[15.5px] leading-snug" style={{ color: "var(--t-ink)" }}>
                  Discard this feedback? What you wrote will be lost.
                </p>
                <div className="flex gap-2">
                  <button type="button" autoFocus onClick={() => setConfirmDiscard(false)} className="h-10 rounded-full px-5 text-[14.5px] font-semibold" style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}>
                    Keep writing
                  </button>
                  <button type="button" onClick={discard} className="h-10 rounded-full px-4 text-[14.5px] underline" style={{ color: "var(--t-ink-soft)" }}>
                    Discard
                  </button>
                </div>
              </div>
            )}

            {/* Resize from the corner. */}
            <span
              role="presentation"
              title="Drag to resize"
              className="absolute bottom-0 right-0 z-[3] flex h-7 w-7 cursor-nwse-resize touch-none items-end justify-end p-1.5"
              onPointerDown={(e) => onPanelDown(e, "resize")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ color: "var(--t-ink-soft)", opacity: 0.7 }}>
                <path d="M11 3L3 11M11 7L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          </div>

          {/* Submit: always visible, across the bottom edge; slide it along the edge to move it. */}
          {!isSent && (
            <button
              type="button"
              onPointerDown={onSubmitDown}
              onClick={() => {
                if (justDragged.current) return;
                submit();
              }}
              disabled={isSaving || !open.body.trim()}
              title="Submit feedback (Ctrl + Enter) — drag to slide it along the edge"
              className={`hover-glow absolute z-[5] h-8 touch-none select-none rounded-full text-[13.5px] font-bold shadow-lg disabled:opacity-60 ${submitDrag !== null ? "cursor-grabbing" : ""}`}
              style={{
                left: submitLeft,
                bottom: -SUBMIT_DROP,
                width: SUBMIT_W,
                background: isAdventure ? "linear-gradient(180deg,#f6e3a8,#dcb763)" : "var(--t-accent)",
                color: isAdventure ? "#2a1c10" : "#fff",
                border: isAdventure ? "1.5px solid #8a6116" : undefined,
              }}
            >
              {isSaving ? "Sending…" : "Submit"}
            </button>
          )}
        </div>
      )}
    </>,
    document.body
  );
}

/** Where it goes, the XP it earns, and what to change. */
function Composer({
  draft,
  isAdventure,
  error,
  onChange,
  onSubmit,
}: {
  draft: Draft;
  isAdventure: boolean;
  error: string | null;
  onChange: (patch: Partial<Draft>) => void;
  onSubmit: () => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const xp = draft.xp ?? 1;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 pb-2 pt-1">
      <Segmented
        label="Where it goes"
        isAdventure={isAdventure}
        value={draft.kind}
        onChange={(k) => {
          onChange({ kind: k });
          textRef.current?.focus();
        }}
        options={WHEN.map(([k, label, hint]) => ({ value: k, label, hint }))}
      />
      <Segmented
        label="XP you earn"
        lead="XP"
        small
        isAdventure={isAdventure}
        value={xp}
        onChange={(n) => {
          onChange({ xp: n });
          // Straight on to writing.
          textRef.current?.focus();
        }}
        options={XP_CHOICES.map((n) => ({ value: n, label: `+${n}`, hint: `Earn ${n} XP for this feedback` }))}
      />
      <textarea
        ref={textRef}
        data-feedback-text
        autoFocus
        value={draft.body}
        onChange={(e) => onChange({ body: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={draft.kind === "future" ? "An idea for later. It goes in the future ideas log." : "What would make this better?"}
        aria-label="Feedback"
        className="min-h-[72px] flex-1 resize-none rounded-lg border px-3 py-2 text-[16px] leading-relaxed"
        style={{ borderColor: "var(--t-panel-border)" }}
      />
      {error && (
        <p className="m-0 shrink-0 text-sm" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One choice from a few, as a single pill track: equal segments that fit a
 * phone and a desktop alike. An optional lead label sits inside the track.
 */
function Segmented<V extends string | number>({
  label,
  lead,
  value,
  options,
  onChange,
  isAdventure,
  small = false,
}: {
  label: string;
  lead?: string;
  value: V;
  options: { value: V; label: string; hint?: string }[];
  onChange: (v: V) => void;
  isAdventure: boolean;
  small?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex shrink-0 flex-wrap items-stretch gap-0.5 p-[3px] ${small ? "min-h-8 w-fit max-w-full self-start rounded-[16px]" : "min-h-10 rounded-[20px]"}`}
      style={{ background: "rgba(70,50,20,.09)", boxShadow: "inset 0 1px 2px rgba(70,50,20,.12)" }}
    >
      {lead && (
        <span aria-hidden className={`flex shrink-0 items-center pr-1 font-bold tracking-wide ${small ? "pl-2.5 text-[11.5px]" : "pl-3 text-[12.5px]"}`} style={{ color: "var(--t-xp)" }}>
          {lead}
        </span>
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-full font-semibold transition-[background,box-shadow] duration-150 ${small ? "h-[26px] px-3 text-[12.5px]" : "h-[34px] flex-auto px-2.5 text-[13.5px]"}`}
            style={{
              background: on ? (isAdventure ? "linear-gradient(180deg,#f6e3a8,#dcb763)" : "var(--t-card)") : "transparent",
              boxShadow: on ? "0 1px 3px rgba(60,40,10,.3), 0 0 0 1px rgba(138,97,22,.55)" : undefined,
              color: on ? "#2a1c10" : "var(--t-ink-soft)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Sent({ kind, xp, isAdventure, onAnother }: { kind: WhenKind; xp: number; isAdventure: boolean; onAnother: () => void }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-2 pt-1" role="status">
      <div className="flex items-center gap-2.5">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden className="card-pop-in shrink-0">
          <circle cx="12" cy="12" r="10.5" fill="#58a04a" stroke="#2f5a26" strokeWidth="1.2" />
          <path d="M6.8 12.4l3.4 3.4 7-7.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className={`m-0 leading-snug ${isAdventure ? "font-display text-[17px]" : "text-[15.5px] font-bold"}`}>
            {kind === "future" ? "Saved to the future ideas log" : kind === "refill" ? "Saved for when credits refill" : "Sent — it goes into the next update"}
          </p>
          {xp > 0 && (
            <p className="m-0 text-[14.5px] font-bold tabular-nums" style={{ color: "var(--t-xp)" }}>
              +{xp} XP
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onAnother}
        className="flex h-10 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[14.5px] font-bold"
        style={{ background: isAdventure ? "linear-gradient(180deg,#f6e3a8,#dcb763)" : "var(--t-accent)", border: isAdventure ? "1.5px solid #8a6116" : undefined, color: isAdventure ? "#2a1c10" : "#fff" }}
      >
        <span aria-hidden className="text-[17px] leading-none">+</span>
        Write another
      </button>
    </div>
  );
}
