"use client";

import { keyboardUp } from "@/lib/keyboard-up";
import { useEffect } from "react";

/**
 * Keeps the screen still when the on-screen keyboard opens and closes, app-wide.
 *
 * The keyboard slides over the page without resizing it (iPhone always,
 * Android through `interactiveWidget` in the root layout). What used to make
 * things jump was everything reacting to it: the browser panning the whole
 * screen up to the field, popups being squeezed into the strip above the
 * keyboard, and then sprung back when it closed. Now:
 *
 *  - Typing in a popup, the browser isn't allowed to pan the screen (the field
 *    is focused as if it were already in view, and the page stays at the top
 *    while the popup is open). Nothing moves or changes size.
 *  - If the keyboard covers the field, only the popup's own scrolling area
 *    scrolls it into sight, with a little room added at its bottom (invisible)
 *    so even its last field can be lifted above the keyboard.
 *
 * It still publishes the visible part of the screen, for the few things that
 * fit themselves (the toucan chat, the feedback box, the + sheet):
 *   --vvh     visible height (px)
 *   --vv-top  how far the visible area is scrolled down (px)
 *   html[data-kb]      the keyboard is up
 *   html[data-typing]  a text field has focus on a touch screen (bottom bar,
 *                      + button and feedback button step aside)
 * Inside [data-kb-self] the popup makes its own room; fields are only scrolled.
 *
 * Under the keyboard: nothing of ours (owner, Nov 9). An earlier dark ground there (Nov 6) is gone.
 */
