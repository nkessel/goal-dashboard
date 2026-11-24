import { getQuestForEditAction, toucanWatchAction } from "@/app/actions";
import { openFocusMode } from "@/lib/focus-timer";
import { afternoonCheckAt, type GuideTask } from "@/lib/toucan-guide";

/** Open a quest in focus mode for a short first stretch. */
export async function beginQuest(id: string) {
  const q = await getQuestForEditAction(id).catch(() => null);
  if (q) openFocusMode({ ...q, estimate_minutes: 15 });
}

/** Opens the toucan's guide sheet (optionally straight to planning one quest, or to the coursework catch-up). */
/** Runs it now, or once the welcome screen (which has its own toucan) has closed: one toucan at a time. */
/**
 * Waits until you're free: no popup open, not typing, and nothing touched for a little while
 * (owner, Nov 6: "be more responsive to my inquiries rather than bothering me when I'm trying to do something else").
 */
let lastActive = 0;
let watchingActivity = false;
function busyNow() {
  if (typeof document === "undefined") return true;
  const root = document.documentElement;
  if (root.hasAttribute("data-welcome-open") || root.hasAttribute("data-fog")) return true;
  if (document.querySelector('[role="dialog"]:not([hidden]), [aria-modal="true"]:not([hidden])')) return true;
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return true;
  return Date.now() - lastActive < 20_000;
}
export function whenFree(fn: () => void) {
  if (!watchingActivity && typeof window !== "undefined") {
    watchingActivity = true;
    const mark = () => {
      lastActive = Date.now();
    };
    for (const ev of ["pointerdown", "keydown", "wheel", "touchmove", "input"]) window.addEventListener(ev, mark, { passive: true, capture: true });
    lastActive = Date.now();
  }
  if (!busyNow()) return fn();
  const t = setInterval(() => {
    if (busyNow()) return;
    clearInterval(t);
    fn();
  }, 4000);
}

export function whenNoWelcome(fn: () => void) {
  const open = () => document.documentElement.hasAttribute("data-welcome-open");
  if (!open()) return fn();
  const t = setInterval(() => {
    if (open()) return;
    clearInterval(t);
    setTimeout(fn, 1500);
  }, 1000);
}

/**
 * One look at what the toucan should watch for, shared: three parts of him asked for it separately
 * on every arrival (and on every return to the tab), and server actions run one at a time, so each
 * one held up whatever you tapped. It also waits until the welcome screen and its fog are gone
 * (his notes can't show before then anyway), so the first screen opens first.
 */
const watchCache = new Map<string, { at: number; p: Promise<Awaited<ReturnType<typeof toucanWatchAction>> | null> }>();
// A quest changed (done, a new due date from the chat…): what he knew is stale.
if (typeof window !== "undefined") {
  window.addEventListener("toucan-refresh", () => watchCache.clear());
  window.addEventListener("toucan-tasks-changed", () => watchCache.clear());
}
/** Is this quest still open and due later today? Asked fresh, just before he says so (his note once said "due today" about a quest moved to Monday). */
export async function stillDueToday(id: string) {
  const w = await toucanWatchAction({ guesses: false }).catch(() => null);
  const t = (w?.tasks as GuideTask[] | undefined)?.find((x) => x.id === id);
  return !!(t?.due_at && afternoonCheckAt(t.due_at));
}
/** Is this quest still open? */
export async function stillOpen(id: string) {
  const w = await toucanWatchAction({ guesses: false }).catch(() => null);
  return !!(w?.tasks as GuideTask[] | undefined)?.some((x) => x.id === id);
}
export function sharedWatch(opts: { guesses?: boolean } = {}) {
  const key = opts.guesses === false ? "plain" : "guesses";
  const hit = watchCache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.p;
  const p = new Promise<void>((done) => {
    const busy = () => document.documentElement.hasAttribute("data-welcome-open") || document.documentElement.hasAttribute("data-fog");
    if (!busy()) return done();
    const t = setInterval(() => {
      if (busy()) return;
      clearInterval(t);
      done();
    }, 1000);
  }).then(() => toucanWatchAction(opts).catch(() => null));
  watchCache.set(key, { at: Date.now(), p });
  return p;
}
