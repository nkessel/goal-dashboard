"use client";

/**
 * Is the on-screen keyboard up? Safari on iPhone keeps the page's height and shrinks only the
 * visual viewport, but Chrome on iPhone shrinks the page itself too (window.innerHeight drops with
 * it), so "page height minus visible height" never saw its keyboard (owner's recording, Nov 7: the
 * packing window stayed where it was and was cut off at the keyboard, and the page jumped behind it).
 * So the visible height is also compared with the tallest the screen has been while nothing was
 * being typed (reset when the width changes, e.g. turning the phone).
 */
let tallest = 0;
let width = 0;

const typing = () => {
  const a = document.activeElement;
  return !!a && (a instanceof HTMLTextAreaElement || (a instanceof HTMLElement && a.isContentEditable) || (a instanceof HTMLInputElement && !["range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image", "hidden"].includes(a.type)));
};

export function keyboardUp(): boolean {
  const vv = window.visualViewport;
  if (!vv || vv.scale >= 1.1) return false;
  const seen = vv.height * vv.scale;
  if (window.innerWidth !== width) {
    width = window.innerWidth;
    tallest = 0;
  }
  if (!typing()) tallest = Math.max(tallest, window.innerHeight, seen);
  else if (!tallest) tallest = window.innerHeight;
  return window.innerHeight - seen > 120 || tallest - seen > 120;
}

// Keep the measure current while nothing is focused, so it's ready the moment a field is tapped.
if (typeof window !== "undefined") {
  const note = () => void keyboardUp();
  window.visualViewport?.addEventListener("resize", note);
  window.addEventListener("resize", note);
  window.addEventListener("orientationchange", () => {
    tallest = 0;
  });
}
