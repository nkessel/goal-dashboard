/**
 * True when an event started inside the feedback box or its button. Opening or
 * using feedback must never close or change anything else on the screen, so
 * "tap outside closes it" and Escape handlers ignore these events.
 */
export function fromFeedback(e: Event): boolean {
  const t = e.target;
  return t instanceof Element && !!t.closest("[data-feedback-root]");
}
