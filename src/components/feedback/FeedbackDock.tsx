"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { loadFx, type FeedbackStyle } from "@/lib/celebration-fx";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { createPortal } from "react-dom";
import { useEscape } from "@/lib/use-escape";

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

type Draft = { id: string; body: string; kind: WhenKind; xp?: number; images?: string[]; page?: string; context?: string; shot?: string | null; updatedAt?: number; deleted?: boolean };

/** Two lists of drafts as one: the newest edit of each wins, and deletions stick. */
function mergeDrafts(a: Draft[], b: Draft[]): Draft[] {
  const byId = new Map<string, Draft>();
  for (const d of [...a, ...b]) {
    if (!d || typeof d.id !== "string" || typeof d.body !== "string") continue;
    const prev = byId.get(d.id);
    if (!prev || (d.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) byId.set(d.id, d);
  }
  return [...byId.values()];
}
/** What to keep: drafts with words in them, and recent deletions (so another tab or device doesn't bring them back). */
const keepable = (ds: Draft[]) =>
  ds
    // A draft emptied out counts as deleted, so an older copy elsewhere can't bring it back.
    .map((d) => (!d.deleted && !d.body.trim() ? { ...d, deleted: true } : d))
    .filter((d) => !d.deleted || (d.updatedAt ?? 0) > Date.now() - 86_400_000);
type Geom = { x: number; y: number; w: number; h: number };
/** The round button's top-left corner, in px from the window's top-left. */
type Pos = { x: number; y: number };
type Viewport = { left: number; top: number; w: number; h: number; innerW: number; innerH: number };

const DRAFTS_KEY = "feedback-drafts";
const LEGACY_DRAFT_KEY = "feedback-draft";
const BUTTON_KEY = "feedback-button-pos";
const PANEL_KEY = "feedback-panel";
/** Phones: how far below the top of the visible screen the box sits. */
const PHONE_Y_KEY = "feedback-panel-phone-y";

const BTN = 46;
const MIN_W = 250;
/** The box can be made very thin; its content then scrolls. */
const MIN_H = 96;

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

/** Unless you choose: 1 XP per paragraph, up to 3. */
function autoXp(body: string) {
  return Math.max(1, Math.min(3, body.split(/\n+/).filter((p) => p.trim().length > 0).length));
}

/** What device the note came from, in a few words. */
function deviceLabel() {
  try {
    const ua = navigator.userAgent;
    const kind = /iPhone|Android.+Mobile/.test(ua) ? "phone" : /iPad|Android/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) ? "tablet" : "computer";
    const os = /iPhone|iPad|Macintosh/.test(ua) ? (kind === "computer" ? "Mac" : "iOS") : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : "";
    return `${kind}${os ? ` (${os})` : ""}, ${window.innerWidth}×${window.innerHeight}`;
  } catch {
    return "";
  }
}

/** The part of the screen actually visible (above an iPhone keyboard, say). */
function useViewport(): Viewport | null {
  const [vp, setVp] = useState<Viewport | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const read = () => {
      pending = 0;
      const zoomed = !!vv && vv.scale > 1.05;
      const next = {
        left: Math.round(vv && !zoomed ? vv.offsetLeft : 0),
        top: Math.round(vv && !zoomed ? vv.offsetTop : 0),
        w: Math.round(vv && !zoomed ? vv.width : window.innerWidth),
        h: Math.round(vv && !zoomed ? vv.height : window.innerHeight),
        innerW: window.innerWidth,
        innerH: window.innerHeight,
      };
      // Only re-render when something actually changed (at most once a frame).
      setVp((p) => (p && p.left === next.left && p.top === next.top && p.w === next.w && p.h === next.h && p.innerW === next.innerW && p.innerH === next.innerH ? p : next));
    };
    let pending = 0;
    const update = () => {
      if (!pending) pending = requestAnimationFrame(read);
    };
    const raf = requestAnimationFrame(read);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      if (pending) cancelAnimationFrame(pending);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return vp;
}

