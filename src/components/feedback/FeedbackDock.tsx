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
type ButtonPos = { side: "left" | "right"; bottom: number };
type Viewport = { left: number; top: number; w: number; h: number; innerW: number; innerH: number };

const DRAFTS_KEY = "feedback-drafts";
const LEGACY_DRAFT_KEY = "feedback-draft";
const BUTTON_KEY = "feedback-button";
const PANEL_KEY = "feedback-panel";

const BTN = 44;
const EDGE = 12;
const MIN_W = 280;
const MIN_H = 220;
const DEFAULT_BUTTON: ButtonPos = { side: "right", bottom: 92 };

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

/** Keep a panel inside what's visible, shrinking it only when it can't fit. */
function fit(g: Geom, vp: Viewport): Geom {
  const w = clamp(g.w, Math.min(MIN_W, vp.w - 16), vp.w - 16);
  const h = clamp(g.h, Math.min(MIN_H, vp.h - 16), vp.h - 16);
  return {
    w,
    h,
    x: clamp(g.x, vp.left + 8, vp.left + vp.w - w - 8),
    y: clamp(g.y, vp.top + 8, vp.top + vp.h - h - 8),
  };
}

/**
 * Feedback, from any screen. A round button (drag it anywhere; it settles
 * against the nearest side) opens a feedback box that doesn't block the app,
 * so you can keep using the very thing you're writing about. The box can be
 * dragged by its top and resized from its corner, and always stays in view —
 * above the keyboard too. Minimize a draft to start another; minimized drafts
 * wait as small pills by the button. Shortcut: F (when not typing).
 */
