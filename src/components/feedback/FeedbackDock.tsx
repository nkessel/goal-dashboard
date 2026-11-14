"use client";

import { RecentNotes } from "./RecentNotes";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { keyboardUp } from "@/lib/keyboard-up";
import { loadFx, type FeedbackStyle } from "@/lib/celebration-fx";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { createPortal } from "react-dom";
import { useEscape } from "@/lib/use-escape";
import { noteSaved, subscribeUploads, uploadFor, uploadsNow, uploadsServer } from "@/lib/feedback-uploads";
import { CloseIcon } from "@/components/ui/Icons";

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

type Draft = { id: string; body: string; kind: WhenKind; xp?: number; xpPicked?: boolean; images?: string[]; page?: string; context?: string; shot?: string | null; updatedAt?: number; deleted?: boolean };

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
/** A draft worth keeping: words, or a picture attached (a screenshot alone still counts). */
const hasContent = (d: Draft) => !!d.body.trim() || !!d.shot || (d.images ?? []).length > 0;
/** What to keep: drafts with words or pictures in them, and recent deletions (so another tab or device doesn't bring them back). */
const keepable = (ds: Draft[]) =>
  ds
    // A draft emptied out counts as deleted, so an older copy elsewhere can't bring it back.
    .map((d) => (!d.deleted && !hasContent(d) ? { ...d, deleted: true } : d))
    .filter((d) => !d.deleted || (d.updatedAt ?? 0) > Date.now() - 86_400_000);
/** A place and size on screen, in px. */
type Rect = { x: number; y: number; w: number; h: number };
/** Where you put the box: its place, its size if you resized it (`sized`), and the screen width it was set on. */
type SavedBox = Rect & { sized: boolean; sw: number };
/** The round button's top-left corner, in px from the window's top-left. */
type Pos = { x: number; y: number };
/**
 * The screen as the box sees it: its width and full height (keyboard down), and, while the on-screen
 * keyboard is up, the strip left above it (`top` is how far the browser has panned the visible part).
 * `lastStrip` is the strip's height the last time a keyboard was seen at this width.
 */
type View = { w: number; h: number; top: number; strip: number | null; lastStrip: number | null };
/** The part of the screen the box must sit wholly inside. */
type Area = { top: number; h: number };

const DRAFTS_KEY = "feedback-drafts";
const OPEN_KEY = "feedback-open";
const LEGACY_DRAFT_KEY = "feedback-draft";
const BUTTON_KEY = "feedback-button-pos";
/** Where you put the button while the welcome screen is up (owner, Nov 10: it snapped back to the corner). */
const WELCOME_BUTTON_KEY = "feedback-button-pos-welcome";
// Its own spot while a popup or editor is open on a phone (so it never sits on their Save).
const POPUP_BUTTON_KEY = "feedback-button-pos-popup";
/** The box's one saved place and size. (Older builds kept three: these are cleared on load.) */
const BOX_KEY = "feedback-box-v2";
const OLD_BOX_KEYS = ["feedback-panel", "feedback-panel-phone-y"];
/** How much of the screen the keyboard left the last time it was up, to open the box clear of it. */
const KB_KEY = "feedback-kb-strip";

const BTN = 46;
/** The box can be made thin and short; its content then scrolls. */
const MIN_W = 220;
const MIN_H = 150;
/** Kept between the box and the edge of the screen (or the keyboard). */
const EDGE = 8;

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

/** Most XP one note can earn, however long it runs. */
const XP_MAX = 12;
/** Unless you choose: 1 XP per paragraph. */
function paragraphs(body: string) {
  return body.split(/\n+/).filter((p) => p.trim().length > 0).length;
}
/** 1 XP per paragraph, and it keeps growing past 3 (up to XP_MAX). */
function autoXp(body: string) {
  return Math.max(1, Math.min(XP_MAX, paragraphs(body)));
}
/** The XP a note earns: your pick if you made one on purpose, otherwise its paragraphs. */
const xpOf = (d: { body: string; xp?: number; xpPicked?: boolean }) => (d.xpPicked && d.xp ? d.xp : autoXp(d.body));

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

const coarsePointer = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/**
 * The screen, read once things have settled: a turn of the phone or a resized window at the next
 * frame, the on-screen keyboard once it has stopped sliding (never frame by frame: iPhone pans the
 * screen while the keyboard moves, and a box that chased it jumped about).
 */
function useView(): View | null {
  const [view, setView] = useState<View | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    let raf = 0;
    let quiet: number | undefined;
    const read = () => {
      raf = 0;
      setView((prev) => {
        const w = window.innerWidth;
        const up = !!vv && vv.scale <= 1.05 && keyboardUp();
        // Chrome on iPhone shrinks the page itself under the keyboard: the full height is the one from before it.
        // On touch screens the height is the tallest seen at this width: Safari's bars coming and going change
        // innerHeight by 50–80px as the page scrolls, and that mustn't resize the box or move the button.
        const same = prev && prev.w === w ? prev.h : 0;
        const h = up && same ? same : coarsePointer() ? Math.max(window.innerHeight, same) : window.innerHeight;
        const strip = up && vv ? Math.round(vv.height) : null;
        const top = up && vv ? Math.max(0, Math.round(vv.offsetTop)) : 0;
        let lastStrip = prev && prev.w === w ? prev.lastStrip : null;
        if (strip) {
          // Kept only when it really changed: the predictive bar or the emoji keys shift it a little between openings.
          if (lastStrip == null || Math.abs(strip - lastStrip) > 24) {
            writeJson(KB_KEY, { w, h: strip });
            lastStrip = strip;
          }
        } else if (lastStrip == null) {
          const kept = readJson<{ w: number; h: number }>(KB_KEY);
          if (kept && kept.w === w && typeof kept.h === "number") lastStrip = kept.h;
        }
        return prev && prev.w === w && prev.h === h && prev.top === top && prev.strip === strip && prev.lastStrip === lastStrip ? prev : { w, h, top, strip, lastStrip };
      });
    };
    const soon = () => {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(() => {
        if (!raf) raf = requestAnimationFrame(read);
      }, 140);
    };
    raf = requestAnimationFrame(read);
    vv?.addEventListener("resize", soon);
    vv?.addEventListener("scroll", soon);
    window.addEventListener("resize", soon);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(quiet);
      vv?.removeEventListener("resize", soon);
      vv?.removeEventListener("scroll", soon);
      window.removeEventListener("resize", soon);
    };
  }, []);
  return view;
}