/**
 * On a phone the box keeps one size whether or not the keyboard is up, and
 * its place is measured from the top of what you can see — so the keyboard
 * sliding in or out never moves or resizes it. Its top bar (with Submit)
 * always stays in sight; the rest may sit behind the keyboard if you drag it there.
 */
function fitPhone(relY: number, h: number, vp: Viewport): Geom {
  const hh = clamp(h, 170, Math.max(170, vp.innerH - 90));
  return { x: vp.left + 8, w: vp.w - 16, h: hh, y: vp.top + clamp(relY, 8, Math.max(8, vp.h - 58)) };
}

/** Keep the box inside what's visible, shrinking only when it can't fit. */
function fit(g: Geom, vp: Viewport): Geom {
  const w = clamp(g.w, Math.min(MIN_W, vp.w - 16), vp.w - 16);
  // Sized against the whole screen (not what the keyboard leaves), so it never jumps when typing.
  const h = clamp(g.h, Math.min(MIN_H, vp.innerH - 40), vp.innerH - 40);
  return {
    w,
    h,
    x: clamp(g.x, vp.left + 8, vp.left + vp.w - w - 8),
    // Down as far as you like, while its top bar (with Submit) stays in sight.
    y: clamp(g.y, vp.top + 8, Math.max(vp.top + 8, vp.top + vp.h - 58)),
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
  // The little celebration after Submit: it plays and fades by itself.
  const [celebrate, setCelebrate] = useState<{ key: number; kind: WhenKind; xp: number; x: number; y: number; style: FeedbackStyle } | null>(null);
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(null), celebrate.style === "toucan" ? 3600 : 2600);
    return () => clearTimeout(t);
  }, [celebrate]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragPos, setDragPos] = useState<Pos | null>(null);
  const [geom, setGeom] = useState<Geom | null>(null);
  const [sized, setSized] = useState(false);
  // Extra height the writing has asked for (per note).
  const [grow, setGrow] = useState<{ id: string; px: number } | null>(null);
  const [phoneY, setPhoneY] = useState<number | null>(null);
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
    setDrafts(mergeDrafts([], saved));
    // Drafts kept on your account (from another tab or device) join in.
    fetch("/api/feedback/drafts")
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((j: { drafts?: Draft[] }) => setDrafts((ds) => mergeDrafts(ds, j.drafts ?? [])))
      .catch(() => {});
    setPos(readJson<Pos>(BUTTON_KEY));
    setGeom(readJson<Geom>(PANEL_KEY));
    setPhoneY(readJson<number>(PHONE_Y_KEY));
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Keep every draft that has words in it — on this device at once, and on
  // your account shortly after — so nothing is lost on a reload, in another
  // tab, or on another device.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const merged = keepable(mergeDrafts(readJson<Draft[]>(DRAFTS_KEY) ?? [], drafts));
    writeJson(DRAFTS_KEY, merged);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      void fetch("/api/feedback/drafts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ drafts: merged }), keepalive: true }).catch(() => {});
    }, 1200);
  }, [drafts, loaded]);
  // Another tab changed the drafts: take its changes in.
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key !== DRAFTS_KEY || !e.newValue) return;
      try {
        const theirs = JSON.parse(e.newValue) as Draft[];
        setDrafts((ds) => {
          const m = mergeDrafts(ds, theirs);
          return m.length === ds.length && m.every((d, i) => d === ds[i]) ? ds : m;
        });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);

  const open = drafts.find((d) => d.id === openId && (!d.deleted || sent?.id === d.id)) ?? null;
  const waiting = drafts.filter((d) => d.id !== openId && !d.deleted && d.body.trim());

  /** Leave the open draft: empty ones simply go away. */
  const leaveOpen = useCallback(() => {
    setConfirmDiscard(false);
    setError(null);
    setDrafts((ds) => ds.filter((d) => d.id !== openId || d.body.trim()));
    setOpenId(null);
  }, [openId]);

  const startNew = useCallback(() => {
    // The context, in words: the page, any open window and what's in view.
    const d: Draft = { id: newId(), body: "", kind: "feedback", page: window.location.pathname + window.location.search, context: [readContext(), deviceLabel() && `on a ${deviceLabel()}`].filter(Boolean).join(" · "), shot: null, updatedAt: Date.now() };
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
    setDrafts((ds) => ds.map((d) => (d.id === openId ? { ...d, deleted: true, updatedAt: Date.now() } : d)));
    setOpenId(null);
  }

  function requestClose() {
    if (open?.body.trim() && sent?.id !== open.id) setConfirmDiscard(true);
    else discard();
  }

  function update(patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.id === openId ? { ...d, ...patch, updatedAt: Date.now() } : d)));
  }

  function submit() {
    const d = open;
    if (!d || !d.body.trim() || isSaving) return;
    setError(null);
    // Straight into the celebration; the note is sent behind it.
    const xp = d.xp ?? autoXp(d.body);
    setCelebrate({ key: Date.now(), kind: d.kind, xp, x: shown.x + shown.w / 2, y: shown.y + Math.min(shown.h, 260) / 2, style: loadFx().feedbackStyle ?? "seal" });
    setDrafts((ds) => ds.map((x) => (x.id === d.id ? { ...x, deleted: true, updatedAt: Date.now() } : x)));
    setOpenId(null);
    startSaving(async () => {
      try {
        const r = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: d.body, kind: d.kind, xp: d.xp ?? autoXp(d.body), images: [...(d.shot ? [d.shot] : []), ...(d.images ?? [])], page: d.page, context: d.context }),
        });
        const res = (await r.json().catch(() => ({ ok: false, error: "Couldn't send it." }))) as { ok: boolean; xpAwarded?: number; error?: string };
        if (!r.ok || !res.ok) throw new Error(r.status === 401 || r.status === 403 ? "You've been signed out — sign in again to send (your note is saved)." : (res.error ?? "Couldn't send it."));
        setDrafts((ds) => ds.map((x) => (x.id === d.id ? { ...x, body: "", deleted: true, updatedAt: Date.now() } : x)));
      } catch (e) {
        // It didn't go: bring the note back, just as it was.
        setCelebrate(null);
        setDrafts((ds) => ds.map((x) => (x.id === d.id ? { ...d, deleted: false, updatedAt: Date.now() } : x)));
        setOpenId(d.id);
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

  // Escape minimizes the feedback box first, before any dialog under it (like an open quest editor).
  useEscape(() => leaveOpen(), !!openId);
  const sentOpen = !!openId && sent?.id === openId;
  // Once it's sent, a tap anywhere outside closes the little "Sent" card.
  useEffect(() => {
    if (!sentOpen) return;
    const away = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-feedback-root]")) return;
      requestClose();
    };
    const t = setTimeout(() => document.addEventListener("pointerdown", away), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", away);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-bound only when the sent state changes
  }, [sentOpen]);
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
  const growBy = grow && open && grow.id === open.id ? grow.px : 0;
  const defaultGeom = (): Geom => {
    // Starts at a comfortable size and grows as you write (up to the screen),
    // so it only takes the whole screen when it really needs it.
    const w = mobile ? vp.innerW - 16 : Math.min(460, vp.innerW - 40);
    // Phones: sized from the whole screen (never from what the keyboard leaves), so it doesn't jump.
    const h = mobile ? Math.min(Math.round(clamp(vp.innerH * 0.4, 220, 300)) + growBy, Math.round(vp.innerH * 0.62)) : Math.min(380, vp.innerH - 170) + growBy;
    const above = btnPos.y - 12 - h;
    return { w, h, x: mobile ? 8 : clamp(btnPos.x + BTN - w, 20, vp.innerW - w - 20), y: above > 60 ? above : 60 };
  };
  const def = defaultGeom();
  // A size you dragged it to this time stands; otherwise it's as tall as the writing needs.
  const shown = mobile ? fitPhone(phoneY ?? 64, sized && geom ? geom.h : def.h, vp) : fit(geom ? { ...geom, h: sized ? geom.h : def.h } : def, vp);
  const isSent = !!open && sent?.id === open.id;

  function onPanelDown(e: React.PointerEvent<HTMLElement>, kind: "move" | "resize") {
    if (kind === "move" && (e.target as HTMLElement).closest("button")) return;
    if (kind === "resize") {
      e.preventDefault();
      setSized(true);
    }
    const g = shown;
    const view = vp!;
    let last = g;
    pressOrDrag(e, {
      threshold: kind === "resize" ? 0 : 4,
      onMove: (dx, dy) => {
        last = kind === "move" ? { ...g, x: g.x + dx, y: g.y + dy } : { ...g, w: Math.max(MIN_W, g.w + dx), h: Math.max(MIN_H, g.h + dy) };
        if (mobile && kind === "move") setPhoneY(last.y - view.top);
        else setGeom(last);
      },
      onEnd: (moved) => {
        if (!moved) return;
        if (mobile && kind === "move") writeJson(PHONE_Y_KEY, Math.round(clamp(last.y - view.top, 8, view.h - 58)));
        else writeJson(PANEL_KEY, fit(last, view));
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
        data-feedback-root
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
          data-feedback-root
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
          data-feedback-root
          className="fixed z-[61]"
          style={{ left: shown.x, top: shown.y, width: shown.w, height: isSent ? "auto" : shown.h }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              leaveOpen();
            }
          }}
        >
          {/* Positioning stays on this box; the theme's parchment frame (which sets position: relative) lives inside. */}
          <div
            className={`create-sheet-in relative flex flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl ${isSent ? "" : "h-full"}`}
            style={{
              background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
              border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              color: "var(--t-ink)",
            }}
          >
            {/* The title sits on the same parchment as the note (no separate bar); the writing scrolls below it. */}
              <div
                className={`relative z-[2] flex shrink-0 select-none items-center gap-1 pb-0.5 pl-3.5 pr-1.5 pt-2 ${isSent ? "" : "cursor-move touch-none"}`}
                onPointerDown={isSent ? undefined : (e) => onPanelDown(e, "move")}
                title={isSent ? undefined : "Drag to move"}
              >
                <span className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 ${isAdventure ? "font-display text-[17px]" : "text-base font-bold"}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
                    <path d="M20 3c-6 1-11 6-13 13l-1.5 4.5L10 19c5-2 9-7 10-16z" fill={isAdventure ? "#e9d49a" : "none"} stroke={isAdventure ? "#6b4a12" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M7 16l6-6" stroke={isAdventure ? "#6b4a12" : "currentColor"} strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  <span className="truncate">Feedback</span>
                </span>
                {!isSent && (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={isSaving || !open.body.trim()}
                    title="Submit feedback (Ctrl + Enter)"
                    className="hover-glow h-8 shrink-0 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50"
                    style={{
                      background: isAdventure ? "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)" : "var(--t-accent)",
                      color: isAdventure ? "#2a1c10" : "#fff",
                      border: isAdventure ? "1.5px solid #6b4a12" : undefined,
                    }}
                  >
                    {isSaving ? "Sending…" : "Submit"}
                  </button>
                )}
                {!isSent && (
                  <button type="button" onClick={leaveOpen} aria-label="Put it away for later" title="Put it away — continue later from the feedback button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5" style={{ color: isAdventure ? "#6b4a12" : "var(--t-ink-soft)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M6 10l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                <button type="button" onClick={requestClose} aria-label="Close" title="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5" style={{ color: isAdventure ? "#6b4a12" : "var(--t-ink-soft)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            <div className={`feedback-scroll relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${isSent ? "pb-3" : "pb-3"}`}>

              {isSent && sent ? (
                <Sent kind={sent.kind} xp={sent.xp} isAdventure={isAdventure} onAnother={startNew} />
              ) : (
                <Composer
                  key={open.id}
                  draft={open}
                  isAdventure={isAdventure}
                  compact={mobile}
                  error={error}
                  onChange={update}
                  onSubmit={submit}
                  onOverflow={(px) => setGrow((g) => ({ id: open.id, px: (g?.id === open.id ? g.px : 0) + px }))}
                />
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

        </div>
      )}
      {celebrate && <SentBurst key={celebrate.key} kind={celebrate.kind} xp={celebrate.xp} x={celebrate.x} y={celebrate.y} isAdventure={isAdventure} style={celebrate.style} />}
    </>,
    document.body
  );
}

/**
 * Feedback sent, in the style chosen in Settings: a wax-sealed letter, a
 * paper crane, a shooting star, the toucan carrying it off, or just a word.
 */
export function SentBurst({ kind, xp, x, y, isAdventure, style = "quiet" }: { kind: WhenKind; xp: number; x: number; y: number; isAdventure: boolean; style?: FeedbackStyle }) {
  const where = kind === "future" ? "Saved in your future ideas" : kind === "refill" ? "Saved for when credits refill" : "It goes into the next update";
  const xpTag = xp > 0 && (
    <b className="ml-2 tabular-nums" style={{ color: "#f2d27e" }}>
      +{xp} XP
    </b>
  );
  // The default: a clear, calm success card in the middle of the screen.
  if (style === "quiet")
    return (
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-0 z-[62] flex items-center justify-center p-6">
        <div className="fb-done flex w-[min(300px,100%)] flex-col items-center gap-2 rounded-3xl px-6 pb-5 pt-6 text-center" style={isAdventure ? { background: "linear-gradient(180deg,#f6ecd2,#ead7aa)", border: "2px solid #a88a3f", color: "#2a1c10", boxShadow: "0 18px 40px rgba(0,0,0,.45)" } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", color: "var(--t-ink)", boxShadow: "0 18px 40px rgba(0,0,0,.25)" }}>
          <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden>
            <circle className="fb-done-ring" cx="38" cy="38" r="33" fill="none" stroke={isAdventure ? "#3f6a2c" : "var(--t-accent)"} strokeWidth="5" strokeLinecap="round" />
            <circle className="fb-done-fill" cx="38" cy="38" r="30" fill={isAdventure ? "#4f7d38" : "var(--t-accent)"} />
            <path className="fb-done-check" d="M24 39.5l9.5 9.5L53 29" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={`fb-done-words ${isAdventure ? "font-display text-[21px]" : "text-[18px] font-bold"}`}>Feedback submitted</span>
          <span className="fb-done-sub text-[13.5px]" style={{ color: isAdventure ? "#6b5631" : "var(--t-ink-soft)" }}>
            {where}
            {xp > 0 && (
              <b className="ml-1.5 tabular-nums" style={{ color: isAdventure ? "#3f6a2c" : "var(--t-accent)" }}>
                · +{xp} XP
              </b>
            )}
          </span>
        </div>
      </div>
    );
  // Handed to the Great Toucan Spirit: he takes the letter and powers up.
  if (style === "toucan")
    return (
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-0 z-[62] flex items-center justify-center">
        <div className="fb-spirit relative flex flex-col items-center">
          <span aria-hidden className="fb-spirit-rays absolute left-1/2 top-[64px] h-[260px] w-[260px] rounded-full" />
          <span aria-hidden className="fb-spirit-ring absolute left-1/2 top-[64px] h-[120px] w-[120px] rounded-full" />
          <span aria-hidden className="fb-spirit-ring fb-spirit-ring-2 absolute left-1/2 top-[64px] h-[120px] w-[120px] rounded-full" />
          <span className="fb-spirit-bird relative block">
            <ToucanArt size={120} />
          </span>
          <svg className="fb-spirit-letter absolute left-1/2 top-[150px]" width="52" height="38" viewBox="0 0 52 38" aria-hidden>
            <rect x="2" y="3" width="48" height="32" rx="4" fill="#f6ecd2" stroke="#8a6116" strokeWidth="1.8" />
            <path d="M3 5l23 16L49 5" fill="none" stroke="#8a6116" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="26" cy="21" r="6" fill="#a3281c" />
          </svg>
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} aria-hidden className="fb-spirit-spark" style={{ ["--a" as string]: `${i * 30}deg`, ["--d" as string]: `${80 + (i % 3) * 22}px` }} />
          ))}
          <span className={`fb-spirit-words mt-3 max-w-[300px] rounded-2xl px-4 py-1.5 text-center ${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ background: "rgba(8,26,29,.92)", color: "#e8fff8", border: "1px solid rgba(140,240,220,.6)", boxShadow: "0 0 18px rgba(120,230,210,.35)" }}>
            The Great Toucan Spirit accepts your letter
            {xpTag}
          </span>
        </div>
      </div>
    );
  const words = kind === "future" ? "Saved for the future" : kind === "refill" ? "Saved for when credits refill" : style === "seal" ? "Sealed & sent" : "Off it flies";
  const label = (
    <span className={`fb-words mt-2 whitespace-nowrap rounded-full px-3.5 py-1 ${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ background: "rgba(20,14,6,.88)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.55)" }}>
      {words}
      {xpTag}
    </span>
  );
  if (style === "crane")
    return (
      <div role="status" aria-live="polite" className="pointer-events-none fixed z-[62]" style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}>
        <div className="fb-burst relative flex flex-col items-center">
          <svg className="fb-crane" width="96" height="72" viewBox="0 0 96 72" aria-hidden>
            <path d="M4 50l34-8 10-30 8 30 36-26-30 44-18-2z" fill="#f6ecd2" stroke="#8a6116" strokeWidth="2" strokeLinejoin="round" />
            <path d="M38 42l10 0 8 0M48 12v30" stroke="#8a6116" strokeWidth="1.4" fill="none" />
            <path d="M4 50l-2-6 8 3" fill="#e9d49a" stroke="#8a6116" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          {Array.from({ length: 6 }, (_, i) => <span key={i} aria-hidden className="fb-spark" style={{ ["--a" as string]: `${i * 60 + 15}deg`, ["--d" as string]: `${44 + (i % 2) * 16}px` }} />)}
          {label}
        </div>
      </div>
    );
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed z-[62]" style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}>
      <div className="fb-burst relative flex flex-col items-center">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} aria-hidden className="fb-spark" style={{ ["--a" as string]: `${i * 36}deg`, ["--d" as string]: `${54 + (i % 3) * 14}px` }} />
        ))}
        <svg className="fb-letter" width="84" height="64" viewBox="0 0 84 64" aria-hidden>
          <rect x="3" y="6" width="78" height="52" rx="6" fill="#f6ecd2" stroke="#8a6116" strokeWidth="2" />
          <path d="M5 9l37 26L79 9" fill="none" stroke="#8a6116" strokeWidth="2" strokeLinejoin="round" />
          <g className="fb-seal">
            <circle cx="42" cy="36" r="11" fill="#a3281c" stroke="#5c120b" strokeWidth="1.5" />
            <circle cx="42" cy="36" r="6.5" fill="none" stroke="#e8836f" strokeWidth="1.2" />
            <path d="M38.6 36.4l2.4 2.4 4.6-5" stroke="#ffd9cf" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        </svg>
        {label}
      </div>
    </div>
  );
}