export function KeyboardViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const touch = window.matchMedia("(pointer: coarse)").matches;

    const kbUp = () => !!vv && keyboardUp();

    // ── The dark ground under the keyboard ──────────────────────────────────
    let lastKbH = 0; // the visible height the last time the keyboard was up
    // No ground under the keyboard, ever (owner, Nov 9: "the green thing behind the keyboard shouldn't
    // ever show up"): the keyboard sits on whatever the page has under it, as iOS draws it.
    const coverAt = (top: number) => {
      void top;
    };
    const uncover = () => root.removeAttribute("data-kb-cover");
    let seenUp = false; // the keyboard has reported its size since the cover went down
    // The ground is laid only while a text field has focus AND the keyboard is really on screen, right
    // under it, and it goes the moment either stops (owner, Nov 9: a dark band stayed after the keyboard
    // closed, and showed before it arrived). As the keyboard slides down it's taken away at once.
    const placeCover = () => {
      if (!vv || !touch) return;
      if (kbUp() && isTextField(document.activeElement)) {
        if (seenUp && vv.height > lastKbH + 80) {
          // Growing fast: the keyboard is on its way down.
          lastKbH = vv.height;
          uncover();
          return;
        }
        seenUp = true;
        lastKbH = vv.height;
        coverAt(vv.offsetTop + vv.height);
      } else {
        seenUp = false;
        uncover();
      }
    };

    // Applied once the keyboard has settled, not on every frame of its slide
    // (and small scroll nudges while it's up don't move anything).
    let applied = { kb: false, h: 0, top: 0 };
    let quiet: number | undefined;
    const apply = () => {
      if (!vv) return;
      const kb = kbUp();
      const h = Math.round(vv.height);
      const top = Math.round(vv.offsetTop);
      const changed = kb !== applied.kb || Math.abs(h - applied.h) >= 24 || Math.abs(top - applied.top) >= 24;
      if (changed) {
        applied = { kb, h, top };
        root.style.setProperty("--vvh", `${h}px`);
        root.style.setProperty("--vv-top", `${top}px`);
        if (kb) root.setAttribute("data-kb", "");
        else root.removeAttribute("data-kb");
      }
      if (kb) reveal();
      else {
        releaseRoom();
        if (!isTextField(document.activeElement)) releaseLayers();
        // The keyboard has settled down: a page held for the feedback box gets its scroll back.
        if (pinned && !root.classList.contains("scroll-locked") && !feedbackHeld()) unpin();
      }
    };
    const update = () => {
      placeCover();
      window.clearTimeout(quiet);
      quiet = window.setTimeout(apply, 120);
    };

    const isTextField = (el: EventTarget | null): el is HTMLElement => {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (el.isContentEditable || el instanceof HTMLTextAreaElement) return !(el as HTMLTextAreaElement).readOnly;
      return (
        el instanceof HTMLInputElement &&
        !el.readOnly &&
        !["range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image", "hidden", "date", "time", "datetime-local", "month", "week"].includes(el.type)
      );
    };
    /** The fixed layer (popup, sheet, box) a field sits in, if any. */
    const fixedLayer = (el: HTMLElement): HTMLElement | null => {
      for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
        if (getComputedStyle(n).position === "fixed") return n;
      }
      return null;
    };
    const inPopup = (el: HTMLElement) => root.classList.contains("scroll-locked") && !!fixedLayer(el);
    // The feedback box floats over any screen without locking it: typing there holds the page
    // still too (else iPhone pans Today up to the box and drops it back as the keyboard closes).
    const inFeedback = (el: HTMLElement) => !!el.closest("[data-feedback-root]");
    const steadied = (el: HTMLElement) => inPopup(el) || inFeedback(el);
    // Still typing in the feedback box, or its keyboard still on its way down.
    const feedbackHeld = () => {
      const a = document.activeElement;
      return (a instanceof HTMLElement && inFeedback(a)) || kbUp();
    };

    // ── Keep the page at the top while you type in a popup ──────────────────
    // (the way React Aria does it): the page behind is held in place by a
    // negative margin rather than its scroll position, so there's nothing for
    // the browser to pan; any pan it tries anyway is put straight back.
    let pinned: { x: number; y: number; margin: string } | null = null;
    const holdTop = () => {
      if (vv && vv.scale > 1.05) return; // pinch-zoomed: let it pan
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    };
    const pin = () => {
      if (pinned) return;
      pinned = { x: window.scrollX, y: window.scrollY, margin: document.body.style.marginTop };
      document.body.style.marginTop = `-${pinned.y}px`;
      window.scrollTo(0, 0);
      window.addEventListener("scroll", holdTop);
    };
    const unpin = () => {
      if (!pinned) return;
      window.removeEventListener("scroll", holdTop);
      document.body.style.marginTop = pinned.margin;
      window.scrollTo(pinned.x, pinned.y);
      pinned = null;
    };
    // The popup closed: give the page its scroll position back.
    const lockWatch = new MutationObserver(() => {
      if (!root.classList.contains("scroll-locked") && !feedbackHeld()) unpin();
    });
    lockWatch.observe(root, { attributes: true, attributeFilter: ["class"] });
    // Writing feedback while looking around: touching or scrolling the page outside the box gives it
    // its scroll back (owner, Nov 3: "trying to scroll down just jumped right back").
    const outside = (e: Event) => {
      if (!pinned || root.classList.contains("scroll-locked")) return;
      const t = e.target;
      if (t instanceof Element && t.closest("[data-feedback-root]")) return;
      const a = document.activeElement;
      if (a instanceof HTMLElement && inFeedback(a)) unpin();
    };
    document.addEventListener("touchstart", outside, { passive: true, capture: true });
    document.addEventListener("wheel", outside, { passive: true, capture: true });

    // Focus a field as if it were already at the top of the screen, so the
    // browser has no reason to pan; the transform is gone a frame later.
    const focusSteady = (el: HTMLElement) => {
      pin();
      // The feedback box and the welcome screen (data-kb-plain) hold their own size; the
      // off-screen trick below made iPhones flash and lag, so they're focused plainly.
      if (el.closest("[data-feedback-root], [data-kb-plain], [data-kb-fit]")) {
        if (document.activeElement !== el) el.focus({ preventScroll: true });
        return;
      }
      const prev = el.style.transform;
      el.style.transform = "translateY(-2000px)";
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        el.style.transform = prev;
      });
    };

    let touchStart: { x: number; y: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStart = t ? { x: t.clientX, y: t.clientY } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const el = e.target;
      if (!isTextField(el) || el === document.activeElement || !steadied(el)) return;
      if ((el as HTMLInputElement).disabled) return;
      const t = e.changedTouches[0];
      // A swipe that started on a field scrolls; it doesn't open the keyboard.
      if (!t || !touchStart || Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y) > 10) return;
      e.preventDefault();
      focusSteady(el);
    };

    // ── Lift a covered field into sight inside its own popup ────────────────
    const added = new Map<HTMLElement, { extra: number; inline: string }>();
    const scrollerOf = (el: HTMLElement, layer: HTMLElement): HTMLElement | null => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (/(auto|scroll)/.test(s.overflowY) && n.clientHeight > 0) return n;
        if (n === layer) break;
      }
      return null;
    };
    const reveal = () => {
      const el = document.activeElement;
      if (!vv || !isTextField(el)) return;
      const layer = fixedLayer(el);
      if (!layer) return;
      const visTop = vv.offsetTop;
      const kbTop = vv.offsetTop + vv.height;
      const r = el.getBoundingClientRect();
      if (r.top >= visTop + 8 && r.bottom <= kbTop - 12) return; // already in sight
      const box = scrollerOf(el, layer);
      if (!box) return;
      const b = box.getBoundingClientRect();
      // Room at the bottom of the scrolling area, as tall as the part the keyboard hides.
      // (Not where the popup fits itself and adds its own.)
      const need = el.closest("[data-kb-self]") ? 0 : Math.max(0, Math.ceil(b.bottom - kbTop));
      const had = added.get(box);
      if (need > (had?.extra ?? 0)) {
        const base = parseFloat(getComputedStyle(box).paddingBottom) - (had?.extra ?? 0);
        added.set(box, { extra: need, inline: had ? had.inline : box.style.paddingBottom });
        box.style.paddingBottom = `${base + need}px`;
      }
      const top = Math.max(b.top, visTop);
      const bottom = Math.min(b.bottom, kbTop);
      const want = top + Math.max(8, (bottom - top - r.height) / 3);
      box.scrollBy({ top: r.top - want, behavior: "smooth" });
    };
    // Keyboard down: take the extra room away again, gliding back first if it's in use.
    const releaseRoom = () => {
      added.forEach(({ extra, inline }, box) => {
        added.delete(box);
        const drop = () => {
          box.style.paddingBottom = inline;
        };
        if (!box.isConnected) return;
        const maxAfter = box.scrollHeight - extra - box.clientHeight;
        if (box.scrollTop <= maxAfter + 1) return drop();
        box.scrollTo({ top: Math.max(0, maxAfter), behavior: "smooth" });
        window.setTimeout(drop, 320);
      });
    };

    // ── Hold full-screen layers at their size while typing ───────────────────
    // Some phone browsers (Chrome on iPhone among them) shrink the layout itself
    // when the keyboard opens, so every full-screen popup (inset: 0) got shorter,
    // re-centred its card and showed the page under it, then sprang back as the
    // keyboard closed (owner's recording, Nov 1, 22:05). While a field has focus,
    // each one keeps the height it had; it's let go once the keyboard is down.
    const held = new Map<HTMLElement, { height: string; bottom: string }>();
    const holdLayers = () => {
      const h = window.innerHeight;
      document.querySelectorAll<HTMLElement>("body *").forEach((n) => {
        if (held.has(n) || n.closest("[data-feedback-root], [data-welcome-root], [data-kb-fit]")) return;
        const cs = getComputedStyle(n);
        if (cs.position !== "fixed" || cs.top !== "0px" || cs.bottom !== "0px") return;
        held.set(n, { height: n.style.height, bottom: n.style.bottom });
        n.style.height = `${h}px`;
        n.style.bottom = "auto";
      });
    };
    const releaseLayers = () => {
      held.forEach((v, n) => {
        n.style.height = v.height;
        n.style.bottom = v.bottom;
      });
      held.clear();
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!isTextField(el)) return;
      if (touch) {
        if (!kbUp()) holdLayers();
        root.setAttribute("data-typing", "");
        // Already up (moving between fields): the ground stays under it. Otherwise it waits for the
        // keyboard to arrive (no guessing ahead, which showed a band before the keyboard came).
        if (vv && vv.scale < 1.1 && kbUp()) coverAt(vv.offsetTop + vv.height);
        // Moving between fields with the keyboard's arrows: same steadying as a tap.
        if (steadied(el)) focusSteady(el);
      }
      // Already up (moving between fields): bring the new one into sight now.
      if (kbUp()) window.setTimeout(reveal, 60);
    };
    // Safety net (owner's recording, Nov 8: a sheet stayed stretched after the keyboard closed, once
    // focus had moved to a file picker): with no text field focused, held layers are let go a moment
    // later whatever the keyboard reports, and again when the app comes back to the front.
    let sweep: number | undefined;
    const sweepSoon = () => {
      window.clearTimeout(sweep);
      sweep = window.setTimeout(() => {
        if (isTextField(document.activeElement)) return;
        root.removeAttribute("data-typing");
        if (!kbUp()) root.removeAttribute("data-kb");
        uncover();
        releaseLayers();
      }, 700);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") sweepSoon();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", sweepSoon);
    // A focused field that unmounts fires no focusout, which left the bottom bar hidden:
    // while "typing", check now and then that a text field really still has focus.
    const stuckTimer = window.setInterval(() => {
      if (root.hasAttribute("data-typing") && !isTextField(document.activeElement)) sweepSoon();
    }, 1500);
    const onFocusOut = () => {
      sweepSoon();
      // Done on the keyboard: the ground goes with it at once.
      requestAnimationFrame(() => {
        if (!isTextField(document.activeElement)) uncover();
      });
      // Moving straight to another field keeps the typing state.
      window.setTimeout(() => {
        if (!isTextField(document.activeElement)) {
          root.removeAttribute("data-typing");
          uncover();
          if (!kbUp()) releaseLayers();
        }
        // No keyboard ever came up (or it's already down): let go of the page now.
        if (pinned && !root.classList.contains("scroll-locked") && !feedbackHeld()) unpin();
      }, 60);
    };

    apply();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    if (touch) {
      document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
      document.addEventListener("touchend", onTouchEnd, { passive: false, capture: true });
    }
    return () => {
      window.clearTimeout(quiet);
      window.clearTimeout(sweep);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", sweepSoon);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.clearInterval(stuckTimer);
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      document.removeEventListener("touchstart", outside, { capture: true });
      document.removeEventListener("wheel", outside, { capture: true });
      lockWatch.disconnect();
      releaseLayers();
      unpin();
      root.removeAttribute("data-kb");
      root.removeAttribute("data-typing");
      uncover();
    };
  }, []);
  return null;
}
