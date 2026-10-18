"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

type ViewKind = "day" | "3day" | "week" | "next7" | "month";
const ORDER: Record<ViewKind, number> = { day: 0, "3day": 1, week: 2, next7: 2, month: 3 };
const TABS: { v: ViewKind; label: string }[] = [
  { v: "day", label: "Day" },
  { v: "3day", label: "3 days" },
  { v: "week", label: "Week" },
  { v: "month", label: "Month" },
];

/** The direction the next calendar change should slide (set just before navigating). */
let nextDir: "left" | "right" | "fade" | null = null;

/**
 * Keep a picture of what's showing now, so it can slide away while the new
 * range slides in from the other side once it arrives.
 */
function prepareSlide(dir: "left" | "right" | "fade") {
  nextDir = dir;
  const box = document.querySelector<HTMLElement>("[data-cal-slide]");
  const current = box?.querySelector<HTMLElement>(":scope > [data-cal-page]");
  if (!box || !current) return;
  box.querySelectorAll(":scope > [data-cal-ghost]").forEach((n) => n.remove());
  const ghost = current.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("data-cal-page");
  ghost.setAttribute("data-cal-ghost", "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.cssText = "position:absolute;inset:0 0 auto 0;pointer-events:none;z-index:2;";
  box.appendChild(ghost);
  // If the page never changes (an error, the same range), don't leave it hanging.
  window.setTimeout(() => ghost.isConnected && ghost.remove(), 6000);
}

/** View tabs, the "Next 7 days" switch on the week, and prev / Today / next. */
export function CalendarNav({
  view,
  dateKey,
  todayKey,
  heading,
  prevHref,
  nextHref,
  isAdventure,
}: {
  view: ViewKind;
  dateKey: string;
  todayKey: string;
  heading: string;
  prevHref: string;
  nextHref: string;
  isAdventure: boolean;
}) {
  const router = useRouter();
  const go = (href: string, dir: "left" | "right" | "fade") => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    prepareSlide(dir);
    void href;
  };
  const warm = (href: string) => () => router.prefetch(href);
  const tabHref = (v: ViewKind) => `/calendar?view=${v}&date=${dateKey}`;
  const weekish = view === "week" || view === "next7";
  const todayHref = `/calendar?view=${view}&date=${todayKey}`;
  const ink = isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)";

  return (
    <>
      <div
        className="flex rounded-full p-1"
        style={{ background: isAdventure ? "var(--t-nav-bg)" : "var(--t-accent-soft)", border: isAdventure ? "1px solid rgba(209,161,60,.35)" : undefined }}
      >
        {TABS.map(({ v, label }) => {
          const active = v === view || (v === "week" && view === "next7");
          const target = v === "week" && view === "next7" ? "next7" : v;
          return (
            <Link
              key={v}
              href={tabHref(target)}
              onClick={go(tabHref(target), ORDER[v] === ORDER[view] ? "fade" : ORDER[v] > ORDER[view] ? "left" : "right")}
              onPointerEnter={warm(tabHref(target))}
              className={`flex-1 rounded-full py-1.5 text-center text-xs font-semibold transition-colors duration-200 ${isAdventure ? "font-display" : ""}`}
              style={{
                background: active ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "transparent",
                color: active ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-nav-inactive)" : "var(--t-ink-soft)",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Link href={prevHref} onClick={go(prevHref, "right")} onPointerEnter={warm(prevHref)} aria-label="Previous" className="flex h-9 w-9 items-center justify-center rounded-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 5l-7 7 7 7" stroke={ink} strokeWidth="2" fill="none" />
          </svg>
        </Link>
        <div className="flex flex-col items-center gap-0.5">
          <span className={isAdventure ? "font-display text-sm" : "text-sm font-semibold"} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
            {heading}
          </span>
          <div className="flex items-center gap-2">
            <Link
              href={todayHref}
              onClick={go(todayHref, todayKey === dateKey ? "fade" : todayKey > dateKey ? "left" : "right")}
              className="text-[11px] underline"
              style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-accent)" }}
            >
              Today
            </Link>
            {weekish && (
              // The week view's own switch: the calendar week, or the next 7 days from the chosen day.
              <Link
                href={tabHref(view === "next7" ? "week" : "next7")}
                onClick={go(tabHref(view === "next7" ? "week" : "next7"), "fade")}
                onPointerEnter={warm(tabHref(view === "next7" ? "week" : "next7"))}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={
                  view === "next7"
                    ? { background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }
                    : { border: `1px solid ${isAdventure ? "rgba(209,161,60,.55)" : "var(--t-card-border)"}`, color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }
                }
                aria-pressed={view === "next7"}
              >
                7 days
              </Link>
            )}
          </div>
        </div>
        <Link href={nextHref} onClick={go(nextHref, "left")} onPointerEnter={warm(nextHref)} aria-label="Next" className="flex h-9 w-9 items-center justify-center rounded-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M9 5l7 7-7 7" stroke={ink} strokeWidth="2" fill="none" />
          </svg>
        </Link>
      </div>
    </>
  );
}

/**
 * The calendar body. When the range or view changes, the old picture slides
 * out one way while the new one slides in from the other.
 */
export function CalendarSlide({ slideKey, children }: { slideKey: string; children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const box = boxRef.current;
    if (!box) return;
    const dir = nextDir ?? "fade";
    nextDir = null;
    const page = box.querySelector<HTMLElement>(":scope > [data-cal-page]");
    const ghost = box.querySelector<HTMLElement>(":scope > [data-cal-ghost]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      ghost?.remove();
      return;
    }
    const opts: KeyframeAnimationOptions = { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" };
    if (dir === "fade") {
      page?.animate([{ opacity: 0, transform: "scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
      ghost?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out" }).finished.then(() => ghost.remove(), () => ghost.remove());
      return;
    }
    const out = dir === "left" ? "-100%" : "100%";
    const inn = dir === "left" ? "100%" : "-100%";
    page?.animate([{ transform: `translateX(${inn})`, opacity: 0.4 }, { transform: "none", opacity: 1 }], opts);
    if (ghost) ghost.animate([{ transform: "none", opacity: 1 }, { transform: `translateX(${out})`, opacity: 0.2 }], opts).finished.then(() => ghost.remove(), () => ghost.remove());
  }, [slideKey]);
  return (
    <div ref={boxRef} data-cal-slide className="relative overflow-hidden">
      <div data-cal-page>{children}</div>
    </div>
  );
}