/**
 * What's on screen, in a few words, for the feedback's context: the title of
 * any open window and the headings in view. No picture is taken.
 */
function readContext(): string {
  try {
    const bits: string[] = [];
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((el) => !el.closest("[data-feedback-root]")).pop();
    const dl = dialog?.getAttribute("aria-label") || dialog?.querySelector("h1,h2,h3")?.textContent;
    if (dl) bits.push(`open: ${dl.trim().slice(0, 60)}`);
    const H = window.innerHeight;
    const heads = [...document.querySelectorAll<HTMLElement>("h1, h2, h3")]
      .filter((el) => !el.closest("[data-feedback-root]"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < H && r.width > 0;
      })
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const uniq = [...new Set(heads)].slice(0, 3);
    if (uniq.length) bits.push(`showing: ${uniq.join(", ").slice(0, 120)}`);
    const max = document.documentElement.scrollHeight - H;
    if (max > 200) bits.push(`scrolled ${Math.round((window.scrollY / max) * 100)}%`);
    return bits.join(" · ");
  } catch {
    return "";
  }
}

/**
 * A picture of the page as it is now (without the feedback box), uploaded
 * and returned as a URL. Uses modern-screenshot, loaded on first use.
 * Only taken when asked for (the camera button).
 */
async function captureScreen(): Promise<string | null> {
  try {
    const w = window as unknown as { __domToJpeg?: (el: Element, o: object) => Promise<string> };
    if (!w.__domToJpeg) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.type = "module";
        s.textContent = 'import { domToJpeg } from "https://cdn.jsdelivr.net/npm/modern-screenshot@4/+esm"; window.__domToJpeg = domToJpeg; window.dispatchEvent(new Event("shot-ready"));';
        const t = setTimeout(() => reject(new Error("timeout")), 8000);
        window.addEventListener("shot-ready", () => (clearTimeout(t), resolve()), { once: true });
        document.head.appendChild(s);
      });
    }
    const dataUrl = await w.__domToJpeg!(document.body, {
      quality: 0.8,
      scale: Math.min(1, 1400 / window.innerWidth),
      width: window.innerWidth,
      height: window.innerHeight,
      style: { transform: `translateY(-${window.scrollY}px)` },
      filter: (n: Node) => !(n instanceof Element && n.closest("[data-feedback-root]")),
    });
    const blob = await (await fetch(dataUrl)).blob();
    const fd = new FormData();
    fd.append("file", new File([blob], "screen.jpg", { type: "image/jpeg" }));
    const r = await fetch("/api/feedback/image", { method: "POST", body: fd });
    const j = (await r.json().catch(() => ({ ok: false }))) as { ok: boolean; url?: string };
    return r.ok && j.ok && j.url ? j.url : null;
  } catch {
    return null;
  }
}