export function FeedbackDock({ theme = "calm" }: { theme?: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const vp = useViewport();
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: string; kind: WhenKind; xp: number } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [btn, setBtn] = useState<ButtonPos>(DEFAULT_BUTTON);
  const [btnDrag, setBtnDrag] = useState<{ x: number; y: number } | null>(null);
  const [geom, setGeom] = useState<Geom | null>(null);
  const btnOp = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const panelOp = useRef<{ kind: "move" | "resize"; px: number; py: number; g: Geom } | null>(null);

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
    setBtn(readJson<ButtonPos>(BUTTON_KEY) ?? DEFAULT_BUTTON);
    setGeom(readJson<Geom>(PANEL_KEY));
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Keep every draft that has words in it, so nothing is lost on a reload.
  useEffect(() => {
    if (loaded) writeJson(DRAFTS_KEY, drafts.filter((d) => d.body.trim()));
  }, [drafts, loaded]);

  const open = drafts.find((d) => d.id === openId) ?? null;
  const minimized = drafts.filter((d) => d.id !== openId && d.body.trim());

  /** Leave the open draft: empty ones simply go away. */
  const leaveOpen = useCallback(() => {
    setConfirmDiscard(false);
    setDrafts((ds) => ds.filter((d) => d.id !== openId || d.body.trim()));
    setOpenId(null);
  }, [openId]);

  const startNew = useCallback(() => {
    const d: Draft = { id: newId(), body: "", kind: "feedback" };
    setConfirmDiscard(false);
    setSent(null);
    setDrafts((ds) => [...ds.filter((x) => x.id !== openId || x.body.trim()), d]);
    setOpenId(d.id);
  }, [openId]);

  function restore(id: string) {
    setConfirmDiscard(false);
    setDrafts((ds) => ds.filter((d) => d.id !== openId || d.body.trim()));
    setOpenId(id);
  }

  function discard() {
    setConfirmDiscard(false);
    setDrafts((ds) => ds.filter((d) => d.id !== openId));
    setOpenId(null);
  }

  function requestClose() {
    if (open?.body.trim()) setConfirmDiscard(true);
    else discard();
  }

  function update(patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.id === openId ? { ...d, ...patch } : d)));
  }

  /** The thank-you stays until it's closed (or another is started). */
  function onSent(kind: WhenKind, xp: number) {
    const id = openId;
    if (!id) return;
    setSent({ id, kind, xp });
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, body: "" } : d)));
  }

  // The button, F, and the + sheet's Feedback choice all start feedback.
  useEffect(() => {
    const onOpen = () => (openId ? document.querySelector<HTMLTextAreaElement>("[data-feedback-text]")?.focus() : startNew());
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      onOpen();
    };
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [openId, startNew]);

  if (!loaded || !vp) return null;

  // ---- The round button: tap to start feedback (or tuck the open one away), drag to move.
  const btnTop = vp.innerH - btn.bottom - BTN;
  const buttonStyle: React.CSSProperties = btnDrag
    ? { left: btnDrag.x, top: btnDrag.y }
    : btn.side === "right"
      ? { right: EDGE, top: btnTop }
      : { left: EDGE, top: btnTop };

  function onBtnDown(e: React.PointerEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    btnOp.current = { px: e.clientX, py: e.clientY, ox: r.left, oy: r.top, moved: false };
  }
  function onBtnMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = btnOp.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.px, e.clientY - d.py) > 6) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.moved) setBtnDrag({ x: d.ox + e.clientX - d.px, y: d.oy + e.clientY - d.py });
  }
  function onBtnUp() {
    const d = btnOp.current;
    btnOp.current = null;
    if (!d?.moved || !btnDrag || !vp) return;
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    // Settle against the nearer side, clear of the bottom bar and the top.
    const next: ButtonPos = {
      side: btnDrag.x + BTN / 2 < vp.innerW / 2 ? "left" : "right",
      bottom: Math.round(clamp(vp.innerH - btnDrag.y - BTN, 84, vp.innerH - BTN - 64)),
    };
    setBtn(next);
    setBtnDrag(null);
    writeJson(BUTTON_KEY, next);
  }

  // ---- The box: drag by its top, resize from its corner, always in view.
  const mobile = vp.innerW < 640;
  const defaultGeom = (): Geom => {
    const w = mobile ? vp.innerW - 16 : 380;
    const h = Math.min(mobile ? 330 : 370, vp.innerH - 160);
    const above = vp.innerH - btn.bottom - BTN - 12 - h;
    return { w, h, x: mobile ? 8 : btn.side === "right" ? vp.innerW - w - 20 : 20, y: above > 60 ? above : 60 };
  };
  const shown = fit(geom ?? defaultGeom(), vp);

  function onPanelDown(e: React.PointerEvent<HTMLElement>, kind: "move" | "resize") {
    if (kind === "move" && (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panelOp.current = { kind, px: e.clientX, py: e.clientY, g: shown };
  }
  function onPanelMove(e: React.PointerEvent<HTMLElement>) {
    const o = panelOp.current;
    if (!o) return;
    const dx = e.clientX - o.px;
    const dy = e.clientY - o.py;
    setGeom(o.kind === "move" ? { ...o.g, x: o.g.x + dx, y: o.g.y + dy } : { ...o.g, w: Math.max(MIN_W, o.g.w + dx), h: Math.max(MIN_H, o.g.h + dy) });
  }
  function onPanelUp() {
    if (!panelOp.current) return;
    panelOp.current = null;
    // Handlers come from the latest render, so `shown` is where the box now sits.
    writeJson(PANEL_KEY, shown);
  }

  const coin = isAdventure
    ? {
        background: "radial-gradient(circle at 34% 28%, #fbe7a6, #e0b75a 48%, #a9802c 100%)",
        boxShadow: "0 0 0 1.5px #2e2410, inset 0 1.5px 0 rgba(255,250,225,.65), inset 0 -3px 6px rgba(90,60,12,.35), 0 4px 10px rgba(0,0,0,.45)",
      }
    : { background: "var(--t-card)", boxShadow: "0 0 0 1px var(--t-card-border), 0 4px 12px rgba(0,0,0,.2)" };

  const pillsAbove = btnTop > vp.innerH / 2;
  const isSent = !!open && sent?.id === open.id;

  return createPortal(
    <>
      <button
        type="button"
        data-hide-when-typing
        onPointerDown={onBtnDown}
        onPointerMove={onBtnMove}
        onPointerUp={onBtnUp}
        onPointerCancel={() => {
          btnOp.current = null;
          setBtnDrag(null);
        }}
        onClick={() => {
          if (justDragged.current) return;
          if (openId) leaveOpen();
          else startNew();
        }}
        aria-label={openId ? "Minimize feedback" : "Feedback (F)"}
        title={openId ? "Minimize feedback" : "Feedback (F) — drag to move"}
        aria-expanded={!!openId}
        className={`fixed z-[60] flex touch-none select-none items-center justify-center rounded-full ${btnDrag ? "cursor-grabbing" : "cursor-pointer transition-transform hover:scale-105 active:scale-95"}`}
        style={{ ...buttonStyle, width: BTN, height: BTN, ...coin, transition: btnDrag ? "none" : "left 220ms cubic-bezier(.2,.8,.2,1), right 220ms cubic-bezier(.2,.8,.2,1), top 220ms cubic-bezier(.2,.8,.2,1)" }}
      >
        <ChatIcon size={27} />
        {minimized.length > 0 && !openId && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums"
            style={{ background: "#7a2f1f", color: "#fff6e0", border: "1.5px solid #f2d27e" }}
          >
            {minimized.length}
          </span>
        )}
      </button>

      {/* Minimized drafts wait by the button. */}
      {minimized.length > 0 && !btnDrag && (
        <div
          data-hide-when-typing
          className={`fixed z-[60] flex gap-1.5 ${pillsAbove ? "flex-col-reverse" : "flex-col"} ${btn.side === "right" ? "items-end" : "items-start"}`}
          style={{
            ...(btn.side === "right" ? { right: EDGE } : { left: EDGE }),
            ...(pillsAbove ? { bottom: btn.bottom + BTN + 8 } : { top: btnTop + BTN + 8 }),
            maxWidth: Math.min(260, vp.innerW - 2 * EDGE),
          }}
        >
          {minimized.slice(-4).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => restore(d.id)}
              title="Continue this feedback"
              className="create-sheet-in flex h-9 max-w-full items-center gap-1.5 rounded-full pl-2 pr-3 text-[13.5px] font-semibold shadow-lg"
              style={{ background: "linear-gradient(180deg,#f6e3a8,#dcb763)", color: "#2a1c10", border: "1.5px solid #8a6116" }}
            >
              <ChatIcon size={17} />
              <span className="truncate">{d.body.trim().slice(0, 40)}</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal={false}
          aria-label="Feedback"
          className="fixed z-[61] flex flex-col"
          style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              leaveOpen();
            }
          }}
        >
          {/* Positioning stays on the box above; the theme's parchment frame (which sets position: relative) lives here. */}
          <div
            className="create-sheet-in relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl"
            style={{
              background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
              border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              color: "var(--t-ink)",
            }}
          >
            <div
              className={`relative z-[1] flex shrink-0 select-none items-center gap-1 px-2 pt-1.5 ${isSent ? "pl-4" : "cursor-move touch-none"}`}
              {...(isSent
                ? {}
                : {
                    onPointerDown: (e: React.PointerEvent<HTMLElement>) => onPanelDown(e, "move"),
                    onPointerMove: onPanelMove,
                    onPointerUp: onPanelUp,
                    onPointerCancel: onPanelUp,
                    title: "Drag to move",
                  })}
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
                <button type="button" onClick={leaveOpen} aria-label="Minimize" title="Minimize — start another with the feedback button" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M6 16h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </button>
              )}
              <button type="button" onClick={requestClose} aria-label="Close" title="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
                ×
              </button>
            </div>

            <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
              {sent && isSent ? (
                <Sent kind={sent.kind} xp={sent.xp} isAdventure={isAdventure} onAnother={startNew} />
              ) : (
                <Composer key={open.id} draft={open} isAdventure={isAdventure} onChange={update} onSent={onSent} />
              )}
              {confirmDiscard && (
                <div role="alertdialog" aria-label="Discard this feedback?" className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: isAdventure ? "rgba(236,218,180,.96)" : "var(--t-card)" }}>
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
            </div>

            {/* Resize from the corner. */}
            {!isSent && (
            <span
              role="presentation"
              title="Drag to resize"
              className="absolute bottom-0 right-0 z-[3] flex h-7 w-7 cursor-nwse-resize touch-none items-end justify-end p-1.5"
              onPointerDown={(e) => onPanelDown(e, "resize")}
              onPointerMove={onPanelMove}
              onPointerUp={onPanelUp}
              onPointerCancel={onPanelUp}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ color: "var(--t-ink-soft)", opacity: 0.7 }}>
                <path d="M11 3L3 11M11 7L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            )}
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