/**
 * The one rule for where the box is: the place and size you want, held wholly inside `area`
 * (the whole screen, or the strip above the keyboard). Its top-left corner is what stays put:
 * the box only gets smaller when it can't fit, and only moves when it would stick out.
 */
function placeBox(want: Rect, view: View, area: Area): Rect {
  const w = clamp(want.w, Math.min(MIN_W, view.w - EDGE * 2), view.w - EDGE * 2);
  const h = clamp(want.h, Math.min(MIN_H, area.h - EDGE * 2), Math.max(MIN_H / 2, area.h - EDGE * 2));
  return {
    w,
    h,
    x: clamp(want.x, EDGE, Math.max(EDGE, view.w - w - EDGE)),
    y: area.top + clamp(want.y, EDGE, Math.max(EDGE, area.h - h - EDGE)),
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
 * where you put it, always the same size, above every popup) opens a feedback
 * box that doesn't block the app, so you can keep using the very thing you're
 * writing about.
 *
 * Where the box is, in one place (`placeBox`): the spot and size you gave it
 * (`box`, else a default), held wholly inside the screen, or inside the strip
 * above the on-screen keyboard. On a touch screen it opens already inside that
 * strip (the keyboard is on its way), so nothing moves when the keyboard
 * arrives or leaves. Drag its top to move it; drag its bottom edge or bottom
 * corner to resize it (the top stays where it is). Minimize a draft to start
 * another; with drafts waiting, the button asks whether to continue one or
 * start fresh. Shortcut: F (when not typing).
 */
/** Whether the welcome screen is up (html[data-welcome-open]). */
function subscribeWelcome(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-welcome-open"] });
  return () => mo.disconnect();
}
const welcomeOpenNow = () => document.documentElement.hasAttribute("data-welcome-open");
/** Whether a popup, sheet or editor has the page (html.scroll-locked). */
function subscribePopup(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}
const popupOpenNow = () => document.documentElement.classList.contains("scroll-locked");

export function FeedbackDock({ theme = "calm" }: { theme?: "calm" | "adventure" }) {
  // While the welcome screen is up the button waits in the sky at the top right, off the card's controls
  // (its own spot comes back on the other screens; owner's recordings, Nov 2).
  const welcomeUp = useSyncExternalStore(subscribeWelcome, welcomeOpenNow, () => false);
  // Over a popup or editor on a phone it keeps to the right edge, below the middle (always there; clear of the
  // Today calendar's edge tab at 38–55% and of editors' footers).
  const popupUp = useSyncExternalStore(subscribePopup, popupOpenNow, () => false);
  const isAdventure = theme === "adventure";
  const vp = useView();
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // Your latest sent notes, to read or change, in place of the writing box.
  const [recentOpen, setRecentOpen] = useState(false);
  // The past-notes view belongs to one opening: the next one starts on the writing box.
  const [recentFor, setRecentFor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // The little celebration after Submit: it plays and fades by itself.
  const [celebrate, setCelebrate] = useState<{ key: number; kind: WhenKind; xp: number; x: number; y: number; style: FeedbackStyle } | null>(null);
  useEffect(() => {
    if (!celebrate) return;
    const fx = loadFx();
    const pace = fx.pace ?? 1;
    const hold = fx.feedbackHold ?? 2.2;
    if (celebrate.style === "quiet" && hold === 0) return; // stays until closed
    const t = setTimeout(() => setCelebrate(null), celebrate.style === "quiet" ? hold * 1000 + 50 : (celebrate.style === "toucan" ? 2900 : 2600) * pace);
    return () => clearTimeout(t);
  }, [celebrate]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragPos, setDragPos] = useState<Pos | null>(null);
  const [welcomePos, setWelcomePos] = useState<Pos | null>(null);
  const [popupPos, setPopupPos] = useState<Pos | null>(null);
  // Where you put the box (and its size, if you resized it). The one source of its place.
  const [box, setBox] = useState<SavedBox | null>(null);
  // This opening of the box: where the button was (the default place hangs from it), and whether the
  // box keeps to the strip above the keyboard (touch screens, from the moment its writing has focus).
  const [session, setSession] = useState<{ id: string; anchor: Pos; hold: boolean } | null>(null);
  // While a finger or the mouse is moving or resizing the box, it follows at once (no glide).
  const [dragging, setDragging] = useState(false);
  // Extra height the writing has asked for (per note).
  const [grow, setGrow] = useState<{ id: string; px: number } | null>(null);
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
    // The note that was open when the page went away (iPhone's photo picker can reload the page): open it again.
    let reopen: { id: string; page?: string; context?: string; at: number } | null = null;
    try {
      reopen = JSON.parse(window.sessionStorage.getItem(OPEN_KEY) ?? "null");
    } catch {
      /* storage unavailable */
    }
    if (reopen && Date.now() - reopen.at < 20 * 60_000) {
      if (!saved.some((d) => d.id === reopen.id && !d.deleted)) saved.push({ id: reopen.id, body: "", kind: "feedback", page: reopen.page, context: reopen.context, shot: null, updatedAt: Date.now() });
      setOpenId(reopen.id);
    }
    setDrafts(mergeDrafts([], saved));
    // Drafts kept on your account (from another tab or device) join in.
    fetch("/api/feedback/drafts")
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((j: { drafts?: Draft[] }) => setDrafts((ds) => mergeDrafts(ds, j.drafts ?? [])))
      .catch(() => {});
    setPos(readJson<Pos>(BUTTON_KEY));
    setWelcomePos(readJson<Pos>(WELCOME_BUTTON_KEY));
    setPopupPos(readJson<Pos>(POPUP_BUTTON_KEY));
    const kept = readJson<SavedBox>(BOX_KEY);
    setBox(kept && [kept.x, kept.y, kept.w, kept.h, kept.sw].every((n) => typeof n === "number" && Number.isFinite(n)) ? { ...kept, sized: !!kept.sized } : null);
    for (const k of OLD_BOX_KEYS) writeJson(k, null);
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

  const open = drafts.find((d) => d.id === openId && !d.deleted) ?? null;
  if (recentOpen && recentFor !== openId) setRecentOpen(false);
  // Remember which note is open for this tab, so a reload (the photo picker on iPhone) brings it back.
  useEffect(() => {
    if (!loaded) return;
    try {
      if (open && !open.deleted) window.sessionStorage.setItem(OPEN_KEY, JSON.stringify({ id: open.id, page: open.page, context: open.context, at: Date.now() }));
      else window.sessionStorage.removeItem(OPEN_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [open, loaded]);
  // The note being sent isn't "waiting": it showed as a red "1" on the button for a moment after Submit (owner, Nov 5).
  const [sendingId, setSendingId] = useState<string | null>(null);
  const waiting = drafts.filter((d) => d.id !== openId && d.id !== sendingId && !d.deleted && hasContent(d));

  /** Leave the open draft: empty ones simply go away. */
  const leaveOpen = useCallback(() => {
    setConfirmDiscard(false);
    setError(null);
    setDrafts((ds) => ds.filter((d) => d.id !== openId || hasContent(d)));
    setOpenId(null);
  }, [openId]);

  const startNew = useCallback(() => {
    // The context, in words: the page, any open window and what's in view.
    const d: Draft = { id: newId(), body: "", kind: "feedback", page: window.location.pathname + window.location.search, context: [readContext(), deviceLabel() && `on a ${deviceLabel()}`].filter(Boolean).join(" · "), shot: null, updatedAt: Date.now() };
    setConfirmDiscard(false);
    setChoosing(false);
    setError(null);
    setDrafts((ds) => [...ds.filter((x) => x.id !== openId || hasContent(x)), d]);
    setOpenId(d.id);
  }, [openId]);

  /** The button (or F): with drafts waiting, ask; otherwise start one. */
  const begin = useCallback(() => {
    if (openId) {
      document.querySelector<HTMLTextAreaElement>("[data-feedback-text]")?.focus();
      return;
    }
    // Only drafts still waiting (not sent or thrown away) make it ask.
    const hasWaiting = drafts.some((d) => !d.deleted && hasContent(d));
    if (hasWaiting) setChoosing((v) => !v);
    else startNew();
  }, [openId, drafts, startNew]);

  function restore(id: string) {
    setConfirmDiscard(false);
    setChoosing(false);
    setError(null);
    setDrafts((ds) => ds.filter((d) => d.id !== openId || hasContent(d)));
    setOpenId(id);
  }

  function discard() {
    setConfirmDiscard(false);
    setError(null);
    setDrafts((ds) => ds.map((d) => (d.id === openId ? { ...d, deleted: true, updatedAt: Date.now() } : d)));
    setOpenId(null);
  }

  function requestClose() {
    if (open && hasContent(open)) setConfirmDiscard(true);
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
    const xp = xpOf(d);
    setCelebrate({ key: Date.now(), kind: d.kind, xp, x: shown.x + shown.w / 2, y: shown.y + Math.min(shown.h, 260) / 2, style: loadFx().feedbackStyle ?? "seal" });
    setOpenId(null);
    setSendingId(d.id);
    startSaving(async () => {
      try {
        // Let the "submitted" card draw in smoothly first: packing up the note and its
        // pictures (and saving the drafts) is heavy work that made the start stutter on phones.
        await new Promise((r) => setTimeout(r, 700));
        setDrafts((ds) => ds.map((x) => (x.id === d.id ? { ...x, deleted: true, updatedAt: Date.now() } : x)));
        const r = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: d.body, kind: d.kind, xp: xpOf(d), images: [...(d.shot ? [d.shot] : []), ...(d.images ?? [])], page: d.page, context: d.context }),
        });
        const res = (await r.json().catch(() => ({ ok: false, error: "Couldn't send it." }))) as { ok: boolean; id?: string; xpAwarded?: number; error?: string };
        if (!r.ok || !res.ok) throw new Error(r.status === 401 || r.status === 403 ? "You've been signed out — sign in again to send (your note is saved)." : (res.error ?? "Couldn't send it."));
        // Pictures still on their way join the saved note when they land.
        if (res.id) noteSaved(d.id, res.id);
        setDrafts((ds) => ds.map((x) => (x.id === d.id ? { ...x, body: "", deleted: true, updatedAt: Date.now() } : x)));
      } catch (e) {
        // It didn't go: bring the note back, just as it was.
        setCelebrate(null);
        setSendingId(null);
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

  // Escape minimizes the feedback box first, before any popup or menu, even one opened after it.
  useEscape(leaveOpen, !!openId, true);
  // Touch screens: the moment the box's writing has focus the keyboard is on its way, so the box
  // keeps to the strip above it from then on (it glides there before the keyboard lands).
  useEffect(() => {
    if (!openId) return;
    const on = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.closest("[data-feedback-box]") || !coarsePointer() || window.innerWidth >= 640) return;
      if (!(t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== "file") || t.isContentEditable)) return;
      setSession((s) => (s && !s.hold ? { ...s, hold: true } : s));
    };
    document.addEventListener("focusin", on);
    return () => document.removeEventListener("focusin", on);
  }, [openId]);
  if (!loaded || !vp) return null;

  // ---- The round button: tap to start (or continue) feedback, drag to put it anywhere.
  const defaultPos: Pos = { x: vp.w - BTN - 12, y: vp.h - BTN - 92 };
  const placeBtn = (p: Pos): Pos => ({ x: clamp(p.x, 6, vp.w - BTN - 6), y: clamp(p.y, 6, vp.h - BTN - 6) });
  const overPopup = popupUp && !welcomeUp && vp.w < 640 && !openId;
  const btnPos = welcomeUp && !dragPos ? placeBtn(welcomePos ?? { x: vp.w - BTN - 10, y: 10 }) : overPopup && !dragPos ? placeBtn(popupPos ?? { x: vp.w - BTN - 4, y: Math.round(vp.h * 0.62) }) : placeBtn(dragPos ?? pos ?? defaultPos);

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
        setDragPos(null);
        // The welcome screen keeps its own spot, so the other screens' spot isn't moved by it.
        if (welcomeOpenNow()) {
          setWelcomePos(last);
          writeJson(WELCOME_BUTTON_KEY, last);
          return;
        }
        if (popupOpenNow() && window.innerWidth < 640) {
          setPopupPos(last);
          writeJson(POPUP_BUTTON_KEY, last);
          return;
        }
        setPos(last);
        writeJson(BUTTON_KEY, last);
      },
    });
  }

  // ---- The box. One place decides where it is: `placeBox(want, vp, area)`.
  if (open && session?.id !== open.id) setSession({ id: open.id, anchor: btnPos, hold: coarsePointer() && vp.w < 640 });
  else if (!open && session) setSession(null);
  const sess = open && session?.id === open.id ? session : null;
  const phone = vp.w < 640;
  // The strip above the keyboard: as measured while it's up; before it arrives (and after it leaves), where it was last time.
  const guess = vp.lastStrip && vp.lastStrip > 200 && vp.lastStrip < vp.h - 120 ? vp.lastStrip : Math.round(vp.h * 0.54);
  const area: Area = vp.strip != null ? { top: vp.top, h: vp.strip } : sess?.hold ? { top: 0, h: guess } : { top: 0, h: vp.h };
  const growBy = grow && open && grow.id === open.id ? grow.px : 0;
  // A place set on another size of screen (a phone turned, another device's copy) isn't used.
  const mine = box && (phone ? box.sw === vp.w : box.sw >= 640) ? box : null;
  const anchor = sess?.anchor ?? btnPos;
  // The default: a comfortable size that grows only to fit an added picture; on a phone across the
  // top of the screen, elsewhere just above the button.
  const defW = phone ? vp.w - EDGE * 2 : Math.min(380, vp.w - 40);
  const defH = phone ? Math.min(Math.round(clamp(vp.h * 0.4, 220, 300)) + growBy, Math.round(vp.h * 0.62)) : Math.min(Math.min(270, vp.h - 170) + growBy, vp.h - 120);
  const want: Rect = {
    w: mine?.sized ? mine.w : defW,
    h: mine?.sized ? mine.h : defH,
    x: mine ? mine.x : phone ? EDGE : anchor.x + BTN - defW,
    y: mine ? mine.y : phone ? 56 : Math.max(60, anchor.y - 12 - defH),
  };
  const shown = placeBox(want, vp, area);

  function onPanelDown(e: React.PointerEvent<HTMLElement>, kind: "move" | "resize" | "height") {
    if (kind === "move" && (e.target as HTMLElement).closest("button")) return;
    if (kind !== "move") e.preventDefault();
    const start = shown;
    const view = vp!;
    // With the keyboard down the box is free of the strip above it again; with it up, it stays in the strip.
    const free = view.strip == null;
    const within: Area = free ? { top: 0, h: view.h } : area;
    let sized = !!mine?.sized;
    let last: Rect = { ...start, y: start.y - within.top };
    pressOrDrag(e, {
      threshold: kind === "move" ? 4 : 0,
      onMove: (dx, dy) => {
        if (kind === "move") {
          last = { ...last, x: clamp(start.x + dx, EDGE, Math.max(EDGE, view.w - start.w - EDGE)), y: clamp(start.y - within.top + dy, EDGE, Math.max(EDGE, within.h - start.h - EDGE)) };
        } else {
          // The top-left corner stays where it is: only the right and bottom edges follow.
          sized = true;
          last = {
            ...last,
            w: kind === "height" ? start.w : clamp(start.w + dx, Math.min(MIN_W, start.w), Math.max(Math.min(MIN_W, start.w), view.w - EDGE - start.x)),
            h: clamp(start.h + dy, Math.min(MIN_H, start.h), Math.max(Math.min(MIN_H, start.h), within.top + within.h - EDGE - start.y)),
          };
        }
        setDragging(true);
        if (free) setSession((s) => (s && s.hold ? { ...s, hold: false } : s));
        setBox({ ...last, sized, sw: view.w });
      },
      onEnd: (moved) => {
        setDragging(false);
        if (moved) writeJson(BOX_KEY, { ...last, sized, sw: view.w });
      },
    });
  }


  const coin = isAdventure
    ? {
        background: "radial-gradient(circle at 34% 28%, #fbe7a6, #e0b75a 48%, #a9802c 100%)",
        boxShadow: "0 0 0 1.5px #2e2410, inset 0 1.5px 0 rgba(255,250,225,.65), inset 0 -3px 6px rgba(90,60,12,.35), 0 4px 10px rgba(0,0,0,.45)",
      }
    : { background: "var(--t-card)", boxShadow: "0 0 0 1px var(--t-card-border), 0 4px 12px rgba(0,0,0,.2)" };

  const chooserAbove = btnPos.y > vp.h / 2;
  const chooserRight = btnPos.x > vp.w / 2;

  return createPortal(
    <>
      <UploadBar />
      {/* Always there, always the same size, above every popup, sheet and editor (owner, Nov 12). */}
      <button
        type="button"
        data-feedback-hide
        data-feedback-root
        data-feedback-btn
        data-feedback-open={openId ? "" : undefined}
        onPointerDown={onBtnDown}
        onClick={() => {
          if (justDragged.current) return;
          if (openId) leaveOpen();
          else begin();
        }}
        aria-label={openId ? "Minimize feedback" : "Feedback (F)"}
        title={openId ? "Minimize feedback" : "Feedback (F) — drag to move"}
        aria-expanded={!!openId || choosing}
        className={`fixed z-[130] flex touch-none select-none items-center justify-center rounded-full ${dragPos ? "cursor-grabbing" : "cursor-pointer"}`}
        style={{ left: btnPos.x, top: btnPos.y, width: BTN, height: BTN, transition: dragPos ? undefined : "left 200ms ease, top 200ms ease", ...coin }}
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
          data-kb-self
          className="card-pop-in parchment fixed z-[131] flex w-[min(300px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{
            ...(chooserRight ? { right: vp.w - btnPos.x - BTN } : { left: btnPos.x }),
            ...(chooserAbove ? { bottom: vp.h - btnPos.y + 8 } : { top: btnPos.y + BTN + 8 }),
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
              <span className="min-w-0 flex-1 truncate">{d.body.trim() || "📷 A picture, no words yet"}</span>
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
          data-feedback-box
          data-kb-self
          // A fading copy showed as a blank box (textareas don't copy their words).
          data-no-ghost
          className="fixed z-[131]"
          // The one place its position and size are set. It glides to a new place (the strip above the
          // keyboard, a turned screen); under a finger it follows at once.
          style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h, transition: dragging ? "none" : "left 160ms ease-out, top 160ms ease-out, width 160ms ease-out, height 160ms ease-out" }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              leaveOpen();
            }
          }}
        >
          {/* Positioning stays on the box above; the theme's parchment frame (which sets position: relative) lives inside.
              Its entrance plays once, when the box is first put on screen. */}
          <div
            className="create-sheet-in relative flex h-full flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl"
            style={{
              background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
              border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              color: "var(--t-ink)",
            }}
          >
            {/* The title sits on the same parchment as the note (no separate bar); the writing scrolls below it. */}
            <div className="relative z-[2] flex shrink-0 cursor-move touch-none select-none items-center gap-1 pb-0.5 pl-3.5 pr-1.5 pt-2" onPointerDown={(e) => onPanelDown(e, "move")} title="Drag to move">
              <span className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 ${isAdventure ? "font-display text-[17px]" : "text-base font-bold"}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
                  <path d="M20 3c-6 1-11 6-13 13l-1.5 4.5L10 19c5-2 9-7 10-16z" fill={isAdventure ? "#e9d49a" : "none"} stroke={isAdventure ? "#6b4a12" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M7 16l6-6" stroke={isAdventure ? "#6b4a12" : "currentColor"} strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <span className="truncate">Feedback</span>
              </span>
              <button
                type="button"
                onClick={() => (setRecentFor(openId), setRecentOpen((o) => !o))}
                aria-pressed={recentOpen}
                aria-label="Your recent notes"
                title="Your recent notes: read or edit them"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
                style={{ color: isAdventure ? "#6b4a12" : "var(--t-ink-soft)", background: recentOpen ? "rgba(217,180,95,.3)" : undefined }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={leaveOpen}
                aria-label="Minimize"
                title="Minimize — continue later from the feedback button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
                style={{ color: isAdventure ? "#6b4a12" : "var(--t-ink-soft)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 18h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                </svg>
              </button>
              <button type="button" onClick={requestClose} aria-label="Close" title="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5" style={{ color: isAdventure ? "#6b4a12" : "var(--t-ink-soft)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="feedback-scroll relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-2">
              {recentOpen ? (
                <RecentNotes isAdventure={isAdventure} onBack={() => setRecentOpen(false)} />
              ) : (
                <Composer
                  key={open.id}
                  draft={open}
                  isAdventure={isAdventure}
                  compact={phone || shown.w < 360}
                  saving={isSaving}
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

            {/* Resize from the bottom: the edge for its height, the corner for both. The top stays put. */}
            <span role="presentation" data-feedback-resize="height" title="Drag to make it taller or shorter" className="absolute bottom-0 left-3 right-7 z-[3] flex h-2.5 cursor-ns-resize touch-none items-end justify-center pb-[3px] before:absolute before:inset-x-0 before:-top-3 before:bottom-0 before:content-['']" onPointerDown={(e) => onPanelDown(e, "height")}>
              <span aria-hidden className="block h-[3px] w-9 rounded-full" style={{ background: "var(--t-ink-soft)", opacity: 0.35 }} />
            </span>
            <span role="presentation" data-feedback-resize="corner" title="Drag to resize" className="absolute bottom-0 right-0 z-[3] flex h-7 w-7 cursor-nwse-resize touch-none items-end justify-end p-1.5" onPointerDown={(e) => onPanelDown(e, "resize")}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ color: "var(--t-ink-soft)", opacity: 0.7 }}>
                <path d="M11 3L3 11M11 7L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          </div>
        </div>
      )}
      {celebrate && <SentBurst key={celebrate.key} kind={celebrate.kind} xp={celebrate.xp} x={celebrate.x} y={celebrate.y} isAdventure={isAdventure} style={celebrate.style} onClose={() => setCelebrate(null)} />}
    </>,
    document.body
  );
}

/**
 * Feedback sent, in the style chosen in Settings: a wax-sealed letter, a
 * paper crane, a shooting star, the toucan carrying it off, or just a word.
 */
const paceNow = () => (typeof window === "undefined" ? 1 : (loadFx().pace ?? 1));

export function SentBurst({ kind, xp, x, y, isAdventure, style = "quiet", onClose }: { kind: WhenKind; xp: number; x: number; y: number; isAdventure: boolean; style?: FeedbackStyle; onClose?: () => void }) {
  const closeBtn = (dark: boolean) =>
    onClose && (
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="pointer-events-auto absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[18px] leading-none hover:bg-black/10"
        style={{ color: dark ? "#e8fff8" : isAdventure ? "#6b5631" : "var(--t-ink-soft)" }}
      >
        <CloseIcon size={11} />
      </button>
    );
  const where = kind === "future" ? "Saved in your future ideas" : kind === "refill" ? "Saved for when credits refill" : "It goes into the next update";
  const xpTag = xp > 0 && (
    <b className="ml-2 tabular-nums" style={{ color: "#f2d27e" }}>
      +{xp} XP
    </b>
  );
  // The default: a clear, calm success card in the middle of the screen.
  if (style === "quiet") {
    const hold = typeof window === "undefined" ? 2.2 : (loadFx().feedbackHold ?? 2.2);
    return (
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-0 z-[132] flex items-center justify-center p-6" style={{ ["--fb-pace" as string]: String(paceNow()), ["--fb-hold" as string]: `${hold || 2.2}s` }}>
        {/* A tap on the card closes it at once (owner, Nov 5). */}
        <div onClick={onClose} className={`${hold === 0 ? "fb-done fb-done-stay" : "fb-done"} pointer-events-auto cursor-pointer relative flex w-[min(300px,100%)] flex-col items-center gap-2 rounded-3xl px-6 pb-5 pt-6 text-center`} style={isAdventure ? { background: "linear-gradient(180deg,#f6ecd2,#ead7aa)", border: "2px solid #a88a3f", color: "#2a1c10", boxShadow: "0 18px 40px rgba(0,0,0,.45)" } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", color: "var(--t-ink)", boxShadow: "0 18px 40px rgba(0,0,0,.25)" }}>
          {closeBtn(false)}
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
  }
  // Handed to the Great Toucan Spirit: he takes the letter and powers up.
  if (style === "toucan")
    return (
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-0 z-[132] flex items-center justify-center" style={{ ["--fb-pace" as string]: String(paceNow()) }}>
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
          <span className={`fb-spirit-words relative mt-3 max-w-[300px] rounded-2xl py-1.5 pl-4 pr-9 text-center ${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ background: "rgba(8,26,29,.92)", color: "#e8fff8", border: "1px solid rgba(140,240,220,.6)", boxShadow: "0 0 18px rgba(120,230,210,.35)" }}>
            The Great Toucan Spirit accepts your letter
            {xpTag}
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close" className="pointer-events-auto absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[17px] leading-none hover:bg-white/10" style={{ color: "#e8fff8" }}>
                <CloseIcon size={10} />
              </button>
            )}
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
      <div role="status" aria-live="polite" className="pointer-events-none fixed z-[132]" style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}>
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
    <div role="status" aria-live="polite" className="pointer-events-none fixed z-[132]" style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}>
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
    // Tells the server which screen the note is about (src/lib/feedback-screens.ts).
    if (document.documentElement.hasAttribute("data-welcome-open")) bits.push("welcome screen");
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((el) => !el.closest("[data-feedback-root]")).pop();
    const dl = dialog?.getAttribute("aria-label") || dialog?.querySelector("h1,h2,h3")?.textContent;
    if (dl) bits.push(`open: ${dl.trim().slice(0, 60)}`);
    const H = window.innerHeight;
    // Headings, labelled sections and named cards (boards, quests) in view.
    const heads = [...document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, [role=heading], section[aria-label], [data-fb-name]")]
      .filter((el) => !el.closest("[data-feedback-root]"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < H && r.width > 0;
      })
      .map((el) => (el.getAttribute("data-fb-name") || (el.tagName === "SECTION" ? el.getAttribute("aria-label") : el.textContent) || "").replace(/\s+/g, " ").trim().slice(0, 50))
      .filter(Boolean);
    const uniq = [...new Set(heads)].slice(0, 5);
    if (uniq.length) bits.push(`showing: ${uniq.join(", ").slice(0, 200)}`);
    const max = document.documentElement.scrollHeight - H;
    if (max > 200) bits.push(`scrolled ${Math.round((window.scrollY / max) * 100)}%`);
    return bits.join(" · ");
  } catch {
    return "";
  }
}

/**
 * A picture of the page as it is now (without the feedback box), as a file
 * to upload. Uses modern-screenshot, loaded on first use.
 * Only taken when asked for (the camera button).
 */
async function captureScreen(): Promise<File | null> {
  try {
    // Bundled with the app (it was fetched from a CDN at the moment of the tap, which failed for the owner, Nov 13).
    const { domToJpeg } = await import("modern-screenshot");
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sy = window.scrollY;
    const dataUrl = await domToJpeg(document.body, {
      quality: 0.8,
      scale: Math.min(window.devicePixelRatio || 1, 1600 / vw, 1.5),
      width: vw,
      height: vh,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#1a2418",
      style: { transform: `translateY(-${sy}px)` },
      // A picture that can't be fetched (another site's, a failed portrait) is left blank instead of failing the shot.
      fetch: { bypassingCache: false, placeholderImage: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" },
      timeout: 6000,
      // Only what's on screen is drawn: skipping everything scrolled out of view makes the picture several times quicker.
      filter: (n: Node) => {
        if (!(n instanceof Element)) return true;
        if (n.closest("[data-feedback-root]")) return false;
        const r = n.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return true;
        return !(r.bottom < -40 || r.top > vh + 40 || r.right < -40 || r.left > vw + 40) || getComputedStyle(n).position === "fixed";
      },
    });
    const blob = await (await fetch(dataUrl)).blob();
    if (!blob.size) return null;
    return new File([blob], "screen.jpg", { type: "image/jpeg" });
  } catch (e) {
    console.warn("[feedback] screen picture failed", e);
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
  saving = false,
  error,
  onChange,
  onSubmit,
  onOverflow,
}: {
  draft: Draft;
  isAdventure: boolean;
  /** Phones: the timing row folds into a small chip. */
  compact?: boolean;
  saving?: boolean;
  error: string | null;
  onChange: (patch: Partial<Draft>) => void;
  onSubmit: () => void;
  /** The writing no longer fits: ask for this much more room. */
  onOverflow?: (px: number) => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const xp = xpOf(draft);
  const xpBox = useRef<HTMLDivElement>(null);
  const submitBtn = useRef<HTMLButtonElement>(null);
  // Past three paragraphs, the note's own count joins the choices.
  const long = Math.min(XP_MAX, paragraphs(draft.body));
  const rootRef = useRef<HTMLDivElement>(null);
  // A picture added: the box grows to fit its thumbnail rather than squeezing the writing.
  const shots = (draft.shot ? 1 : 0) + (draft.images ?? []).length;
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !shots) return;
    const raf = requestAnimationFrame(() => {
      const over = el.scrollHeight - el.clientHeight;
      if (over > 2) onOverflow?.(over + 6);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots]);
  const [attachError, setAttachError] = useState<string | null>(null);
  // Sending never waits for pictures: they keep uploading in the background and join the note.
  const submit = onSubmit;
  // Tap an attachment to see it full size.
  const [viewing, setViewing] = useState<string | null>(null);
  // Pictures on their way: shown at once from the device (owner, Nov 3: "no lag: type straight after adding a
  // screenshot, screenshots don't wait"), swapped for the uploaded copy when it lands. Writing never waits for them.
  const [pending, setPending] = useState<{ key: string; url: string | null }[]>([]);
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  });
  const addUrl = (url: string, asShot: boolean) => {
    const d = latest.current;
    onChange(asShot && !d.shot ? { shot: url } : { images: [...(d.images ?? []), url] });
  };
  function attach(files: File[]) {
    setAttachError(null);
    for (const f of files.slice(0, 4 - (draft.images ?? []).length)) {
      const key = `p${Math.random().toString(36).slice(2, 8)}`;
      setPending((p) => [...p, { key, url: URL.createObjectURL(f) }]);
      void uploadFor(draft.id, () => shrinkImage(f)).then((u) => {
        setPending((p) => p.filter((x) => x.key !== key));
        if (u) addUrl(u, false);
        else setAttachError("A picture is still trying to send; see the bar at the bottom right.");
      });
    }
    textRef.current?.focus();
  }
  function snapScreen() {
    setAttachError(null);
    const key = `s${Math.random().toString(36).slice(2, 8)}`;
    setPending((p) => [...p, { key, url: null }]);
    textRef.current?.focus();
    // After the next paint, so the tap and the cursor answer first.
    setTimeout(async () => {
      const shot = await captureScreen();
      if (!shot) {
        setPending((p) => p.filter((x) => x.key !== key));
        return setAttachError("Couldn't take a picture of this screen.");
      }
      setPending((p) => p.map((x) => (x.key === key ? { ...x, url: URL.createObjectURL(shot) } : x)));
      const url = await uploadFor(draft.id, async () => shot);
      setPending((p) => p.filter((x) => x.key !== key));
      if (url) addUrl(url, true);
      else setAttachError("A picture is still trying to send; see the bar at the bottom right.");
    }, 60);
  }
  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col gap-1.5 px-3.5 pb-1.5 pt-0.5">
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
      <div
        ref={xpBox}
        className="flex shrink-0 items-center gap-1.5"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowDown") {
            // Up and down from the current XP, past 3 too.
            e.preventDefault();
            const up = e.key === "ArrowRight" || e.key === "ArrowUp";
            onChange({ xp: Math.max(0, Math.min(99, xp + (up ? 1 : -1))), xpPicked: true });
            requestAnimationFrame(() => xpBox.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
          } else if (e.key === "Tab" && !e.shiftKey && submitBtn.current && !submitBtn.current.disabled) {
            e.preventDefault();
            submitBtn.current.focus();
          } else if ((e.key === "Enter" || e.key.toLowerCase() === "s") && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
      <Segmented
        label="XP you earn"
        lead="XP"
        small
        isAdventure={isAdventure}
        value={xp}
        onChange={(n) => {
          onChange({ xp: n, xpPicked: true });
          // Straight on to writing.
          textRef.current?.focus();
        }}
        // Past three paragraphs, the note's own count takes the +3's place (no extra button).
        options={[...new Set([...XP_CHOICES.filter((n) => !(long > 3 && n === 3)), ...(long > 3 ? [long] : []), ...(xp > 3 && xp !== long ? [xp] : [])])].sort((a, b) => a - b).map((n) => ({ value: n, label: `+${n}`, hint: n > 3 ? `${n} paragraphs, ${n} XP` : `Earn ${n} XP for this feedback` }))}
      />
      {compact && (
        // Phones: when it gets built, as one small chip right of the XP.
        <label className="relative flex h-8 min-w-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold" style={{ border: "1px solid var(--t-panel-border)", color: "var(--t-ink)" }} title="When it gets built">
          <span className="truncate">deploys: {WHEN.find(([k]) => k === draft.kind)?.[1].toLowerCase()}</span>
          <span aria-hidden className="text-[10px] opacity-60">▾</span>
          <select aria-label="When it gets built" value={draft.kind} onChange={(e) => onChange({ kind: e.target.value as WhenKind })} className="absolute inset-0 cursor-pointer text-[16px] opacity-0">
            {WHEN.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      </div>
      <div className="relative flex min-h-[72px] flex-1 flex-col">
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
        // The box keeps its size while you write (the text scrolls); only you resize it.
        onChange={(e) => onChange({ body: e.target.value })}
        onKeyDown={(e) => {
          // Ctrl/⌘+Enter or Ctrl/⌘+S sends it (never the browser's "Save page").
          if ((e.key === "Enter" || e.key.toLowerCase() === "s") && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
          // Tab: on to the XP (arrows change it), and Tab again to Submit.
          if (e.key === "Tab" && !e.shiftKey) {
            const xpOn = xpBox.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? xpBox.current?.querySelector<HTMLButtonElement>("button");
            if (xpOn) {
              e.preventDefault();
              xpOn.focus();
            }
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
      <div className="-mt-0.5 flex shrink-0 flex-wrap items-center gap-1">
        {[...(draft.shot ? [{ url: draft.shot, label: "Screen picture", remove: () => onChange({ shot: null }) }] : []), ...(draft.images ?? []).map((u, i) => ({ url: u, label: (draft.images ?? []).length > 1 ? `Image ${i + 1}` : "Image", remove: () => onChange({ images: (draft.images ?? []).filter((x) => x !== u) }) }))].map((a) => (
          <span key={a.url} className="relative">
            <button type="button" onClick={() => setViewing(a.url)} className="block h-11 w-11 overflow-hidden rounded-md" style={{ border: "1px solid var(--t-panel-border)", boxShadow: "0 1px 3px rgba(60,40,10,.25)" }} title={`${a.label}: see it full size`} aria-label={`${a.label}: see it full size`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="" className="h-full w-full object-cover" />
            </button>
            <button type="button" onClick={a.remove} aria-label={`Remove ${a.label.toLowerCase()}`} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[13px] leading-none" style={{ background: "rgba(40,28,12,.85)", color: "#f6ecd2" }}>
              <CloseIcon size={9} />
            </button>
          </span>
        ))}
        {pending.map((p) => (
          <span key={p.key} className="card-pop-in relative block h-11 w-11 overflow-hidden rounded-md" style={{ border: "1px dashed var(--t-panel-border)", background: "rgba(255,250,235,.5)" }} title="Sending in the background: keep writing">
            {p.url && (
              // eslint-disable-next-line @next/next/no-img-element -- the picture on this device, until its upload lands
              <img src={p.url} alt="" className="h-full w-full object-cover opacity-70" />
            )}
            <span aria-hidden className="absolute inset-0 m-auto h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: "rgba(138,97,22,.25)", borderTopColor: "#8a6116" }} />
          </span>
        ))}
        {attachError && <span className="text-[12.5px]" style={{ color: "var(--t-warn)" }}>{attachError}</span>}
        <span className="ml-auto flex items-center gap-1">
        {(draft.shot ? 1 : 0) + (draft.images ?? []).length < 5 && (
          <button
            type="button"
            onClick={snapScreen}
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
        {/* Submit sits right under the writing. */}
        <button
          ref={submitBtn}
          type="button"
          onClick={submit}
          disabled={saving || !draft.body.trim()}
          title="Submit feedback (Ctrl + Enter)"
          className="hover-glow ml-1 h-8 shrink-0 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50"
          style={{
            background: isAdventure ? "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)" : "var(--t-accent)",
            color: isAdventure ? "#2a1c10" : "#fff",
            border: isAdventure ? "1.5px solid #6b4a12" : undefined,
          }}
        >
          {saving ? "Sending…" : "Submit"}
        </button>
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
          <div role="dialog" aria-label="Attachment" className="fixed inset-0 z-[133] flex items-center justify-center p-4" style={{ background: "rgba(10,8,14,.82)" }} onClick={() => setViewing(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- attachment, full size */}
            <img src={viewing} alt="Attachment, full size" className="max-h-full max-w-full rounded-lg object-contain" style={{ boxShadow: "0 12px 40px rgba(0,0,0,.6)" }} />
            <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-[22px]" style={{ background: "rgba(255,255,255,.15)", color: "#fff" }}>
              <CloseIcon size={13} />
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
            className={`whitespace-nowrap rounded-full font-semibold transition-[background,box-shadow] duration-150 ${small ? "h-[26px] px-2 text-[12.5px]" : "h-[34px] flex-auto px-2.5 text-[13.5px]"}`}
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


/**
 * Pictures still sending (or that need a retry), as a small bar at the bottom
 * right. × hides the bar; the upload carries on.
 */
export function UploadBar() {
  const list = useSyncExternalStore(subscribeUploads, uploadsNow, uploadsServer);
  const [hiddenFor, setHiddenFor] = useState<string>("");
  const key = list.map((u) => `${u.id}:${u.state}`).join("|");
  if (!list.length || hiddenFor === key) return null;
  const failed = list.filter((u) => u.state === "failed");
  return createPortal(
    <div role="status" data-feedback-root className="card-pop-in fixed bottom-[calc(16px+env(safe-area-inset-bottom))] right-3 z-[90] flex w-[230px] flex-col gap-1.5 rounded-xl px-3 py-2 shadow-xl" style={{ background: "rgba(22,26,44,.95)", border: "1.5px solid rgba(217,180,95,.6)", color: "#f1ead2" }}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[12.5px] font-semibold">
          {failed.length ? `${failed.length === 1 ? "A picture" : `${failed.length} pictures`} didn't send` : `Sending ${list.length === 1 ? "picture" : `${list.length} pictures`}…`}
        </span>
        {failed.length > 0 && (
          <button type="button" onClick={() => failed.forEach((u) => u.retry())} className="h-6 rounded-full px-2.5 text-[12px] font-bold" style={{ background: "var(--t-gold, #d9b45f)", color: "#2a1c10" }}>
            Retry
          </button>
        )}
        <button type="button" onClick={() => setHiddenFor(key)} aria-label="Hide (it keeps sending)" title="Hide (it keeps sending)" className="flex h-6 w-6 items-center justify-center rounded-full text-[16px] leading-none" style={{ color: "rgba(241,234,210,.75)" }}>
          <CloseIcon size={10} />
        </button>
      </div>
      {!failed.length && (
        <span className="upload-bar block h-1 w-full overflow-hidden rounded-full" style={{ background: "rgba(241,234,210,.15)" }}>
          <span className="block h-full w-1/3 rounded-full" style={{ background: "linear-gradient(90deg, #b8913f, #e2bf63)" }} />
        </span>
      )}
    </div>,
    document.body
  );
}