/** Scale a screenshot down (max 1600px, JPEG) in the browser so it uploads quickly. */
async function shrinkImage(f: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "screenshot.jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}

/** Where it goes, the XP it earns, and what to change. */
function Composer({
  draft,
  isAdventure,
  compact = false,
  error,
  onChange,
  onSubmit,
  onOverflow,
}: {
  draft: Draft;
  isAdventure: boolean;
  /** Phones: the timing row folds into a small chip. */
  compact?: boolean;
  error: string | null;
  onChange: (patch: Partial<Draft>) => void;
  onSubmit: () => void;
  /** The writing no longer fits: ask for this much more room. */
  onOverflow?: (px: number) => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const xp = draft.xp ?? autoXp(draft.body);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  // Tap an attachment to see it full size.
  const [viewing, setViewing] = useState<string | null>(null);
  async function attach(files: File[]) {
    setAttachError(null);
    setUploading(true);
    const urls: string[] = [];
    for (const f of files.slice(0, 4 - (draft.images ?? []).length)) {
      try {
        const fd = new FormData();
        fd.append("file", await shrinkImage(f));
        const r = await fetch("/api/feedback/image", { method: "POST", body: fd });
        const j = (await r.json().catch(() => ({ ok: false }))) as { ok: boolean; url?: string; error?: string };
        if (!r.ok || !j.ok || !j.url) throw new Error(j.error ?? "Couldn't attach that image.");
        urls.push(j.url);
      } catch (e) {
        setAttachError(e instanceof Error ? e.message : "Couldn't attach that image.");
      }
    }
    setUploading(false);
    if (urls.length) onChange({ images: [...(draft.images ?? []), ...urls] });
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 pb-2 pt-1">
      {!compact && <Segmented
        label="Where it goes"
        isAdventure={isAdventure}
        value={draft.kind}
        onChange={(k) => {
          onChange({ kind: k });
          textRef.current?.focus();
        }}
        options={WHEN.map(([k, label, hint]) => ({ value: k, label, hint }))}
      />}
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
      <div className="relative flex min-h-0 flex-1 flex-col">
      <textarea
        ref={textRef}
        onPaste={(e) => {
          const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
          if (files.length) {
            e.preventDefault();
            void attach(files);
          }
        }}
        data-feedback-text
        autoFocus
        value={draft.body}
        onChange={(e) => {
          onChange({ body: e.target.value });
          const el = e.currentTarget;
          requestAnimationFrame(() => {
            const over = el.scrollHeight - el.clientHeight;
            if (over > 2) onOverflow?.(over + 8);
          });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={draft.kind === "future" ? "An idea for later. It goes in the future ideas log." : "What would make this better?"}
        aria-label="Feedback"
        className="min-h-[72px] flex-1 resize-none rounded-lg border px-3 pt-2 text-[16px] leading-relaxed"
        style={{ borderColor: "var(--t-panel-border)", paddingBottom: 10, paddingRight: 12 }}
      />
      </div>
      {/* Screenshots: paste one into the box, or pick from your device. */}
      {(
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {[...(draft.shot ? [{ url: draft.shot, label: "Screen picture", remove: () => onChange({ shot: null }) }] : []), ...(draft.images ?? []).map((u, i) => ({ url: u, label: (draft.images ?? []).length > 1 ? `Image ${i + 1}` : "Image", remove: () => onChange({ images: (draft.images ?? []).filter((x) => x !== u) }) }))].map((a) => (
          <span key={a.url} className="flex h-7 items-center rounded-full pl-1" style={{ border: "1px solid var(--t-panel-border)", background: "rgba(255,255,255,.55)" }}>
            <button type="button" onClick={() => setViewing(a.url)} className="flex h-6 items-center gap-1 rounded-full px-1.5 text-[12.5px] font-semibold hover:bg-black/[.06]" style={{ color: "var(--t-ink)" }} title="See it full size">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="9" cy="10" r="1.6" fill="currentColor" />
                <path d="M5 17l4.5-4.5 3 3 2.5-2.5L19.5 17" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
              {a.label}
            </button>
            <button type="button" onClick={a.remove} aria-label={`Remove ${a.label.toLowerCase()}`} className="flex h-6 w-6 items-center justify-center rounded-full text-[14px] leading-none hover:bg-black/10" style={{ color: "var(--t-ink-soft)" }}>
              ×
            </button>
          </span>
        ))}
        {uploading && <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>Attaching…</span>}
        {attachError && <span className="text-[12.5px]" style={{ color: "var(--t-warn)" }}>{attachError}</span>}
        <span className="ml-auto flex items-center gap-1">
        {compact && (
          // Phones: when it gets built, as one small chip instead of a whole row.
          <label className="relative flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold" style={{ border: "1px solid var(--t-panel-border)", color: "var(--t-ink)" }} title="When it gets built">
            <span aria-hidden>{draft.kind === "future" ? "✦" : draft.kind === "refill" ? "↻" : "→"}</span>
            {WHEN.find(([k]) => k === draft.kind)?.[1]}
            <span aria-hidden className="text-[10px] opacity-60">▾</span>
            <select aria-label="When it gets built" value={draft.kind} onChange={(e) => onChange({ kind: e.target.value as WhenKind })} className="absolute inset-0 cursor-pointer opacity-0">
              {WHEN.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {!draft.shot && (
          <button
            type="button"
            onClick={async () => {
              setUploading(true);
              const url = await captureScreen();
              setUploading(false);
              if (url) onChange({ shot: url });
              else setAttachError("Couldn't take a picture of this screen.");
            }}
            title="Add a picture of this screen"
            aria-label="Add a picture of this screen"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]"
            style={{ color: "var(--t-ink-soft)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {(draft.images ?? []).length < 4 && (
          <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }} title="Attach an image (or paste one into the box)" aria-label="Attach an image">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
              <circle cx="9" cy="10" r="1.8" fill="currentColor" />
              <path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => e.target.files && void attach([...e.target.files])} />
          </label>
        )}
        </span>
      </div>
      )}
      {error && (
        <p className="m-0 shrink-0 text-sm" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      {viewing &&
        createPortal(
          <div role="dialog" aria-label="Attachment" className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(10,8,14,.82)" }} onClick={() => setViewing(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- attachment, full size */}
            <img src={viewing} alt="Attachment, full size" className="max-h-full max-w-full rounded-lg object-contain" style={{ boxShadow: "0 12px 40px rgba(0,0,0,.6)" }} />
            <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-[22px]" style={{ background: "rgba(255,255,255,.15)", color: "#fff" }}>
              ×
            </button>
          </div>,
          document.body
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