/** Where it goes, the XP it earns, what to change, submit. */
function Composer({
  draft,
  isAdventure,
  onChange,
  onSent,
}: {
  draft: Draft;
  isAdventure: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onSent: (kind: WhenKind, xp: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const xp = draft.xp ?? 1;

  function save() {
    if (!draft.body.trim() || isSaving) return;
    setError(null);
    startSaving(async () => {
      try {
        const res = await addJournalEntryAction(draft.body, null, draft.kind, xp);
        onSent(draft.kind, res.xpAwarded);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send it. Check your connection and try again.");
      }
    });
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 pb-3 pt-1"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      <Segmented
        label="Where it goes"
        isAdventure={isAdventure}
        value={draft.kind}
        onChange={(k) => onChange({ kind: k })}
        options={WHEN.map(([k, label, hint]) => ({ value: k, label, hint }))}
      />
      <Segmented
        label="XP you earn"
        lead="XP"
        isAdventure={isAdventure}
        value={xp}
        onChange={(n) => onChange({ xp: n })}
        options={XP_CHOICES.map((n) => ({ value: n, label: `+${n}`, hint: `Earn ${n} XP for this feedback` }))}
      />
      <textarea
        data-feedback-text
        autoFocus
        value={draft.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder={draft.kind === "future" ? "An idea for later. It goes in the future ideas log." : "What would make this better?"}
        aria-label="Feedback"
        className="min-h-[56px] flex-1 resize-none rounded-lg border px-3 py-2 text-[16px] leading-relaxed"
        style={{ borderColor: "var(--t-panel-border)" }}
      />
      {error && (
        <p className="m-0 shrink-0 text-sm" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <div className="flex shrink-0 items-center justify-end gap-2 pr-4">
        <span className="hidden text-[12px] sm:inline" style={{ color: "var(--t-ink-soft)" }}>
          Ctrl + Enter
        </span>
        <button
          type="button"
          onClick={save}
          disabled={isSaving || !draft.body.trim()}
          className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold disabled:opacity-45"
          style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
        >
          {isSaving ? "Sending…" : "Submit feedback"}
        </button>
      </div>
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
}: {
  label: string;
  lead?: string;
  value: V;
  options: { value: V; label: string; hint?: string }[];
  onChange: (v: V) => void;
  isAdventure: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-10 shrink-0 items-stretch gap-0.5 rounded-full p-[3px]" style={{ background: "rgba(70,50,20,.09)", boxShadow: "inset 0 1px 2px rgba(70,50,20,.12)" }}>
      {lead && (
        <span aria-hidden className="flex shrink-0 items-center pl-3 pr-1.5 text-[12.5px] font-bold tracking-wide" style={{ color: "var(--t-xp)" }}>
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
            className="min-w-0 flex-1 truncate rounded-full px-2 text-[13.5px] font-semibold transition-[background,box-shadow] duration-150"
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
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-6 text-center" role="status">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" aria-hidden className="card-pop-in">
        <circle cx="12" cy="12" r="10.5" fill="#58a04a" stroke="#2f5a26" strokeWidth="1.2" />
        <path d="M6.8 12.4l3.4 3.4 7-7.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className={`m-0 ${isAdventure ? "font-display text-xl" : "text-lg font-bold"}`}>
        {kind === "future" ? "Saved to the future ideas log" : kind === "refill" ? "Saved for when credits refill" : "Sent. It goes into the next update."}
      </p>
      {xp > 0 && (
        <p className="m-0 text-[17px] font-bold tabular-nums" style={{ color: "var(--t-xp)" }}>
          +{xp} XP
        </p>
      )}
      <button type="button" onClick={onAnother} className="mt-2 h-10 rounded-full border px-4 text-[14px] font-semibold" style={{ borderColor: "rgba(139,112,64,.5)", color: "var(--t-ink)" }}>
        Write another
      </button>
    </div>
  );
}
